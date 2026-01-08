"""Supabase persistence for intelligent chunks."""

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


def upsert_chunks(*, cfg: SupabaseConfig, rows: list[dict[str, Any]]) -> None:
    url = _get_env(cfg.url_env)
    key = _get_env(cfg.key_env)
    client = create_client(url, key)

    if not rows:
        return
    recipe_id = rows[0].get("recipe_id")
    logger.info("Upserting %d chunks for recipe_id=%s", len(rows), recipe_id)

    # Upsert by unique constraint on (recipe_id, chunk_hash)
    client.table(cfg.table).upsert(rows, on_conflict="recipe_id,chunk_hash").execute()


