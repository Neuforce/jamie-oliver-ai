"""Prompts for Llama-based recipe understanding, structuring, and chunking."""

from __future__ import annotations


SYSTEM_JSON_ONLY = (
    "You are a strict JSON emitter. "
    "Output ONLY valid JSON (no markdown fences, no prose, no comments). "
    "If unsure, return empty strings/nulls, but keep JSON valid."
)


def understand_prompt(raw_text: str) -> str:
    return (
        "Extract key recipe fields from the cleaned PDF text. "
        "Return ONLY a JSON object with keys: "
        "title, servings, difficulty, time, ingredients_text, utensils_text, method_text, notes. "
        "Use empty string for missing *_text fields; use null for missing scalars.\n\n"
        f"RAW_TEXT:\n{raw_text}"
    )


def clean_text_prompt(raw_text: str) -> str:
    return (
        "Clean and normalize the full recipe text extracted from PDF. "
        "Remove repeated headers/footers, page numbers, and obvious artifacts. "
        "Keep all semantic content (title, ingredients, instructions, notes). "
        "Return ONLY JSON: {\"clean_text\": \"...\"} with a single string containing the cleaned recipe text.\n\n"
        f"RAW_TEXT:\n{raw_text}"
    )


def joav0_prompt(*, recipe_id: str, source_file: str, understood: dict) -> str:
    return (
        "Convert the understood recipe into a JOAv0 JSON object. "
        "Return ONLY JSON with keys: recipe, ingredients, utensils, steps, notes. "
        "Rules: recipe.description is a string (empty if unknown); recipe.estimated_total ISO-8601 (e.g., PT20M); "
        "steps is non-empty; each step has id, descr, instructions, type (use 'timer' with duration if a timer is found), "
        "auto_start, requires_confirm; keep locale='en', source='pdf'; use recipe_id exactly as given.\n"
        f"recipe_id: {recipe_id}\n"
        f"source_file: {source_file}\n"
        f"UNDERSTOOD_JSON: {understood}"
    )


def fix_joav0_prompt(*, prior_json: dict, errors: list[str]) -> str:
    return (
        "You produced a JOAv0 JSON document that failed schema validation.\n"
        "Fix the JSON to satisfy the schema errors listed.\n"
        "Return ONLY the corrected JOAv0 JSON.\n\n"
        f"SCHEMA_ERRORS: {errors}\n"
        f"PRIOR_JSON: {prior_json}"
    )


def chunking_prompt(*, recipe_id: str, joav0_doc: dict) -> str:
    return (
        "Generate search-intent chunks for semantic search based on the structured recipe JSON. "
        "Analyze the recipe and create as many chunks as needed to cover all meaningful search angles. "
        "Each chunk should be a concise, standalone queryable concept that someone might search for. "
        "Consider: main ingredients, cuisine type, meal type, cooking method, dietary tags, flavor profiles, occasions, difficulty, time. "
        "Return ONLY a valid JSON array of objects. Each object must use curly braces {} with these fields: chunk_text, search_intent, llm_analysis.\n"
        "Example format:\n"
        '[{"chunk_text": "Quick pasta recipe", "search_intent": "find quick recipes", "llm_analysis": {}}]\n'
        "No markdown, no extra text.\n"
        f"recipe_id: {recipe_id}\n"
        f"RECIPE_JSON: {joav0_doc}"
    )


def block_classification_prompt(*, block_text: str, page: int, column: str, order_hint: float) -> str:
    return (
        "Classify the given PDF block and clean it minimally.\n"
        "Return ONLY JSON with keys: label, clean_text.\n"
        "label must be one of: header, meta, ingredient, method_step, note, other.\n"
        "Keep ingredient quantity/unit if present. Do not expand or summarize, just clean OCR noise.\n\n"
        f"PAGE: {page}, COLUMN: {column}, ORDER_HINT: {order_hint}\n"
        f"BLOCK:\n{block_text}"
    )


def blocks_to_markdown_prompt(*, left_blocks: list[str], right_blocks: list[str]) -> str:
    return (
        "You are given the text blocks of a two-column recipe PDF.\n"
        "- Left column is typically INGREDIENTS; right column is typically METHOD (steps).\n"
        "- Produce a concise markdown with sections: \n"
        "  # Title\n"
        "  ## Meta\n"
        "  - time: ... (PTxxM if possible, else text)\n"
        "  - difficulty: ...\n"
        "  - servings: ...\n"
        "  ## Ingredients\n"
        "  - item per line (keep qty/unit if present)\n"
        "  ## Method\n"
        "  1. step ...\n"
        "  2. step ...\n"
        "  ## Notes (optional)\n"
        "Rules: Use only the provided text; do not invent ingredients or steps; do not summarize away items; keep ordering of steps as in right column; keep ingredient lines separate.\n"
        "Return ONLY JSON: {\"markdown\": \"...\"} with the markdown as a single string.\n\n"
        f"LEFT_BLOCKS:\n{left_blocks}\n\nRIGHT_BLOCKS:\n{right_blocks}"
    )


