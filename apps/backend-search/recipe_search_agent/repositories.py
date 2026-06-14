"""Persistence and query helpers for backend-search foundations."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client, create_client

DEFAULT_RECIPE_PRICE_CENTS = 5


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


def _is_unique_violation_error(exc: Exception) -> bool:
    """Best-effort detection for Postgres unique constraint violations."""
    code = getattr(exc, "code", None)
    if code == "23505":
        return True
    message = str(exc)
    return "23505" in message or "duplicate key value violates unique constraint" in message


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

    _FREE_RECIPE_SLUGS = {
        "fluffy-pancakes",
        "fresh-tomato-soup",
    }

    def __init__(self, client: Client | None = None):
        self._client = client or create_service_role_client()

    def get_recipe(self, recipe_slug_or_id: str) -> Optional[dict[str, Any]]:
        query = self._client.table("recipes").select("id, slug, status, metadata")
        if is_uuid(recipe_slug_or_id):
            response = query.eq("id", recipe_slug_or_id).limit(1).execute()
        else:
            response = query.eq("slug", recipe_slug_or_id).limit(1).execute()
        return first_row(response)

    def list_recipes(self, *, status: Optional[str] = None) -> list[dict[str, Any]]:
        query = self._client.table("recipes").select("id, slug, status, metadata")
        if status:
            query = query.eq("status", status)
        response = query.execute()
        return getattr(response, "data", None) or []

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

    def get_offering(self, recipe_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("recipe_offerings")
            .select("*")
            .eq("recipe_id", recipe_id)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def ensure_recipe_offering(self, recipe: dict[str, Any]) -> dict[str, Any]:
        slug = recipe["slug"]
        is_free = slug in self._FREE_RECIPE_SLUGS
        desired_metadata = {
            "provider": "supertab",
            "recipeSlug": slug,
            "unlockType": "cooking_session",
        }

        existing = self.get_offering(recipe["id"])
        if existing:
            existing_metadata = existing.get("metadata") if isinstance(existing.get("metadata"), dict) else {}
            merged_metadata = {**existing_metadata, **desired_metadata}
            updates: dict[str, Any] = {}
            if existing.get("status") != "active":
                updates["status"] = "active"
            if existing.get("is_free") != is_free:
                updates["is_free"] = is_free
            desired_content_key = f"recipe:{slug}:cook"
            if existing.get("content_key") != desired_content_key:
                updates["content_key"] = desired_content_key
            desired_price = 0 if is_free else DEFAULT_RECIPE_PRICE_CENTS
            if existing.get("price_amount") != desired_price:
                updates["price_amount"] = desired_price
            if existing.get("currency_code") != "USD":
                updates["currency_code"] = "USD"
            if existing_metadata != merged_metadata:
                updates["metadata"] = merged_metadata

            if updates:
                response = (
                    self._client.table("recipe_offerings")
                    .update(updates)
                    .eq("id", existing["id"])
                    .execute()
                )
                return first_row(response) or {**existing, **updates}

            return existing

        payload = {
            "recipe_id": recipe["id"],
            "is_free": is_free,
            "content_key": f"recipe:{slug}:cook",
            "status": "active",
            "currency_code": "USD",
            "price_amount": 0 if is_free else DEFAULT_RECIPE_PRICE_CENTS,
            "metadata": desired_metadata,
        }
        response = self._client.table("recipe_offerings").insert(payload).execute()
        return first_row(response) or payload

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
        try:
            response = self._client.table("purchases").insert(payload).execute()
            return first_row(response) or payload
        except Exception as exc:
            if (
                _is_unique_violation_error(exc)
                and payload.get("provider")
                and payload.get("provider_purchase_id")
            ):
                existing = self.get_purchase_by_provider_id(
                    payload["provider"],
                    payload["provider_purchase_id"],
                )
                if existing:
                    return existing
            raise

    def claim_purchase_for_mandate_consumption(self, purchase_id: str) -> bool:
        response = (
            self._client.table("purchases")
            .update({"mandate_consumed_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", purchase_id)
            .eq("status", "completed")
            .is_("mandate_consumed_at", "null")
            .execute()
        )
        rows = getattr(response, "data", None) or []
        return len(rows) == 1

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

    def get_offering_by_content_key(self, content_key: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("recipe_offerings")
            .select("*")
            .eq("content_key", content_key)
            .limit(1)
            .execute()
        )
        return first_row(response)


class WebhookEventRepository:
    """Idempotent ledger for provider webhook events."""

    def __init__(self, client: Client | None = None):
        self._client = client or create_service_role_client()

    def get_event(self, provider: str, event_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("webhook_events")
            .select("*")
            .eq("provider", provider)
            .eq("event_id", event_id)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def insert_if_absent(self, payload: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
        """Return (row, created). If duplicate, returns (existing_row, False)."""
        existing = self.get_event(payload["provider"], payload["event_id"])
        if existing:
            return existing, False
        response = self._client.table("webhook_events").insert(payload).execute()
        return first_row(response) or payload, True

    def mark_processed(self, provider: str, event_id: str) -> Optional[dict[str, Any]]:
        from datetime import datetime, timezone

        response = (
            self._client.table("webhook_events")
            .update({"processed_at": datetime.now(timezone.utc).isoformat()})
            .eq("provider", provider)
            .eq("event_id", event_id)
            .execute()
        )
        return first_row(response)


class SpendMandateRepository:
    """Persistence operations for AP2-style session spend mandates."""

    def __init__(self, client: Client | None = None):
        self._client = client or create_service_role_client()

    def get_active_mandate(self, user_id: str) -> Optional[dict[str, Any]]:
        now_iso = datetime.now(timezone.utc).isoformat()
        response = (
            self._client.table("spend_mandates")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "active")
            .or_(f"expires_at.is.null,expires_at.gt.{now_iso}")
            .order("granted_at", desc=True)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def create_mandate(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._client.table("spend_mandates").insert(payload).execute()
        return first_row(response) or payload

    def update_mandate(self, mandate_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("spend_mandates")
            .update(updates)
            .eq("id", mandate_id)
            .execute()
        )
        return first_row(response)

    def revoke_active_mandates(self, user_id: str) -> list[dict[str, Any]]:
        from datetime import datetime, timezone

        response = (
            self._client.table("spend_mandates")
            .update({"status": "revoked", "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id)
            .eq("status", "active")
            .execute()
        )
        return getattr(response, "data", None) or []


class SpendMandateAskRepository:
    """Persistence for server-side spend mandate consent asks."""

    def __init__(self, client: Client | None = None):
        self._client = client or create_service_role_client()

    def create_ask(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._client.table("spend_mandate_asks").insert(payload).execute()
        return first_row(response) or payload

    def get_ask(self, ask_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("spend_mandate_asks")
            .select("*")
            .eq("id", ask_id)
            .limit(1)
            .execute()
        )
        return first_row(response)

    def update_ask(self, ask_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("spend_mandate_asks")
            .update(updates)
            .eq("id", ask_id)
            .execute()
        )
        return first_row(response)

    def get_open_ask_for_session(self, session_id: str) -> Optional[dict[str, Any]]:
        response = (
            self._client.table("spend_mandate_asks")
            .select("*")
            .eq("session_id", session_id)
            .eq("status", "requested")
            .order("requested_at", desc=True)
            .limit(1)
            .execute()
        )
        return first_row(response)
