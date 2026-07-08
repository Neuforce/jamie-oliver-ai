"""Server-side purchase hold FSM for delayed commit / undo."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from recipe_search_agent.agent_action_receipts import AgentActionReceiptInput, record_agent_action_receipt
from recipe_search_agent.repositories import PurchaseHoldRepository

logger = logging.getLogger(__name__)

PURCHASE_HOLD_SECONDS = 30


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso_datetime(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class PurchaseHoldService:
    """Create and transition purchase holds using atomic state claims."""

    def __init__(self, repository: PurchaseHoldRepository | None = None):
        self._repository = repository or PurchaseHoldRepository()

    def create_hold(
        self,
        *,
        user_id: Optional[str],
        session_id: Optional[str],
        backend_recipe_id: str,
        price_amount: int,
        currency_code: str,
        ask_id: Optional[str] = None,
        mandate_id: Optional[str] = None,
        tool_call_id: Optional[str] = None,
        response_id: Optional[str] = None,
    ) -> dict[str, Any]:
        hold_expires_at = datetime.now(timezone.utc) + timedelta(seconds=PURCHASE_HOLD_SECONDS)
        return self._repository.create_hold(
            {
                "id": str(uuid4()),
                "user_id": user_id,
                "session_id": session_id,
                "backend_recipe_id": backend_recipe_id,
                "ask_id": ask_id,
                "mandate_id": mandate_id,
                "price_amount": int(price_amount),
                "currency_code": currency_code or "USD",
                "status": "holding",
                "hold_expires_at": hold_expires_at.isoformat(),
                "tool_call_id": tool_call_id,
                "response_id": response_id,
                "metadata": {},
            }
        )

    def get_hold(self, hold_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_hold(hold_id)

    def get_open_hold_for_session(self, session_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_open_hold_for_session(session_id)

    def commit_hold(self, hold_id: str) -> dict[str, Any]:
        hold = self.get_hold(hold_id)
        if not hold:
            return {"ok": False, "error": "hold_not_found"}

        status = hold.get("status")
        if status == "committed":
            return {"ok": True, "hold": hold, "already_committed": True}
        if status == "undone":
            return {"ok": False, "error": "already_undone", "hold": hold}
        if status == "failed":
            return {"ok": False, "error": "already_failed", "hold": hold}
        if status != "holding":
            return {"ok": False, "error": "already_failed", "hold": hold}

        hold_expires_at_raw = hold.get("hold_expires_at")
        if not hold_expires_at_raw:
            return {"ok": False, "error": "already_failed", "hold": hold}
        hold_expires_at = _parse_iso_datetime(str(hold_expires_at_raw))
        if datetime.now(timezone.utc) < hold_expires_at:
            return {"ok": False, "error": "not_yet_expired", "hold": hold}

        now_iso = _utc_now_iso()
        claimed = self._repository.claim_hold_transition(
            hold_id,
            from_status="holding",
            to_status="committed",
            extra_updates={"committed_at": now_iso},
        )
        if claimed:
            return {"ok": True, "hold": claimed}

        latest = self.get_hold(hold_id)
        if not latest:
            return {"ok": False, "error": "hold_not_found"}
        latest_status = latest.get("status")
        if latest_status == "committed":
            return {"ok": True, "hold": latest, "already_committed": True}
        if latest_status == "undone":
            return {"ok": False, "error": "already_undone", "hold": latest}
        if latest_status == "failed":
            return {"ok": False, "error": "already_failed", "hold": latest}
        return {"ok": False, "error": "not_yet_expired", "hold": latest}

    def undo_hold(
        self,
        hold_id: str,
        *,
        channel: str,
        decision_detail: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        hold = self.get_hold(hold_id)
        if not hold:
            return {"ok": False, "error": "hold_not_found"}

        status = hold.get("status")
        if status == "undone":
            return {"ok": True, "hold": hold, "already_undone": True}
        if status == "committed":
            return {"ok": False, "error": "already_committed", "hold": hold}
        if status == "failed":
            return {"ok": False, "error": "already_failed", "hold": hold}
        if status != "holding":
            return {"ok": False, "error": "already_failed", "hold": hold}

        now_iso = _utc_now_iso()
        claimed = self._repository.claim_hold_transition(
            hold_id,
            from_status="holding",
            to_status="undone",
            extra_updates={"undone_at": now_iso},
        )
        if claimed:
            try:
                record_agent_action_receipt(
                    AgentActionReceiptInput(
                        action_name="undo_purchase_hold",
                        kind="write",
                        channel=channel,
                        outcome="decline",
                        decision_detail=decision_detail,
                        backend_recipe_id=claimed.get("backend_recipe_id"),
                        ask_id=claimed.get("ask_id"),
                        standing_authorization_mandate_id=claimed.get("mandate_id"),
                        session_id=claimed.get("session_id"),
                        user_id=user_id or claimed.get("user_id"),
                        tool_call_id=claimed.get("tool_call_id"),
                        response_id=claimed.get("response_id"),
                        metadata={},
                    )
                )
            except Exception:
                logger.exception("Failed to record undo receipt for hold %s", hold_id)
            return {"ok": True, "hold": claimed}

        latest = self.get_hold(hold_id)
        if not latest:
            return {"ok": False, "error": "hold_not_found"}
        latest_status = latest.get("status")
        if latest_status == "undone":
            return {"ok": True, "hold": latest, "already_undone": True}
        if latest_status == "committed":
            return {"ok": False, "error": "already_committed", "hold": latest}
        if latest_status == "failed":
            return {"ok": False, "error": "already_failed", "hold": latest}
        return {"ok": False, "error": "already_failed", "hold": latest}
