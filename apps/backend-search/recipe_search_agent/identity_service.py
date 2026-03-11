"""Identity service for Jamie users linked to external providers."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from recipe_search_agent.repositories import IdentityRepository


class IdentityService:
    """Resolves and creates Jamie users from Supertab-linked identities."""

    def __init__(self, repository: IdentityRepository | None = None):
        self._repository = repository or IdentityRepository()

    def get_user(self, user_id: str) -> Optional[dict[str, Any]]:
        return self._repository.get_user(user_id)

    def get_user_by_external_identity(self, provider: str, external_subject_id: str) -> Optional[dict[str, Any]]:
        identity = self._repository.get_external_identity(provider, external_subject_id)
        if not identity:
            return None
        return self.get_user(identity["user_id"])

    def get_or_create_user_from_supertab(
        self,
        external_subject_id: str,
        profile: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        profile = profile or {}
        existing = self.get_user_by_external_identity("supertab", external_subject_id)
        if existing:
            return existing

        user_id = str(uuid.uuid4())
        display_name = " ".join(
            part for part in [profile.get("firstName"), profile.get("lastName")] if part
        ) or profile.get("email")

        user = self._repository.create_user(
            {
                "id": user_id,
                "email": profile.get("email"),
                "first_name": profile.get("firstName"),
                "last_name": profile.get("lastName"),
                "display_name": display_name,
                "is_guest": bool(profile.get("isGuest", False)),
                "status": "active",
                "metadata": profile.get("metadata", {}),
            }
        )

        self._repository.create_external_identity(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "provider": "supertab",
                "external_subject_id": external_subject_id,
                "email": profile.get("email"),
                "raw_profile": profile,
            }
        )

        return user or {
            "id": user_id,
            "email": profile.get("email"),
            "display_name": display_name,
        }
