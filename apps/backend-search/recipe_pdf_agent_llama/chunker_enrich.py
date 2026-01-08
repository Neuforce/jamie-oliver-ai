"""LLM light enrichment for chunk metadata classification."""

from __future__ import annotations

import logging
from typing import Any

from recipe_pdf_agent_llama.ollama_client import OllamaConfig, chat_json

logger = logging.getLogger(__name__)


def enrich_chunks_with_llm(
    *,
    chunks: list[dict[str, Any]],
    ollama_base_url: str,
    model: str = "llama3.1",
    timeout_per_chunk: int = 10,
) -> list[dict[str, Any]]:
    """
    Enrich chunks with LLM-generated metadata (classification only, fast).
    
    For each chunk, LLM classifies:
    - dietary_tags: ["vegetarian", "vegan", "gluten-free", etc.]
    - cuisine: "italian", "asian", "international", etc.
    - meal_type: ["breakfast", "lunch", "dinner", "snack"]
    - season: "winter", "summer", "spring", "fall", or null
    - occasion: ["christmas", "party", "weeknight", etc.]
    - techniques: ["bake", "grill", "no-cook", etc.]
    
    Uses short timeout per chunk (default 10s) to avoid blocking.
    If LLM fails, chunk keeps its existing metadata.
    """
    enriched = []
    
    for i, chunk in enumerate(chunks):
        try:
            # Generate classification prompt
            prompt = _create_classification_prompt(chunk["chunk_text"])
            
            # Call LLM with short timeout
            metadata = chat_json(
                cfg=OllamaConfig(
                    base_url=ollama_base_url,
                    model=model,
                    timeout_s=float(timeout_per_chunk),
                ),
                system="You are a recipe metadata classifier. Return ONLY valid JSON with keys: dietary_tags (array), cuisine (string), meal_type (array), season (string or null), occasion (array), techniques (array). No extra text.",
                user=prompt,
            )
            
            # Merge LLM metadata into existing llm_analysis
            if isinstance(metadata, dict):
                chunk["llm_analysis"] = chunk.get("llm_analysis", {})
                chunk["llm_analysis"].update(metadata)
                logger.debug(f"Enriched chunk {i+1}/{len(chunks)}: {metadata}")
            
            enriched.append(chunk)
            
        except Exception as e:
            logger.warning(f"Failed to enrich chunk {i+1}: {e}. Keeping original.")
            enriched.append(chunk)
    
    logger.info(f"LLM enrichment completed for {len(enriched)} chunks")
    return enriched


def _create_classification_prompt(chunk_text: str) -> str:
    """Create a concise classification prompt for the chunk."""
    return f"""Classify this recipe chunk and return metadata as JSON.

Chunk: "{chunk_text}"

Return JSON with:
- dietary_tags: array of tags like ["vegetarian", "vegan", "gluten-free", "dairy-free", "low-carb"]
- cuisine: string like "italian", "asian", "mexican", "international", "american"
- meal_type: array like ["breakfast", "lunch", "dinner", "snack", "side", "dessert"]
- season: string like "winter", "summer", "spring", "fall" or null
- occasion: array like ["christmas", "party", "weeknight", "bbq", "holiday"]
- techniques: array like ["bake", "grill", "fry", "no-cook", "slow-cook"]

Output ONLY the JSON, no extra text."""


