"""Time parsing and ISO-8601 duration formatting utilities."""

from __future__ import annotations

import re


def seconds_to_iso8601(seconds: int) -> str:
    seconds = max(0, int(seconds))
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60

    out = "PT"
    if h:
        out += f"{h}H"
    if m:
        out += f"{m}M"
    if s or (not h and not m):
        out += f"{s}S" if (h or m) else f"{m}M" if m else "0M"
    # Ensure we never return PT0S; JOAv0 examples use minutes granularity often.
    return out.replace("PT0S", "PT0M")


_TIME_TOKEN = re.compile(
    r"(?P<num>\\d+(?:\\.\\d+)?)\\s*(?P<unit>hours?|hrs?|minutes?|mins?|min|seconds?|secs?|sec)\\b",
    flags=re.IGNORECASE,
)


def parse_duration_to_seconds(text: str) -> int | None:
    """
    Parse a free-text duration like '1 hour 30 minutes' into seconds.
    Returns None if nothing can be parsed.
    """
    total = 0.0
    matched = False
    for m in _TIME_TOKEN.finditer(text):
        matched = True
        num = float(m.group("num"))
        unit = m.group("unit").lower()
        if unit.startswith(("hour", "hr")):
            total += num * 3600
        elif unit.startswith(("min",)):
            total += num * 60
        elif unit.startswith(("sec",)):
            total += num
    return int(total) if matched else None


def parse_duration_to_iso8601(text: str) -> str | None:
    secs = parse_duration_to_seconds(text)
    if secs is None:
        return None
    # Round to nearest minute for stability in recipe metadata.
    mins = int(round(secs / 60.0))
    return f"PT{max(0, mins)}M"


