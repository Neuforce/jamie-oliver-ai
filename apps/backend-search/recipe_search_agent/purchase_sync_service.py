"""Synchronize Supertab purchase state into Jamie records."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from recipe_search_agent.repositories import MonetizationRepository


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PurchaseSyncService:
    """Translate Supertab experience outcomes into Jamie purchases and entitlements."""

    def __init__(self, repository: MonetizationRepository | None = None):
        self._repository = repository or MonetizationRepository()

    def sync_supertab_state(
        self,
        *,
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
            raise ValueError(f"No active offering found for recipe: {recipe_slug_or_id}")

        synced_purchase = None
        if purchase and purchase.get("id"):
            existing_purchase = self._repository.get_purchase_by_provider_id("supertab", purchase["id"])
            if existing_purchase:
                synced_purchase = existing_purchase
            else:
                purchased_at = purchase.get("createdAt") or _utc_now_iso()
                completed_at = (
                    purchase.get("completedAt")
                    or (purchased_at if purchase.get("status") == "completed" else None)
                )
                synced_purchase = self._repository.create_purchase(
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "recipe_offering_id": offering["id"],
                        "provider": "supertab",
                        "provider_purchase_id": purchase["id"],
                        "provider_offering_id": purchase.get("offeringId"),
                        "status": purchase.get("status", "pending"),
                        "price_amount": ((purchase.get("price") or {}).get("amount")),
                        "currency_code": ((purchase.get("price") or {}).get("currencyCode")),
                        "purchased_at": purchased_at,
                        "completed_at": completed_at,
                        "provider_payload": purchase,
                        "metadata": purchase.get("purchaseMetadata") or {},
                    }
                )

        matched_prior_entitlement = None
        if prior_entitlement and offering.get("content_key"):
            matched_prior_entitlement = next(
                (
                    entitlement
                    for entitlement in prior_entitlement
                    if entitlement.get("contentKey") == offering["content_key"] and entitlement.get("hasEntitlement")
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
                        "provider": "supertab",
                        "provider_content_key": offering["content_key"],
                        "status": "active",
                        "granted_at": _utc_now_iso(),
                        "expires_at": matched_prior_entitlement.get("expires") if matched_prior_entitlement else None,
                    }
                )

        return {
            "recipeId": recipe["slug"],
            "recipeUuid": recipe["id"],
            "offeringId": offering["id"],
            "purchase": synced_purchase,
            "entitlement": synced_entitlement,
        }
