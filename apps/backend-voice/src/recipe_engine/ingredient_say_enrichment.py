"""
Enrich step narration (`on_enter.say`) with quantities from structured ingredients.

Keeps a single implementation path so TTS/recipe_message matches the ingredient list.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence

# If we match this stem, do not replace when followed by these.
_STEM_FALSE_PREFIX: Dict[str, tuple[str, ...]] = {
    "egg": ("plant",),
}


def _float_quantity(quantity: Any) -> float | None:
    if quantity is None:
        return None
    try:
        return float(quantity)
    except (TypeError, ValueError):
        return None


def _is_effectively_one(q: float) -> bool:
    return abs(q - 1.0) < 1e-9


def _spoken_unit_label(unit_key: str, q: float) -> str:
    """
    Expand abbreviations to full words for TTS (ElevenLabs often reads lone \"g\" as the letter G).

    Uses singular/plural where it matters in English (gram vs grams).
    """
    if unit_key in ("g", "gram", "grams"):
        return "gram" if _is_effectively_one(q) else "grams"
    if unit_key in ("kg", "kilogram", "kilograms"):
        return "kilogram" if _is_effectively_one(q) else "kilograms"
    if unit_key in ("ml", "milliliter", "milliliters", "millilitre", "millilitres"):
        return "milliliter" if _is_effectively_one(q) else "milliliters"
    if unit_key in ("l", "liter", "liters", "litre", "litres"):
        return "liter" if _is_effectively_one(q) else "liters"
    if unit_key in ("tsp", "teaspoon", "teaspoons"):
        return "teaspoon" if _is_effectively_one(q) else "teaspoons"
    if unit_key in ("tbsp", "tablespoon", "tablespoons"):
        return "tablespoon" if _is_effectively_one(q) else "tablespoons"
    if unit_key in ("oz", "ounce", "ounces"):
        return "ounce" if _is_effectively_one(q) else "ounces"
    if unit_key in ("cup", "cups"):
        return "cup" if _is_effectively_one(q) else "cups"
    if unit_key in ("pinch", "pinches"):
        return "pinch" if _is_effectively_one(q) else "pinches"
    if unit_key in ("clove", "cloves"):
        return "clove" if _is_effectively_one(q) else "cloves"
    return ""


def _normalize_unit_for_speech(unit_raw: str, q: float) -> str:
    """Return a TTS-friendly unit string; unknown units pass through stripped."""
    if not isinstance(unit_raw, str) or not unit_raw.strip():
        return ""
    key = unit_raw.strip().lower()
    spoken = _spoken_unit_label(key, q)
    if spoken:
        return spoken
    return unit_raw.strip()


def format_ingredient_phrase(ing: Dict[str, Any]) -> str:
    """
    Build a short spoken phrase for an ingredient dict (aligned with get_ingredients).

    Uses full unit words (e.g. \"grams\" not \"g\") so TTS does not read \"G\" as a letter.
    """
    if not isinstance(ing, dict):
        return str(ing).strip()

    name = (ing.get("name") or "").strip()
    quantity = ing.get("quantity")
    unit = ing.get("unit")
    unit_str = unit.strip() if isinstance(unit, str) else ""

    if quantity is not None and unit_str:
        qf = _float_quantity(quantity)
        if qf is None:
            q_disp = quantity
            return f"{q_disp} {unit_str} {name}".strip()
        q = int(qf) if qf == int(qf) else qf
        spoken_unit = _normalize_unit_for_speech(unit_str, qf)
        return f"{q} {spoken_unit} {name}".strip()

    if quantity is not None:
        q = quantity
        if isinstance(q, float) and q.is_integer():
            q = int(q)
        return f"{q} {name}".strip()

    return name


def _strip_leading_quantity_from_name(name: str) -> str:
    """Remove a leading number from the display name for stem extraction."""
    return re.sub(
        r"^\d+(?:\.\d+)?\s+",
        "",
        name.strip(),
        flags=re.IGNORECASE,
    )


def match_tokens_for_ingredient(ing: Dict[str, Any]) -> List[str]:
    """
    Tokens to search for in prose, longest / most specific first.

    Public wrapper used by step-scoped ingredient resolution (TTS enrichment).
    """
    return _match_tokens_for_ingredient(ing)


def _match_tokens_for_ingredient(ing: Dict[str, Any]) -> List[str]:
    """
    Tokens to search for in prose, longest / most specific first.
    """
    name = (ing.get("name") or "").strip()
    segment = _strip_leading_quantity_from_name(name)
    segment = segment.split(",")[0].strip()
    words = [w for w in segment.split() if w]
    tokens: List[str] = []
    if len(words) >= 2:
        tokens.append(" ".join(words[-2:]))
    if words:
        w = words[-1]
        tokens.append(w)
        if len(w) > 2 and not w.endswith("s"):
            tokens.append(w + "s")
        elif len(w) > 2 and w.endswith("s") and len(w) > 3:
            tokens.append(w[:-1])

    seen = set()
    out: List[str] = []
    for t in sorted(set(tokens), key=len, reverse=True):
        tl = t.lower()
        if tl not in seen and len(t) >= 2:
            seen.add(tl)
            out.append(t)
    return out


def _phrase_variants_for_compare(phrase: str) -> set[str]:
    """
    Same quantity+ingredient may appear as \"250 g\" or \"250 grams\" in prose.
    Treat them as equivalent so we do not double-insert when enriching.
    """
    if not phrase:
        return set()
    p = phrase.lower().strip()
    out: set[str] = {p}
    # grams <-> g
    out.add(re.sub(r"(\d+(?:\.\d+)?)\s+grams\s+", r"\1 g ", p))
    out.add(re.sub(r"(\d+(?:\.\d+)?)\s+gram\s+", r"\1 g ", p))
    out.add(re.sub(r"(\d+(?:\.\d+)?)\s+g\s+", r"\1 grams ", p))
    # milliliters <-> ml
    out.add(re.sub(r"(\d+(?:\.\d+)?)\s+milliliters\s+", r"\1 ml ", p))
    out.add(re.sub(r"(\d+(?:\.\d+)?)\s+milliliter\s+", r"\1 ml ", p))
    out.add(re.sub(r"(\d+(?:\.\d+)?)\s+ml\s+", r"\1 milliliters ", p))
    return out


def _already_has_phrase(text: str, phrase: str) -> bool:
    if not phrase:
        return True
    tl = text.lower()
    for pv in _phrase_variants_for_compare(phrase):
        if pv in tl:
            return True
    return False


def _bad_eggplant(match: re.Match[str], text: str) -> bool:
    stem = match.group(0).lower()
    if stem != "egg":
        return False
    rest = text[match.end() :]
    return rest.lower().startswith("plant")


# Text before an ingredient stem already includes a quantity (e.g. model scaled servings).
_TRAILING_QTY = re.compile(r"(?:\d+(?:\.\d+)?|\d+\s*/\s*\d+)\s*$", re.IGNORECASE)
# "300 g", "2 tbsp", "4 large" before the ingredient word.
_TRAILING_QTY_WORD = re.compile(
    r"\d+(?:\.\d+)?\s+[a-zA-Z]{1,24}\s*$",
    re.IGNORECASE,
)


def _quantity_precedes_stem(text: str, stem_start: int) -> bool:
    """
    True when prose already states an amount (or amount + word) right before this stem.

    Avoids turning e.g. \"Add 4 eggs\" into \"Add 4 2 eggs\" when structured data still
    has the original portion (NEU-612).
    """
    if stem_start <= 0:
        return False
    pre = text[:stem_start].rstrip()
    if not pre:
        return False
    if _TRAILING_QTY.search(pre):
        return True
    if _TRAILING_QTY_WORD.search(pre):
        return True
    return False


def enrich_say_with_ingredients(say: str, ingredients: Sequence[Dict[str, Any]] | None) -> str:
    """
    Insert quantities into `say` where ingredient names appear without amounts.

    Heuristic: replace bare name tokens (word boundaries) with `format_ingredient_phrase`,
    longest tokens first. Skips if the formatted phrase already appears in the string.
    """
    if not say or not ingredients:
        return say

    prepared: List[tuple[str, List[str]]] = []
    for ing in ingredients:
        if not isinstance(ing, dict):
            continue
        phrase = format_ingredient_phrase(ing)
        if not phrase:
            continue
        stems = _match_tokens_for_ingredient(ing)
        if not stems:
            continue
        prepared.append((phrase, stems))

    prepared.sort(key=lambda x: max((len(t) for t in x[1]), default=0), reverse=True)

    result = say
    for phrase, stems in prepared:
        if _already_has_phrase(result, phrase):
            continue
        for stem in stems:
            if _already_has_phrase(result, phrase):
                break
            pattern = re.compile(rf"\b{re.escape(stem)}\b", re.IGNORECASE)

            def _repl(m: re.Match[str], phrase: str = phrase) -> str:
                if _bad_eggplant(m, result):
                    return m.group(0)
                if _quantity_precedes_stem(result, m.start()):
                    return m.group(0)
                false_suffix = _STEM_FALSE_PREFIX.get(m.group(0).lower())
                if false_suffix:
                    tail = result[m.end() :].lower()
                    for suf in false_suffix:
                        if tail.startswith(suf):
                            return m.group(0)
                return phrase

            new_result, n = pattern.subn(_repl, result, count=1)
            if n:
                result = new_result
                break

    return result
