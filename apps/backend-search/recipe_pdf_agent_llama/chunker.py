"""Semantic multi-view chunk generation with density optimization."""

from __future__ import annotations

import logging
from typing import Any

from recipe_pdf_agent_llama.config import LlamaAgentConfig
from recipe_pdf_agent_llama.chunker_deterministic import build_deterministic_chunks

logger = logging.getLogger(__name__)


def build_intelligent_chunks(
    *,
    cfg: LlamaAgentConfig,
    recipe_id: str,
    clean_text: str,  # Kept for compatibility but not used
    joav0_doc: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Generate semantic multi-view chunks with optional density optimization.
    
    Phase 1: Multi-view generation (deterministic)
    - Generates chunks from multiple perspectives
    - Optimized for all query types (ingredients, time, occasion, etc.)
    
    Phase 2: Density optimization (optional, with embeddings)
    - Merges semantically similar chunks
    - Variable chunk sizes based on semantic density
    """
    # Phase 1: Generate multi-view chunks
    chunks = build_deterministic_chunks(
        recipe_id=recipe_id,
        joav0_doc=joav0_doc,
    )
    
    # Phase 2: Optimize by semantic density (if enabled)
    if hasattr(cfg, "enable_density_optimization") and cfg.enable_density_optimization:
        try:
            from fastembed import TextEmbedding
            from recipe_pdf_agent_llama.chunker_density import optimize_chunks_by_density
            
            # Initialize embedding model
            embedding_model = TextEmbedding(model_name=cfg.embedding_model)
            
            # Optimize chunks
            chunks = optimize_chunks_by_density(
                chunks=chunks,
                embedding_model=embedding_model,
                similarity_threshold=getattr(cfg, "density_threshold", 0.85),
            )
            
            logger.info(
                "Chunks optimized by density: %d total (%s)",
                len(chunks),
                recipe_id,
            )
            
        except Exception as e:
            logger.warning(f"Density optimization failed: {e}. Using unoptimized chunks.")
    
    # Phase 3: LLM light enrichment (if enabled)
    if hasattr(cfg, "enable_llm_enrichment") and cfg.enable_llm_enrichment:
        try:
            from recipe_pdf_agent_llama.chunker_enrich import enrich_chunks_with_llm
            
            chunks = enrich_chunks_with_llm(
                chunks=chunks,
                ollama_base_url=cfg.ollama_base_url,
                model=getattr(cfg, "enrichment_model", cfg.ollama_model),
                timeout_per_chunk=getattr(cfg, "enrichment_timeout", 10),
            )
            
            logger.info(
                "Chunks enriched with LLM metadata (%s)",
                recipe_id,
            )
            
        except Exception as e:
            logger.warning(f"LLM enrichment failed: {e}. Using unenriched chunks.")
    
    logger.info("Chunks ready: %d (%s)", len(chunks), recipe_id)
    return chunks


