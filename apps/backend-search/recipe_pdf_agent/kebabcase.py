"""Filename normalization to kebab-case."""

from __future__ import annotations

import re
import unicodedata


_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def to_kebab_case(name: str) -> str:
    """
    Convert a filename stem to kebab-case.

    - Lowercase
    - Strip accents
    - Replace spaces/special chars with hyphens
    - Collapse multiple hyphens
    """
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = _NON_ALNUM.sub("-", s)
    s = s.strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return s or "recipe"


