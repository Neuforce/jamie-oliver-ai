"""Development-only helpers for recipe access (paywall bypass)."""

from __future__ import annotations

import os


def is_development_paywall_bypass_enabled() -> bool:
    """
    When True, locked recipes are treated as free for local development.

    - Never True when ENVIRONMENT/ENV or VERCEL_ENV indicate production.
    - True only when the environment is explicitly development-like.
    - Default False if unset (safe for staging/production deploys without extra config).
    """
    env = (os.getenv("ENVIRONMENT") or os.getenv("ENV") or "").strip().lower()
    vercel = (os.getenv("VERCEL_ENV") or "").strip().lower()

    if env in ("production", "prod") or vercel == "production":
        return False

    if env in ("development", "dev", "local") or vercel == "development":
        return True

    return False
