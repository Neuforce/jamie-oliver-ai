"""Provider-neutral payment adapter interface and Supertab implementation."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from svix.webhooks import Webhook, WebhookVerificationError


@dataclass
class ReconcileEvent:
    """Provider-neutral purchase completion event for entitlement reconciliation."""

    provider: str
    event_id: str
    event_type: str
    provider_purchase_id: str
    status: str
    content_key: Optional[str]
    recipe_slug_or_id: Optional[str]
    user_id: Optional[str]
    price_amount: Optional[int]
    currency_code: Optional[str]
    purchased_at: Optional[str]
    completed_at: Optional[str]
    provider_payload: dict[str, Any] = field(default_factory=dict)
    prior_entitlement: Optional[dict[str, Any]] = None


class PaymentProvider(Protocol):
    """Adapter seam for payment/commerce providers (Supertab, Stripe, UCP merchants, …)."""

    provider_name: str

    def verify_webhook(
        self,
        *,
        payload: bytes,
        headers: dict[str, str],
    ) -> dict[str, Any]:
        """Verify signature and return parsed event body."""
        ...

    def map_event(self, body: dict[str, Any], *, event_id: str) -> Optional[ReconcileEvent]:
        """Map a provider webhook body to a neutral reconcile event."""
        ...


class SupertabProvider:
    """Supertab payment provider adapter (Svix webhooks + purchase.completed mapping)."""

    provider_name = "supertab"

    def __init__(self, webhook_secret: Optional[str] = None):
        self._webhook_secret = webhook_secret or os.getenv("SUPERTAB_WEBHOOK_SECRET")

    def verify_webhook(
        self,
        *,
        payload: bytes,
        headers: dict[str, str],
    ) -> dict[str, Any]:
        if not self._webhook_secret:
            raise RuntimeError("SUPERTAB_WEBHOOK_SECRET is not configured")
        wh = Webhook(self._webhook_secret)
        try:
            return wh.verify(payload, headers)
        except WebhookVerificationError as exc:
            raise ValueError(f"Invalid Supertab webhook signature: {exc}") from exc

    def map_event(self, body: dict[str, Any], *, event_id: str) -> Optional[ReconcileEvent]:
        event_type = body.get("type") or ""
        if event_type not in ("purchase.completed", "onetime_offering.purchasing_completed"):
            return None

        data = body.get("data") or {}
        purchase = data.get("purchase") or data
        if not purchase or not purchase.get("id"):
            return None

        metadata = purchase.get("metadata") or {}
        price = purchase.get("price") or {}
        currency = price.get("currency") or {}
        entitlement_status = purchase.get("entitlement_status")

        content_key = metadata.get("content_key") or metadata.get("contentKey")
        recipe_id = metadata.get("recipe_id") or metadata.get("recipeId")
        user_id = metadata.get("jamie_user_id") or metadata.get("jamieUserId")

        prior_entitlement = None
        if isinstance(entitlement_status, dict) and entitlement_status.get("hasEntitlement"):
            prior_entitlement = entitlement_status

        return ReconcileEvent(
            provider=self.provider_name,
            event_id=event_id,
            event_type=event_type,
            provider_purchase_id=purchase["id"],
            status=purchase.get("status", "completed"),
            content_key=content_key,
            recipe_slug_or_id=recipe_id,
            user_id=user_id,
            price_amount=price.get("amount"),
            currency_code=currency.get("code") or price.get("currencyCode"),
            purchased_at=purchase.get("purchased_at") or purchase.get("purchasedAt") or purchase.get("createdAt"),
            completed_at=purchase.get("completed_at") or purchase.get("completedAt"),
            provider_payload=purchase,
            prior_entitlement=prior_entitlement,
        )


def get_payment_provider(provider: str) -> PaymentProvider:
    normalized = (provider or "").strip().lower()
    if normalized == "supertab":
        return SupertabProvider()
    raise ValueError(f"Unsupported payment provider: {provider}")
