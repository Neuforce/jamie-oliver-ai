"""Entitlement and offering lookup service."""

from __future__ import annotations

from typing import Any, Optional

from recipe_search_agent.repositories import MonetizationRepository


class EntitlementsService:
    """Reads offering and entitlement state from Supabase."""

    def __init__(self, repository: MonetizationRepository | None = None):
        self._repository = repository or MonetizationRepository()

    def get_recipe(self, recipe_slug_or_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_recipe(recipe_slug_or_id)

    def get_recipe_offering(self, recipe_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_active_offering(recipe_id)

    def get_active_entitlement(self, user_id: str, recipe_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_active_entitlement(user_id, recipe_id)

    def get_active_session(self, user_id: str, recipe_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_latest_active_session(user_id, recipe_id)

    def list_owned_recipes(self, user_id: str) -> list[dict[str, Any]]:
        entitlements = self._repository.list_active_entitlements(user_id)
        if not entitlements:
            return []

        latest_entitlement_by_recipe: dict[str, dict[str, Any]] = {}
        for entitlement in entitlements:
            recipe_id = entitlement["recipe_id"]
            latest_entitlement_by_recipe.setdefault(recipe_id, entitlement)

        recipe_ids = list(latest_entitlement_by_recipe.keys())
        recipes = self._repository.get_recipes_by_ids(recipe_ids)
        purchases = self._repository.get_purchases_by_ids(
            [entitlement["purchase_id"] for entitlement in latest_entitlement_by_recipe.values() if entitlement.get("purchase_id")]
        )
        active_sessions = self._repository.list_latest_active_sessions(user_id, recipe_ids)

        recipe_by_id = {recipe["id"]: recipe for recipe in recipes}
        purchase_by_id = {purchase["id"]: purchase for purchase in purchases}

        latest_session_by_recipe: dict[str, dict[str, Any]] = {}
        for session in active_sessions:
            latest_session_by_recipe.setdefault(session["recipe_id"], session)

        owned_recipes: list[dict[str, Any]] = []
        for recipe_id, entitlement in latest_entitlement_by_recipe.items():
            recipe = recipe_by_id.get(recipe_id)
            if not recipe:
                continue

            metadata = recipe.get("metadata") or {}
            session = latest_session_by_recipe.get(recipe_id)
            purchase = purchase_by_id.get(entitlement.get("purchase_id"))

            owned_recipes.append(
                {
                    "recipeId": recipe["slug"],
                    "recipeUuid": recipe["id"],
                    "title": metadata.get("title", recipe["slug"]),
                    "description": metadata.get("description"),
                    "category": metadata.get("categories", [None])[0] if metadata.get("categories") else None,
                    "imageUrl": metadata.get("image_url"),
                    "purchaseStatus": purchase.get("status") if purchase else None,
                    "ownedAt": entitlement.get("granted_at"),
                    "expiresAt": entitlement.get("expires_at"),
                    "lastCookedAt": session.get("last_active_at") if session else None,
                    "activeSession": (
                        {
                            "sessionId": session["id"],
                            "status": session["status"],
                            "currentStepIndex": session.get("current_step_index", 0),
                            "completedStepIds": session.get("completed_step_ids", []),
                            "lastActiveAt": session.get("last_active_at"),
                        }
                        if session
                        else None
                    ),
                }
            )

        owned_recipes.sort(key=lambda recipe: recipe.get("ownedAt") or "", reverse=True)
        return owned_recipes
