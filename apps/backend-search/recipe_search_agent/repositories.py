"""Persistence and query helpers for backend-search foundations."""

from __future__ import annotations

import os
import uuid
from typing import Any, Optional

from supabase import Client, create_client


def create_service_role_client() -> Client:
    """Create a Supabase client using backend service-role credentials."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment")
    return create_client(supabase_url, supabase_key)


def first_row(response: Any) -> Optional[dict[str, Any]]:
    """Safely return the first row from a Supabase response."""
    rows = getattr(response, "data", None) or []
    return rows[0] if rows else None


def is_uuid(value: str) -> bool:
    """Return True when the supplied string is a valid UUID."""
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


class IdentityRepository:
    """Persistence operations for Jamie users and external identities."""

    def __init__(self, client: Client | None = None):
        self._client = client or create_service_role_client()

    def get_user(self, user_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("users")
            .select("*")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def get_external_identity(self, provider: str, external_subject_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("external_identities")
            .select("*")
            .eq("provider", provider)
            .eq("external_subject_id", external_subject_id)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._client.table("users").insert(payload).execute()
        return self.get_user(payload["id"]) or payload

    def create_external_identity(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._client.table("external_identities").insert(payload).execute()
        return payload


class MonetizationRepository:
    """Persistence operations for recipe offerings, entitlements, and sessions."""

    def __init__(self, client: Client | None = None):
        self._client = client or create_service_role_client()

    def get_recipe(self, recipe_slug_or_id: str) -> Optional[dict[str, Any]]:
        query = self._client.table("recipes").select("id, slug, status, metadata")
        if is_uuid(recipe_slug_or_id):
            response = query.eq("id", recipe_slug_or_id).limit(1).execute()
        else:
            response = query.eq("slug", recipe_slug_or_id).limit(1).execute()
        return first_row(response)

    def get_active_offering(self, recipe_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("recipe_offerings")
            .select("*")
            .eq("recipe_id", recipe_id)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        return first_row(response)

    def get_active_entitlement(self, user_id: str, recipe_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("entitlements")
            .select("*")
            .eq("user_id", user_id)
            .eq("recipe_id", recipe_id)
            .eq("status", "active")
            .order("granted_at", desc=True)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def list_active_entitlements(self, user_id: str) -> list[dict[str, Any]]:
        response = (
            self._client.table("entitlements")
            .select("id, user_id, recipe_id, purchase_id, provider_content_key, status, granted_at, expires_at, recurs_at")
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("granted_at", desc=True)
            .execute()
        )
        return getattr(response, "data", None) or []

    def get_latest_active_session(self, user_id: str, recipe_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("cooking_sessions")
            .select("id, status, current_step_index, completed_step_ids, last_active_at")
            .eq("user_id", user_id)
            .eq("recipe_id", recipe_id)
            .in_("status", ["active", "paused"])
            .order("last_active_at", desc=True)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def list_latest_active_sessions(self, user_id: str, recipe_ids: list[str]) -> list[dict[str, Any]]:
        if not recipe_ids:
            return []

        response = (
            self._client.table("cooking_sessions")
            .select("id, recipe_id, status, current_step_index, completed_step_ids, last_active_at")
            .eq("user_id", user_id)
            .in_("recipe_id", recipe_ids)
            .in_("status", ["active", "paused"])
            .order("last_active_at", desc=True)
            .execute()
        )
        return getattr(response, "data", None) or []

    def get_recipes_by_ids(self, recipe_ids: list[str]) -> list[dict[str, Any]]:
        if not recipe_ids:
            return []

        response = (
            self._client.table("recipes")
            .select("id, slug, status, metadata")
            .in_("id", recipe_ids)
            .execute()
        )
        return getattr(response, "data", None) or []

    def get_purchase_by_provider_id(self, provider: str, provider_purchase_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("purchases")
            .select("*")
            .eq("provider", provider)
            .eq("provider_purchase_id", provider_purchase_id)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def get_purchases_by_ids(self, purchase_ids: list[str]) -> list[dict[str, Any]]:
        if not purchase_ids:
            return []

        response = (
            self._client.table("purchases")
            .select("id, status, purchased_at, completed_at")
            .in_("id", purchase_ids)
            .execute()
        )
        return getattr(response, "data", None) or []

    def create_purchase(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._client.table("purchases").insert(payload).execute()
        return first_row(response) or payload

    def get_active_entitlement_by_content_key(self, user_id: str, content_key: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("entitlements")
            .select("*")
            .eq("user_id", user_id)
            .eq("provider_content_key", content_key)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        return first_row(response)

    def create_entitlement(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._client.table("entitlements").insert(payload).execute()
        return first_row(response) or payload
