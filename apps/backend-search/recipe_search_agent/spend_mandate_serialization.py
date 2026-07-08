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


def serialize_purchase_hold(hold: dict[str, Any]) -> dict[str, Any]:
    """Serialize purchase-hold rows into API/event payload shape."""
    return {
        "id": hold["id"],
        "userId": hold.get("user_id"),
        "sessionId": hold.get("session_id"),
        "backendRecipeId": hold.get("backend_recipe_id"),
        "priceAmount": int(hold.get("price_amount") or 0),
        "currencyCode": hold.get("currency_code") or "USD",
        "status": hold.get("status") or "holding",
        "askId": hold.get("ask_id"),
        "mandateId": hold.get("mandate_id"),
        "holdExpiresAt": hold.get("hold_expires_at"),
        "committedAt": hold.get("committed_at"),
        "undoneAt": hold.get("undone_at"),
        "purchaseId": hold.get("purchase_id"),
        "createdAt": hold.get("created_at"),
    }
