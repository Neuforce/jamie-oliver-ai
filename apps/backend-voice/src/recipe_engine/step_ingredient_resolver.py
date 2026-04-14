"""
Map recipe steps to structured ingredients using the same stems as enrich_say_with_ingredients.

Used to limit TTS quantity injection to ingredients mentioned in the active step text.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence

from .ingredient_say_enrichment import match_tokens_for_ingredient


def _step_blob_for_matching(step: Dict[str, Any]) -> str:
    """Concatenate descr, instructions, and on_enter.say for stem overlap checks."""
    parts: List[str] = []
    if step.get("descr"):
        parts.append(str(step["descr"]))
    if step.get("instructions"):
        parts.append(str(step["instructions"]))
    on_enter = step.get("on_enter") or []
    if isinstance(on_enter, list):
        for action in on_enter:
            if isinstance(action, dict) and action.get("say"):
                parts.append(str(action["say"]))
    elif isinstance(on_enter, dict) and on_enter.get("say"):
        parts.append(str(on_enter["say"]))
    return " ".join(parts).lower()


def _stem_appears_in_blob(stem: str, blob: str) -> bool:
    if not stem or len(stem) < 2:
        return False
    pattern = re.compile(rf"\b{re.escape(stem)}\b", re.IGNORECASE)
    return pattern.search(blob) is not None


def resolve_step_ingredients(
    step: Dict[str, Any] | None,
    all_ingredients: Sequence[Dict[str, Any]] | None,
) -> List[Dict[str, Any]]:
    """
    Return ingredient dicts whose stems appear in this step's descr/instructions/on_enter.

    If no step or empty blob, returns []. If no ingredient matches, returns [].
    """
    if not step or not all_ingredients:
        return []

    blob = _step_blob_for_matching(step)
    if not blob.strip():
        return []

    seen: set[str] = set()
    out: List[Dict[str, Any]] = []

    for ing in all_ingredients:
        if not isinstance(ing, dict):
            continue
        key = str(ing.get("id") or ing.get("name") or "")
        stems = match_tokens_for_ingredient(ing)
        matched = False
        for stem in stems:
            if _stem_appears_in_blob(stem, blob):
                matched = True
                break
        if not matched:
            continue
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        out.append(ing)

    return out
