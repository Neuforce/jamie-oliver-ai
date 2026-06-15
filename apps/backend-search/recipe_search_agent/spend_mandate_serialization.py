"""Shared spend mandate serialization helpers."""

from __future__ import annotations

from typing import Any


def serialize_spend_mandate(mandate: dict[str, Any]) -> dict[str, Any]:
    """Serialize mandate rows into API/event payload shape."""
    ceiling = mandate.get("ceiling_amount", 0)
    consumed = mandate.get("consumed_amount", 0)
    return {
        "id": mandate["id"],
        "userId": mandate["user_id"],
        "sessionId": mandate.get("session_id"),
        "ceilingAmount": ceiling,
        "currencyCode": mandate.get("currency_code", "USD"),
        "consumedAmount": consumed,
        "status": mandate.get("status", "active"),
        "source": mandate.get("source", "voice"),
        "grantedAt": mandate.get("granted_at"),
        "expiresAt": mandate.get("expires_at"),
        "remainingAmount": max(0, ceiling - consumed),
    }
