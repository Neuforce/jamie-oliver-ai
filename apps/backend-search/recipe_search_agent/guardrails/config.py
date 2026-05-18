"""Environment settings for NeuGate guardrails."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class GuardrailsSettings:
    neugate_enabled: bool
    neugate_url: str
    neugate_api_key: str
    neugate_project_id: str
    neugate_timeout_seconds: float

    @classmethod
    def from_env(cls) -> "GuardrailsSettings":
        return cls(
            neugate_enabled=_env_bool("NEUGATE_ENABLED", default=False),
            neugate_url=os.getenv("NEUGATE_URL", "http://localhost:8080").rstrip("/"),
            neugate_api_key=os.getenv("NEUGATE_API_KEY", "").strip(),
            neugate_project_id=os.getenv("NEUGATE_PROJECT_ID", "jamie-oliver-ai").strip(),
            neugate_timeout_seconds=float(os.getenv("NEUGATE_TIMEOUT_SECONDS", "0.8")),
        )


@lru_cache(maxsize=1)
def get_guardrails_settings() -> GuardrailsSettings:
    return GuardrailsSettings.from_env()
