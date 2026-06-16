"""Shared helper for resolving recipe unlock pricing.

Single source of truth used by both the `request_supertab_unlock` tool and the
tool-result event builder so the price/currency that drives the auto-charge vs
consent decision is computed identically in both places.
"""

from __future__ import annotations

import logging

from recipe_search_agent.recipe_catalog import get_published_catalog
from recipe_search_agent.repositories import DEFAULT_RECIPE_PRICE_CENTS, MonetizationRepository

logger = logging.getLogger(__name__)


def resolve_recipe_price(recipe_backend_id: str) -> tuple[int, str]:
    """Return (price_amount_cents, currency_code) for a recipe slug.

    Falls back to the default price/USD when the offering can't be resolved.
    """
    price_amount = DEFAULT_RECIPE_PRICE_CENTS
    currency_code = "USD"

    try:
        row = get_published_catalog().get_recipe_row(recipe_backend_id)
        if row and row.get("id"):
            offering = MonetizationRepository().get_active_offering(row["id"])
            if offering:
                price_amount = int(offering.get("price_amount") or price_amount)
                currency_code = offering.get("currency_code") or currency_code
    except Exception:
        logger.exception(
            "Failed resolving recipe price for %s; using defaults", recipe_backend_id
        )

    return price_amount, currency_code
