"""Load Jamie consumer policy for NeuGate requests."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_VOICE_APP_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_POLICY_PATH = _VOICE_APP_ROOT / "config" / "guardrails" / "jamie-policy.json"


@lru_cache(maxsize=1)
def load_jamie_policy(path: Path | None = None) -> dict[str, Any]:
    policy_path = path or _DEFAULT_POLICY_PATH
    if not policy_path.is_file():
        raise FileNotFoundError(f"Jamie policy not found: {policy_path}")
    return json.loads(policy_path.read_text(encoding="utf-8"))
