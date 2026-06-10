"""AP2-style session spend mandate management."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from recipe_search_agent.repositories import SpendMandateRepository


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SpendMandateService:
    """Create, query, consume, and revoke session spend mandates."""

    def __init__(self, repository: SpendMandateRepository | None = None):
        self._repository = repository or SpendMandateRepository()

    def get_current_mandate(self, user_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_active_mandate(user_id)

    def create_mandate(
        self,
        *,
        user_id: str,
        ceiling_amount: int,
        currency_code: str = "USD",
        session_id: Optional[str] = None,
        source: str = "voice",
        expires_at: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        self._repository.revoke_active_mandates(user_id)
        return self._repository.create_mandate(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "session_id": session_id,
                "ceiling_amount": ceiling_amount,
                "currency_code": currency_code,
                "consumed_amount": 0,
                "status": "active",
                "source": source,
                "expires_at": expires_at,
                "metadata": metadata or {},
            }
        )

    def revoke_current_mandate(self, user_id: str) -> list[dict[str, Any]]:
        return self._repository.revoke_active_mandates(user_id)

    def can_charge(self, user_id: str, amount: int) -> tuple[bool, Optional[dict[str, Any]], str]:
        """Return (allowed, mandate, reason)."""
        mandate = self._repository.get_active_mandate(user_id)
        if not mandate:
            return False, None, "no_active_mandate"
        remaining = mandate["ceiling_amount"] - mandate["consumed_amount"]
        if amount > remaining:
            return False, mandate, "exceeds_ceiling"
        return True, mandate, "within_ceiling"

    def consume_mandate(self, mandate: dict[str, Any], amount: int) -> dict[str, Any]:
        new_consumed = mandate["consumed_amount"] + amount
        new_status = "exhausted" if new_consumed >= mandate["ceiling_amount"] else "active"
        updated = self._repository.update_mandate(
            mandate["id"],
            {
                "consumed_amount": new_consumed,
                "status": new_status,
                "updated_at": _utc_now_iso(),
            },
        )
        return updated or {**mandate, "consumed_amount": new_consumed, "status": new_status}
