"""Server-side spend mandate consent ask FSM (NEU-670)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from recipe_search_agent.repositories import SpendMandateAskRepository
from recipe_search_agent.spend_mandate_service import SpendMandateService

ASK_TTL_MINUTES = 5


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


class SpendMandateAskService:
    """Create and resolve consent asks; grant mints a spend mandate."""

    def __init__(
        self,
        repository: SpendMandateAskRepository | None = None,
        mandate_service: SpendMandateService | None = None,
    ):
        self._repository = repository or SpendMandateAskRepository()
        self._mandate_service = mandate_service or SpendMandateService()

    def create_ask(
        self,
        *,
        backend_recipe_id: str,
        price_amount: int,
        currency_code: str,
        ceiling_amount: int,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        tool_call_id: Optional[str] = None,
        response_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=ASK_TTL_MINUTES)
        return self._repository.create_ask(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "session_id": session_id,
                "backend_recipe_id": backend_recipe_id,
                "price_amount": price_amount,
                "currency_code": currency_code,
                "ceiling_amount": ceiling_amount,
                "status": "requested",
                "tool_call_id": tool_call_id,
                "response_id": response_id,
                "metadata": metadata or {},
                "expires_at": expires_at.isoformat(),
            }
        )

    def get_ask(self, ask_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_ask(ask_id)

    def get_open_ask_for_session(self, session_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_open_ask_for_session(session_id)

    def resolve_ask(
        self,
        ask_id: str,
        *,
        grant: bool,
        user_id: Optional[str] = None,
        source: str = "agentic",
    ) -> dict[str, Any]:
        ask = self._repository.get_ask(ask_id)
        if not ask:
            return {"ok": False, "error": "ask_not_found"}

        status = ask.get("status")
        if status in ("active", "declined", "expired"):
            mandate = None
            if ask.get("mandate_id"):
                mandate = self._mandate_service.get_current_mandate(user_id or ask.get("user_id") or "")
            return {
                "ok": True,
                "ask": ask,
                "mandate": mandate,
                "already_resolved": True,
            }

        if status != "requested":
            return {"ok": False, "error": "invalid_ask_state", "ask": ask}

        resolved_at = _utc_now_iso()
        expires_at_raw = ask.get("expires_at")
        if expires_at_raw:
            expires_at = _parse_iso_datetime(str(expires_at_raw))
            if expires_at <= datetime.now(timezone.utc):
                updated = self._repository.update_ask(
                    ask_id,
                    {"status": "expired", "resolved_at": resolved_at, "updated_at": resolved_at},
                )
                return {"ok": False, "error": "ask_expired", "ask": updated or ask}

        if not grant:
            updated = self._repository.update_ask(
                ask_id,
                {"status": "declined", "resolved_at": resolved_at, "updated_at": resolved_at},
            )
            return {"ok": True, "ask": updated or ask, "mandate": None}

        effective_user_id = user_id or ask.get("user_id")
        if not effective_user_id:
            return {"ok": False, "error": "user_id_required_for_grant", "ask": ask}

        mandate = self._mandate_service.create_mandate(
            user_id=effective_user_id,
            ceiling_amount=int(ask["ceiling_amount"]),
            currency_code=ask.get("currency_code") or "USD",
            session_id=ask.get("session_id"),
            source=source,
        )
        updated = self._repository.update_ask(
            ask_id,
            {
                "status": "active",
                "mandate_id": mandate["id"],
                "user_id": effective_user_id,
                "resolved_at": resolved_at,
                "updated_at": resolved_at,
            },
        )
        return {"ok": True, "ask": updated or ask, "mandate": mandate}
