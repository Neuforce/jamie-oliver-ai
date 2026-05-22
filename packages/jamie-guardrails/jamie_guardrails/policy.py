"""Jamie policy load, NeuGate strip, and PrePrompt render."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

Channel = Literal["discovery", "voice"]

NEUGATE_POLICY_KEYS = ("critical_blocks", "soft_blocks", "pivot_templates")


def default_policy_path() -> Path:
    override = os.getenv("JAMIE_POLICY_PATH", "").strip()
    if override:
        return Path(override)
    return Path(__file__).resolve().parent / "data" / "jamie-policy.json"


@lru_cache(maxsize=8)
def load_jamie_policy(path: str | None = None) -> dict[str, Any]:
    policy_path = Path(path) if path else default_policy_path()
    if not policy_path.is_file():
        raise FileNotFoundError(f"Jamie policy not found: {policy_path}")
    return json.loads(policy_path.read_text(encoding="utf-8"))


def clear_policy_cache() -> None:
    load_jamie_policy.cache_clear()


def neugate_policy(full: dict[str, Any]) -> dict[str, Any]:
    return {k: full[k] for k in NEUGATE_POLICY_KEYS if k in full}


def preprompt_version_label(policy: dict[str, Any] | None = None) -> str:
    try:
        full = policy if policy is not None else load_jamie_policy()
        version = str(full.get("preprompt_version", "preprompt-v1.2"))
        if version.startswith("preprompt-"):
            return version[len("preprompt-") :]
        return version
    except Exception:  # pragma: no cover
        return "unknown"


def render_preprompt_block(
    channel: Channel,
    policy: dict[str, Any] | None = None,
) -> str:
    full = policy if policy is not None else load_jamie_policy()
    preprompt = full.get("preprompt")
    if not isinstance(preprompt, dict):
        raise ValueError("Jamie policy missing preprompt section")

    channels = preprompt.get("channels")
    if not isinstance(channels, dict) or channel not in channels:
        raise ValueError(f"Unknown or missing preprompt channel: {channel}")

    ch = channels[channel]
    preprompt_version = preprompt_version_label(full)
    label = str(ch.get("label", channel))

    lines: list[str] = [
        f"### GUARDRAILS (PrePrompt {preprompt_version} — {label})",
        "",
    ]
    scope_line = ch.get("scope_line")
    if scope_line:
        lines.append(f"**Scope:** {scope_line}")
    else:
        lines.append(f"**Scope:** You help with **{ch['scope']}** only. British English.")
    lines.extend(["", "**Never provide** instructions or encouragement for:"])

    for topic in preprompt.get("prohibited_topics") or []:
        lines.append(f"- {topic}")

    lines.extend(["", f"**{ch['refusal_heading']}**"])
    for rule in ch.get("refusal_rules") or []:
        lines.append(f"- {rule}")

    example_pivots = ch.get("example_pivots") or []
    if example_pivots:
        joined = " / ".join(f'"{p}"' for p in example_pivots)
        prefix = "Example pivots (vary naturally): " if channel == "discovery" else "Example pivots (vary): "
        lines.append(f"- {prefix}{joined}")

    self_harm = ch.get("self_harm_guidance")
    if self_harm:
        lines.append(f"- **Self-harm or crisis:** {self_harm}")

    mixed = ch.get("mixed_messages")
    if mixed:
        lines.extend(["", f"**Mixed messages:** {mixed}"])

    if channel == "discovery":
        tool_rules = ch.get("tool_rules") or []
        if tool_rules:
            lines.extend(["", "**Tools when content is off-limits:**"])
            for rule in tool_rules:
                lines.append(f"- {rule}")
    else:
        for rule in ch.get("extra_rules") or []:
            lines.append("")
            lines.append(rule)

    language = preprompt.get("language", "British English only unless product says otherwise.")
    lines.extend(["", f"**Languages (MVP):** {language}"])

    return "\n".join(lines) + "\n"
