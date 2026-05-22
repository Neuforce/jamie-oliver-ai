"""Re-export shared jamie-guardrails policy helpers (Path-friendly loader)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from jamie_guardrails import policy as _policy

clear_policy_cache = _policy.clear_policy_cache
default_policy_path = _policy.default_policy_path
neugate_policy = _policy.neugate_policy
render_preprompt_block = _policy.render_preprompt_block


def load_jamie_policy(path: Path | None = None) -> dict[str, Any]:
    if path is not None:
        clear_policy_cache()
        return _policy.load_jamie_policy(str(path))
    return _policy.load_jamie_policy()


load_jamie_policy.cache_clear = clear_policy_cache  # type: ignore[attr-defined]

__all__ = [
    "clear_policy_cache",
    "default_policy_path",
    "load_jamie_policy",
    "neugate_policy",
    "render_preprompt_block",
]
