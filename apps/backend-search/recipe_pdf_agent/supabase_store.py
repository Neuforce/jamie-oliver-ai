"""Supabase pgvector persistence for recipe index rows."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

from supabase import create_client

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SupabaseConfig:
    url_env: str
    key_env: str
    table: str


def _get_env(name: str) -> str:
    val = os.getenv(name, "")
    if not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val


def upsert_recipe_index_row(*, cfg: SupabaseConfig, row: dict[str, Any]) -> None:
    """
    Upsert a row into the configured Supabase table.

    Notes:
    - Uses the provided key (recommended: service role) from env only.
    - Never logs secrets; only logs row id/title.
    """
    url = _get_env(cfg.url_env)
    key = _get_env(cfg.key_env)

    client = create_client(url, key)
    recipe_id = row.get("id")
    title = row.get("title")
    logger.info("Upserting Supabase row: %s (%s)", title, recipe_id)

    # Supabase PostgREST upsert by primary key.
    client.table(cfg.table).upsert(row).execute()


