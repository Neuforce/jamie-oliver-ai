"""Heuristic parser from extracted PDF text into JOAv0 recipe JSON.

Assumption: PDFs have a consistent structure.
We still apply safe defaults and emit warnings for missing fields.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from recipe_pdf_agent.time_utils import parse_duration_to_iso8601


logger = logging.getLogger(__name__)


_RE_SERVINGS = re.compile(r"\\bserves\\s+(\\d+)\\b", flags=re.IGNORECASE)
_RE_DIFFICULTY = re.compile(
    r"\\b(super\\s*-?easy|easy|not\\s*-?too\\s*-?tricky|not\\s*-?tricky|hard)\\b",
    flags=re.IGNORECASE,
)
_RE_TIME_LINE = re.compile(r"\\b(prep|cook|total)\\b.*", flags=re.IGNORECASE)


def _guess_title(text: str) -> str:
    # Take the first non-empty line as title.
    for line in text.splitlines():
        line = line.strip()
        if line and len(line) >= 3:
            return line
    return "Unknown recipe"


def _extract_section(text: str, heading: str) -> str | None:
    # Simple heading-based split: heading line followed by content until next heading.
    # Works best when the PDF uses explicit headings like "Ingredients" / "Method".
    pattern = re.compile(rf"^\\s*{re.escape(heading)}\\s*$", flags=re.IGNORECASE | re.MULTILINE)
    m = pattern.search(text)
    if not m:
        return None
    start = m.end()
    rest = text[start:]
    # Stop at next known heading
    stop = len(rest)
    for h in ["Ingredients", "Method", "Directions", "Utensils", "You will need", "What you need", "Steps", "Instructions"]:
        if h.lower() == heading.lower():
            continue
        pm = re.compile(rf"^\\s*{re.escape(h)}\\s*$", flags=re.IGNORECASE | re.MULTILINE).search(rest)
        if pm:
            stop = min(stop, pm.start())
    out = rest[:stop].strip()
    return out or None


def _parse_ingredients(block: str | None) -> list[dict[str, Any]]:
    if not block:
        return []
    lines = [ln.strip("•*- \t") for ln in block.splitlines() if ln.strip()]
    ingredients: list[dict[str, Any]] = []
    for ln in lines:
        # naive parse: quantity/unit at start optionally, then name
        # examples: "450 g dried pasta", "1 tbsp olive oil", "Pinch of salt"
        m = re.match(r"^(?P<qty>\\d+(?:\\.\\d+)?)\\s*(?P<unit>[a-zA-Z]+)?\\s+(?P<name>.+)$", ln)
        if m:
            qty = float(m.group("qty"))
            unit = (m.group("unit") or "").strip() or None
            name = m.group("name").strip()
            ingredients.append({"name": name, "quantity": qty, "unit": unit})
        else:
            ingredients.append({"name": ln})
    return ingredients


def _parse_steps(block: str | None) -> list[dict[str, Any]]:
    if not block:
        return []

    # Split into numbered steps if possible.
    # Accept patterns like "1. ...", "1) ...", "Step 1 ..."
    chunks: list[str] = []
    current: list[str] = []
    for line in block.splitlines():
        line = line.strip()
        if not line:
            continue
        if re.match(r"^(step\\s*)?\\d+\\s*[\\.)-]\\s+", line, flags=re.IGNORECASE):
            if current:
                chunks.append(" ".join(current).strip())
                current = []
            line = re.sub(r"^(step\\s*)?\\d+\\s*[\\.)-]\\s+", "", line, flags=re.IGNORECASE)
        current.append(line)
    if current:
        chunks.append(" ".join(current).strip())

    if not chunks:
        chunks = [ln.strip() for ln in block.splitlines() if ln.strip()]

    steps: list[dict[str, Any]] = []
    for idx, instr in enumerate(chunks, 1):
        step_id = f"step_{idx}"
        # Detect a timer hint in text, e.g. "Cook for 10 minutes"
        iso = parse_duration_to_iso8601(instr)
        if iso:
            steps.append(
                {
                    "id": step_id,
                    "descr": f"Step {idx}",
                    "instructions": instr,
                    "type": "timer",
                    "auto_start": True,
                    "requires_confirm": True,
                    "duration": iso,
                    "on_enter": [{"say": f"Let's do step {idx}."}],
                }
            )
        else:
            steps.append(
                {
                    "id": step_id,
                    "descr": f"Step {idx}",
                    "instructions": instr,
                    "type": "immediate",
                    "auto_start": True,
                    "requires_confirm": True,
                    "on_enter": [{"say": f"Let's do step {idx}."}],
                }
            )
    return steps


def _guess_estimated_total(text: str) -> str:
    # Attempt to parse a line with total time; otherwise default PT0M.
    for line in text.splitlines()[:50]:
        if _RE_TIME_LINE.search(line):
            iso = parse_duration_to_iso8601(line)
            if iso:
                return iso
    return "PT0M"


def parse_recipe_from_text(*, text: str, recipe_id: str, source_file: str) -> dict[str, Any]:
    title = _guess_title(text)

    servings = 2
    m = _RE_SERVINGS.search(text)
    if m:
        try:
            servings = max(1, int(m.group(1)))
        except ValueError:
            pass
    else:
        logger.warning("Servings not found; defaulting to %s (%s)", servings, recipe_id)

    difficulty = "unknown"
    dm = _RE_DIFFICULTY.search(text)
    if dm:
        difficulty = dm.group(1).lower().replace(" ", "-")
    else:
        logger.warning("Difficulty not found; defaulting to '%s' (%s)", difficulty, recipe_id)

    estimated_total = _guess_estimated_total(text)
    if estimated_total == "PT0M":
        logger.warning("Estimated total not found; defaulting to PT0M (%s)", recipe_id)

    ingredients_block = (
        _extract_section(text, "Ingredients")
        or _extract_section(text, "INGREDIENTS")
    )
    utensils_block = (
        _extract_section(text, "Utensils")
        or _extract_section(text, "You will need")
        or _extract_section(text, "What you need")
    )
    method_block = (
        _extract_section(text, "Method")
        or _extract_section(text, "Directions")
        or _extract_section(text, "Instructions")
    )

    ingredients = _parse_ingredients(ingredients_block)
    utensils = []
    if utensils_block:
        utensils = [ln.strip("•*- \t") for ln in utensils_block.splitlines() if ln.strip()]
    steps = _parse_steps(method_block)

    if not steps:
        # fallback: use whole doc as a single step
        steps = [
            {
                "id": "step_1",
                "descr": "Step 1",
                "instructions": text.strip()[:4000],
                "type": "immediate",
                "auto_start": True,
                "requires_confirm": True,
                "on_enter": [{"say": "Let's get started."}],
            }
        ]

    # Dependencies/next not inferred in v1; keep empty.
    doc: dict[str, Any] = {
        "recipe": {
            "id": recipe_id,
            "title": title,
            "servings": servings,
            "estimated_total": estimated_total,
            "difficulty": difficulty,
            "locale": "en",
            "description": "",
            "tags": [],
            "source": "pdf",
        },
        "ingredients": ingredients,
        "utensils": utensils,
        "steps": steps,
        "notes": {"source_file": source_file},
    }
    return doc


