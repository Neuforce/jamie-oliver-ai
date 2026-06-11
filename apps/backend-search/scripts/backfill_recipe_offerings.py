"""Backfill default Supertab recipe offerings for recipes missing monetization rows."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from recipe_search_agent.repositories import DEFAULT_RECIPE_PRICE_CENTS, MonetizationRepository


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write missing/fixed recipe offerings to Supabase. Without this flag the script is a dry run.",
    )
    parser.add_argument(
        "--status",
        default="published",
        help="Recipe status to scan. Defaults to published.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")

    repository = MonetizationRepository()
    recipes = repository.list_recipes(status=args.status)

    created = 0
    updated = 0
    unchanged = 0

    for recipe in recipes:
        existing = repository.get_offering(recipe["id"])
        ensured = repository.ensure_recipe_offering(recipe) if args.apply else None

        if not existing:
            created += 1
            print(f"CREATE {recipe['slug']} -> recipe:{recipe['slug']}:cook")
            continue

        if not args.apply:
            is_free = recipe["slug"] in repository._FREE_RECIPE_SLUGS  # noqa: SLF001
            desired_price = 0 if is_free else DEFAULT_RECIPE_PRICE_CENTS
            desired_content_key = f"recipe:{recipe['slug']}:cook"
            needs_update = (
                existing.get("status") != "active"
                or existing.get("is_free") != is_free
                or existing.get("content_key") != desired_content_key
                or existing.get("price_amount") != desired_price
                or existing.get("currency_code") != "USD"
            )
            if needs_update:
                updated += 1
                print(f"UPDATE {recipe['slug']} -> recipe:{recipe['slug']}:cook")
            else:
                unchanged += 1
            continue

        if existing.get("id") != ensured.get("id"):
            created += 1
            print(f"CREATE {recipe['slug']} -> recipe:{recipe['slug']}:cook")
            continue

        changed = (
            existing.get("status") != ensured.get("status")
            or existing.get("is_free") != ensured.get("is_free")
            or existing.get("content_key") != ensured.get("content_key")
            or existing.get("price_amount") != ensured.get("price_amount")
            or existing.get("currency_code") != ensured.get("currency_code")
            or existing.get("metadata") != ensured.get("metadata")
        )
        if changed:
            updated += 1
            print(f"UPDATE {recipe['slug']} -> {ensured.get('content_key')}")
        else:
            unchanged += 1

    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"\n[{mode}] scanned={len(recipes)} created={created} updated={updated} unchanged={unchanged}")


if __name__ == "__main__":
    main()
