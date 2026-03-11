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
