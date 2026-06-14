"""Conservative yes/no classification for verbal spend-mandate consent (NEU-671)."""

from __future__ import annotations

import re
from typing import Literal

ConsentIntent = Literal["grant", "decline", "ambiguous"]

_GRANT_PATTERNS = [
    r"^yes\b",
    r"^yeah\b",
    r"^yep\b",
    r"^sure\b",
    r"^ok\b",
    r"^okay\b",
    r"go ahead",
    r"put it on my tab",
    r"on my tab",
    r"approve",
    r"do it",
    r"sounds good",
    r"please do",
]

_DECLINE_PATTERNS = [
    r"^no\b",
    r"^nope\b",
    r"not now",
    r"don't",
    r"do not",
    r"cancel",
    r"stop",
    r"decline",
    r"never mind",
    r"nah\b",
]


def _normalize(text: str) -> str:
    lowered = text.strip().lower()
    lowered = re.sub(r"[^\w\s']", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered)
    return lowered.strip()


def classify_consent_utterance(text: str) -> ConsentIntent:
    """Classify a user utterance while a consent ask is pending."""
    normalized = _normalize(text)
    if not normalized:
        return "ambiguous"

    grant = any(re.search(pattern, normalized) for pattern in _GRANT_PATTERNS)
    decline = any(re.search(pattern, normalized) for pattern in _DECLINE_PATTERNS)

    if grant and not decline:
        return "grant"
    if decline and not grant:
        return "decline"
    return "ambiguous"
