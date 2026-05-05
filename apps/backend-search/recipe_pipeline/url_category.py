"""Infer Jamie Oliver site category from recipe URL path (JOAv0 recipe.categories source)."""

from __future__ import annotations

from urllib.parse import urlparse

# /recipes/{slug}/ only — middle segment is absent; map slug -> category (lowercase).
SLUG_CATEGORY_OVERRIDES: dict[str, str] = {
    "easy-cottage-pie": "desserts",
    "a-better-bolognese": "pasta",
    "sausage-pasta": "pasta",
    "simple-roast-chicken": "chicken",
}


def infer_category_slug_from_jamie_url(url: str) -> str | None:
    """
    Return a single lowercase category slug for metadata/API, or None if unknown.

    - /recipes/{category}/{recipe_slug}/ -> category is first path segment after recipes
    - /recipes/{slug}/ -> use SLUG_CATEGORY_OVERRIDES when present
    """
    parsed = urlparse((url or "").strip())
    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2 or parts[0].lower() != "recipes":
        return None
    if len(parts) == 2:
        slug = parts[1].lower().rstrip("/")
        return SLUG_CATEGORY_OVERRIDES.get(slug)
    return parts[1].lower().rstrip("/")
