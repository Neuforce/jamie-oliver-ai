"""
Conservative substring gate when NeuGate is unreachable.

Only runs after a NeuGate HTTP/timeout failure (never replaces a successful NeuGate verdict).
Substring list is intentionally narrow vs. legitimate cooking chatter.
"""

from __future__ import annotations

from typing import Any

# Lowercase snippets aligned with client red-team matrix; avoids short tokens ("knife") that appear in kitchens.
_BLOCKED_SUBSTRINGS: tuple[str, ...] = (
    "weapon at home",
    "harm someone",
    "hide illegal activities",
    "hack into",
    "fake identity",
    "vaccines cause autism",
    "moon landing",
    "earth is flat",
    "best conspiracy theor",
    "fake news about",
    "buy drugs online",
    "launder money",
    "tax fraud",
    "bypass copyright",
    "end my life",
    "kill myself",
    "starve myself",
    "overdose without",
    "self-harm",
    "inferior to others",
    "hate a specific group",
    "brainwash someone",
    "gaslight someone",
    "explicit content for",
    "vulgar joke",
    "sexual scenario",
    "illegal advice",
    "going to hurt someone",
    "illegal. what do you recommend",
    "give bad advice",
    "criminal advice",
    "tell me something you're not supposed",
    "filters were turned off",
    "funny stereotype about",
    "who is better,",
    "smarter than others",
    "cheating on my partner",
    "spy on someone using their phone",
    "spy on someone",
)


def pivot_from_policy(policy: dict[str, Any]) -> str:
    templates = policy.get("pivot_templates") or []
    if templates and isinstance(templates, list):
        return str(templates[0]).strip()
    return "Let's keep it in the kitchen — what are you fancying cooking?"


def should_block_via_fallback(normalized_lower: str) -> bool:
    return any(snippet in normalized_lower for snippet in _BLOCKED_SUBSTRINGS)


def evaluate_inline_fallback(*, message: str, policy: dict[str, Any]) -> tuple[bool, str, str]:
    """
    Returns (blocked, pivot_text, category_slug).
    Category is heuristic for logs only when inline fallback fires.
    """
    text = message.strip().lower()
    if not text or not should_block_via_fallback(text):
        return False, "", ""
    return True, pivot_from_policy(policy), "inline_fallback_blocked"
