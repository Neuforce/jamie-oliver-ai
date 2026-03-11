"""Persistence boundary for durable cooking sessions."""

from __future__ import annotations

import os
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


class PersistedSessionRepository:
    """Encapsulates durable cooking-session reads and writes."""

    def __init__(self, client: Client | None = None):
        self._client = client or create_service_role_client()

    def find_active_session(self, user_id: str, recipe_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("cooking_sessions")
            .select("*")
            .eq("user_id", user_id)
            .eq("recipe_id", recipe_id)
            .in_("status", ["active", "paused"])
            .order("last_active_at", desc=True)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def create_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._client.table("cooking_sessions").insert(payload).execute()
        return first_row(response) or payload

    def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("cooking_sessions")
            .select("*")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def update_session(self, session_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("cooking_sessions")
            .update(updates)
            .eq("id", session_id)
            .execute()
        )
        return first_row(response)
