"""
Single source of truth for discovery: published recipes in Supabase `recipes`.

Discovery search, tools, access, and GET /api/v1/recipes/{slug} MUST only use slugs
from this catalog. Legacy JSON under data/recipes/ and public/recipes-json/ are for
ingestion/seed only — not for runtime discovery.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from recipe_search_agent.repositories import MonetizationRepository

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 300


class PublishedRecipeCatalog:
    """In-memory cache of published recipe slugs (Supabase `recipes` table)."""

    def __init__(self, repository: MonetizationRepository | None = None):
        self._repository = repository or MonetizationRepository()
        self._slug_set: set[str] = set()
        self._loaded_at: float = 0.0

    def _refresh_if_stale(self) -> None:
        if self._slug_set and (time.monotonic() - self._loaded_at) < _CACHE_TTL_SECONDS:
            return
        rows = self._repository.list_recipes(status="published")
        self._slug_set = {row["slug"] for row in rows if row.get("slug")}
        self._loaded_at = time.monotonic()
        logger.info("Published recipe catalog loaded: %s slugs", len(self._slug_set))

    def is_published(self, slug: str) -> bool:
        key = (slug or "").strip()
        if not key:
            return False
        self._refresh_if_stale()
        return key in self._slug_set

    def require_published(self, slug: str) -> str:
        key = (slug or "").strip()
        if not self.is_published(key):
            raise ValueError(f"Recipe not in published catalog: {key}")
        return key

    def filter_slugs(self, slugs: list[str]) -> list[str]:
        self._refresh_if_stale()
        return [slug for slug in slugs if slug in self._slug_set]

    def get_recipe_row(self, recipe_slug_or_id: str) -> Optional[dict[str, Any]]:
        row = self._repository.get_recipe(recipe_slug_or_id)
        if not row:
            return None
        if row.get("status") and row["status"] != "published":
            return None
        slug = row.get("slug")
        if slug and not self.is_published(slug):
            return None
        return row


_catalog: PublishedRecipeCatalog | None = None


def get_published_catalog() -> PublishedRecipeCatalog:
    global _catalog
    if _catalog is None:
        _catalog = PublishedRecipeCatalog()
    return _catalog


def reset_published_catalog_for_tests() -> None:
    global _catalog
    _catalog = None
