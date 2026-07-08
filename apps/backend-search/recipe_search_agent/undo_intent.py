"""Conservative undo classification for verbal purchase-hold cancellation."""

from __future__ import annotations

import re

_UNDO_PATTERNS = [
    r"\bundo\b",
    r"\bundo (that|it)\b",
    r"\bcancel (that|it)\b",
    r"\bstop\b",
    r"don't do it",
    r"do not do it",
    r"don't charge me",
    r"do not charge me",
    r"take it back",
    r"never mind",
]


def _normalize(text: str) -> str:
    lowered = text.strip().lower()
    lowered = re.sub(r"[^\w\s']", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered)
    return lowered.strip()


def classify_undo_utterance(transcription: str) -> bool:
    """Return True only for reasonably explicit undo/cancel utterances."""
    normalized = _normalize(transcription)
    if not normalized:
        return False
    return any(re.search(pattern, normalized) for pattern in _UNDO_PATTERNS)
