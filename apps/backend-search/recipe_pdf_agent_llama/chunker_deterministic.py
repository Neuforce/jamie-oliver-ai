"""Deterministic chunking with multi-view semantic generation."""

from __future__ import annotations

from typing import Any

from recipe_pdf_agent_llama.chunker_multiview import generate_multiview_chunks


def build_deterministic_chunks(
    *,
    recipe_id: str,
    joav0_doc: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Generate multi-view semantic chunks deterministically (no LLM).
    
    Fast, consistent, and optimized for all query types:
    - Ingredient-based queries
    - Time-based queries
    - Difficulty queries
    - Occasion queries (christmas, party, etc.)
    - Technique queries (bake, grill, no-cook)
    - Dietary queries (vegan, gluten-free)
    - Mood queries (quick, fresh, comfort)
    - Natural language queries
    """
    return generate_multiview_chunks(
        recipe_id=recipe_id,
        joav0_doc=joav0_doc,
    )

