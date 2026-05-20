"""Environment settings for NeuGate guardrails (voice backend)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

# Ship-safe default: NeuGate HTTP is off until explicitly enabled per environment.
_DEFAULT_NEUGATE_ENABLED = False


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
    inline_fallback_on_neugate_error: bool = True
    # FR-5: second pass on assistant text before TTS (only when neugate_enabled is true).
    neugate_output_moderation_enabled: bool = False
    neugate_output_moderation_min_chars: int = 24

    @classmethod
    def from_env(cls) -> "GuardrailsSettings":
        return cls(
            neugate_enabled=_env_bool(
                "NEUGATE_ENABLED", default=_DEFAULT_NEUGATE_ENABLED
            ),
            neugate_url=os.getenv("NEUGATE_URL", "http://localhost:8080").rstrip("/"),
            neugate_api_key=os.getenv("NEUGATE_API_KEY", "").strip(),
            neugate_project_id=os.getenv("NEUGATE_PROJECT_ID", "jamie-oliver-ai").strip(),
            neugate_timeout_seconds=float(os.getenv("NEUGATE_TIMEOUT_SECONDS", "0.8")),
            inline_fallback_on_neugate_error=_env_bool(
                "NEUGATE_INLINE_FALLBACK_ON_ERROR", default=True
            ),
            neugate_output_moderation_enabled=_env_bool(
                "NEUGATE_OUTPUT_MODERATION_ENABLED", default=False
            ),
            neugate_output_moderation_min_chars=int(
                os.getenv("NEUGATE_OUTPUT_MODERATION_MIN_CHARS", "24")
            ),
        )


@lru_cache(maxsize=1)
def get_guardrails_settings() -> GuardrailsSettings:
    return GuardrailsSettings.from_env()
