"""Synchronize provider purchase state into Jamie records."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from recipe_search_agent.payment_provider import ReconcileEvent
from recipe_search_agent.repositories import MonetizationRepository
from recipe_search_agent.spend_mandate_service import SpendMandateService


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PurchaseSyncService:
    """Translate provider purchase outcomes into Jamie purchases and entitlements."""

    def __init__(
        self,
        repository: MonetizationRepository | None = None,
        spend_mandate_service: SpendMandateService | None = None,
    ):
        self._repository = repository or MonetizationRepository()
        self._spend_mandate = spend_mandate_service or SpendMandateService()

    def sync_supertab_state(
        self,
        *,
        user_id: str,
        recipe_slug_or_id: str,
        purchase: Optional[dict[str, Any]] = None,
        prior_entitlement: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        """Legacy client-reported sync path (kept for backward compatibility)."""
        return self._sync_purchase_state(
            provider="supertab",
            user_id=user_id,
            recipe_slug_or_id=recipe_slug_or_id,
            purchase=purchase,
            prior_entitlement=prior_entitlement,
        )

    def reconcile(self, event: ReconcileEvent) -> dict[str, Any]:
        """Provider-neutral webhook reconciliation path."""
        if not event.user_id:
            raise ValueError("Reconcile event missing user_id")
        if not event.recipe_slug_or_id and not event.content_key:
            raise ValueError("Reconcile event missing recipe identifier")

        recipe_slug_or_id = event.recipe_slug_or_id
        if not recipe_slug_or_id and event.content_key:
            offering = self._repository.get_offering_by_content_key(event.content_key)
            if offering:
                recipe = self._repository.get_recipe(offering["recipe_id"])
                if recipe:
                    recipe_slug_or_id = recipe["slug"]
        if not recipe_slug_or_id:
            raise ValueError("Could not resolve recipe from reconcile event")

        purchase_payload = {
            "id": event.provider_purchase_id,
            "offeringId": event.provider_payload.get("offeringId"),
            "status": event.status,
            "price": {
                "amount": event.price_amount,
                "currencyCode": event.currency_code,
            },
            "createdAt": event.purchased_at,
            "completedAt": event.completed_at,
            **event.provider_payload,
        }
        prior_entitlement = [event.prior_entitlement] if event.prior_entitlement else []

        return self._sync_purchase_state(
            provider=event.provider,
            user_id=event.user_id,
            recipe_slug_or_id=recipe_slug_or_id,
            purchase=purchase_payload,
            prior_entitlement=prior_entitlement,
        )

    def _sync_purchase_state(
        self,
        *,
        provider: str,
        user_id: str,
        recipe_slug_or_id: str,
        purchase: Optional[dict[str, Any]] = None,
        prior_entitlement: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        recipe = self._repository.get_recipe(recipe_slug_or_id)
        if not recipe:
            raise ValueError(f"Recipe not found: {recipe_slug_or_id}")

        offering = self._repository.get_active_offering(recipe["id"])
        if not offering:
            offering = self._repository.ensure_recipe_offering(recipe)

        synced_purchase = None
        if purchase and purchase.get("id"):
            existing_purchase = self._repository.get_purchase_by_provider_id(provider, purchase["id"])
            if existing_purchase:
                synced_purchase = existing_purchase
            else:
                purchased_at = purchase.get("createdAt") or purchase.get("purchased_at") or _utc_now_iso()
                completed_at = (
                    purchase.get("completedAt")
                    or purchase.get("completed_at")
                    or (purchased_at if purchase.get("status") == "completed" else None)
                )
                synced_purchase = self._repository.create_purchase(
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "recipe_offering_id": offering["id"],
                        "provider": provider,
                        "provider_purchase_id": purchase["id"],
                        "provider_offering_id": purchase.get("offeringId"),
                        "status": purchase.get("status", "pending"),
                        "price_amount": ((purchase.get("price") or {}).get("amount")),
                        "currency_code": ((purchase.get("price") or {}).get("currencyCode")),
                        "purchased_at": purchased_at,
                        "completed_at": completed_at,
                        "provider_payload": purchase,
                        "metadata": purchase.get("purchaseMetadata") or purchase.get("metadata") or {},
                    }
                )

        matched_prior_entitlement = None
        if prior_entitlement and offering.get("content_key"):
            matched_prior_entitlement = next(
                (
                    entitlement
                    for entitlement in prior_entitlement
                    if entitlement
                    and (
                        entitlement.get("contentKey") == offering["content_key"]
                        or entitlement.get("content_key") == offering["content_key"]
                    )
                    and entitlement.get("hasEntitlement")
                ),
                None,
            )

        should_grant_entitlement = (
            matched_prior_entitlement is not None
            or (purchase and purchase.get("status") == "completed")
            or offering.get("is_free", False)
        )

        synced_entitlement = None
        if should_grant_entitlement and offering.get("content_key"):
            existing_entitlement = self._repository.get_active_entitlement_by_content_key(
                user_id,
                offering["content_key"],
            )
            if existing_entitlement:
                synced_entitlement = existing_entitlement
            else:
                synced_entitlement = self._repository.create_entitlement(
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "recipe_id": recipe["id"],
                        "purchase_id": synced_purchase["id"] if synced_purchase else None,
                        "provider": provider,
                        "provider_content_key": offering["content_key"],
                        "status": "active",
                        "granted_at": _utc_now_iso(),
                        "expires_at": matched_prior_entitlement.get("expires") if matched_prior_entitlement else None,
                    }
                )

        if synced_purchase and synced_purchase.get("status") == "completed":
            claimed = self._repository.claim_purchase_for_mandate_consumption(synced_purchase["id"])
            if claimed:
                mandate = self._spend_mandate.get_current_mandate(user_id)
                if mandate:
                    self._spend_mandate.consume_mandate(
                        mandate,
                        int(offering.get("price_amount") or 0),
                    )

        return {
            "recipeId": recipe["slug"],
            "recipeUuid": recipe["id"],
            "offeringId": offering["id"],
            "purchase": synced_purchase,
            "entitlement": synced_entitlement,
        }
