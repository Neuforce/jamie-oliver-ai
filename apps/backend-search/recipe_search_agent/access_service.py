"""Recipe access-state resolution service."""

from __future__ import annotations

from typing import Any, Optional

from recipe_search_agent.entitlements_service import EntitlementsService


class AccessService:
    """Resolve whether a recipe is free, locked, or owned."""

    def __init__(self, entitlements_service: EntitlementsService | None = None):
        self._entitlements = entitlements_service or EntitlementsService()

    def get_recipe_access(self, recipe_slug_or_id: str, user_id: Optional[str] = None) -> dict[str, Any]:
        recipe = self._entitlements.get_recipe(recipe_slug_or_id)
        if not recipe:
            raise ValueError(f"Recipe not found: {recipe_slug_or_id}")

        offering = self._entitlements.get_recipe_offering(recipe["id"])
        entitlement = self._entitlements.get_active_entitlement(user_id, recipe["id"]) if user_id else None
        active_session = self._entitlements.get_active_session(user_id, recipe["id"]) if user_id else None

        if offering and offering.get("is_free"):
            access_state = "free"
        elif entitlement:
            access_state = "owned"
        else:
            access_state = "locked"

        return {
            "recipeId": recipe["slug"],
            "recipeUuid": recipe["id"],
            "accessState": access_state,
            "offering": (
                {
                    "id": offering["id"],
                    "isFree": offering.get("is_free", False),
                    "contentKey": offering.get("content_key"),
                    "priceAmount": offering.get("price_amount"),
                    "currencyCode": offering.get("currency_code"),
                    "supertabOfferingId": offering.get("supertab_offering_id"),
                    "supertabExperienceId": offering.get("supertab_experience_id"),
                }
                if offering
                else None
            ),
            "entitlement": (
                {
                    "id": entitlement["id"],
                    "status": entitlement["status"],
                    "grantedAt": entitlement.get("granted_at"),
                    "expiresAt": entitlement.get("expires_at"),
                    "recursAt": entitlement.get("recurs_at"),
                }
                if entitlement
                else None
            ),
            "activeSession": (
                {
                    "sessionId": active_session["id"],
                    "status": active_session["status"],
                    "currentStepIndex": active_session.get("current_step_index", 0),
                    "completedStepIds": active_session.get("completed_step_ids", []),
                    "lastActiveAt": active_session.get("last_active_at"),
                }
                if active_session
                else None
            ),
        }
