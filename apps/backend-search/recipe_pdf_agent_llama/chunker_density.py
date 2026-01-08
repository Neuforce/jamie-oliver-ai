"""Semantic density calculator using embeddings to optimize chunk sizes."""

from __future__ import annotations

import logging
from hashlib import sha256
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


def _hash_chunk(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


def optimize_chunks_by_density(
    chunks: list[dict[str, Any]],
    embedding_model: Any,
    similarity_threshold: float = 0.85,
) -> list[dict[str, Any]]:
    """
    Optimize chunk sizes based on semantic density.
    
    Groups chunks with high similarity (>threshold) into larger, denser chunks.
    Keeps semantically distinct chunks separate.
    
    Args:
        chunks: List of chunk dicts with chunk_text
        embedding_model: TextEmbedding model from fastembed
        similarity_threshold: Threshold for merging (0.85 = 85% similar)
    
    Returns:
        Optimized list of chunks with variable sizes
    """
    if not chunks:
        return chunks
    
    if len(chunks) <= 2:
        # Too few chunks to optimize
        return chunks
    
    try:
        # Generate embeddings for all chunks
        chunk_texts = [c["chunk_text"] for c in chunks]
        embeddings = list(embedding_model.embed(chunk_texts))
        embeddings = np.array(embeddings)
        
        # Calculate pairwise cosine similarity
        similarities = _cosine_similarity_matrix(embeddings)
        
        # Group similar chunks
        merged_chunks = _merge_by_similarity(chunks, similarities, similarity_threshold)
        
        logger.info(f"Optimized {len(chunks)} chunks -> {len(merged_chunks)} chunks (density threshold={similarity_threshold})")
        
        return merged_chunks
        
    except Exception as e:
        logger.warning(f"Failed to optimize chunks by density: {e}. Returning original chunks.")
        return chunks


def _cosine_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """Calculate pairwise cosine similarity matrix."""
    # Normalize embeddings
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    normalized = embeddings / (norms + 1e-10)
    
    # Compute similarity matrix
    similarity = np.dot(normalized, normalized.T)
    
    return similarity


def _merge_by_similarity(
    chunks: list[dict[str, Any]],
    similarities: np.ndarray,
    threshold: float,
) -> list[dict[str, Any]]:
    """
    Merge chunks with similarity above threshold.
    
    Strategy:
    - Group chunks that are highly similar (>threshold)
    - Merge them into a single, more comprehensive chunk
    - Keep semantically distinct chunks separate
    """
    n = len(chunks)
    merged = []
    used = set()
    
    for i in range(n):
        if i in used:
            continue
        
        # Find all chunks similar to chunk i
        similar_indices = []
        for j in range(n):
            if i != j and j not in used and similarities[i, j] >= threshold:
                similar_indices.append(j)
        
        if not similar_indices:
            # No similar chunks, keep original
            merged.append(chunks[i])
            used.add(i)
        else:
            # Merge similar chunks
            group_indices = [i] + similar_indices
            merged_chunk = _merge_chunk_group([chunks[idx] for idx in group_indices])
            merged.append(merged_chunk)
            used.update(group_indices)
    
    return merged


def _merge_chunk_group(chunk_group: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Merge a group of similar chunks into one dense chunk.
    
    Strategy:
    - Combine chunk texts (keep unique phrases)
    - Merge llm_analysis metadata
    - Update semantic_density score
    - Set view_type to "merged"
    """
    # Combine texts (remove duplicates)
    texts = [c["chunk_text"] for c in chunk_group]
    unique_phrases = []
    seen_words = set()
    
    for text in texts:
        words = set(text.lower().split())
        if not words.issubset(seen_words):
            unique_phrases.append(text)
            seen_words.update(words)
    
    # Combine into dense chunk
    if len(unique_phrases) == 1:
        merged_text = unique_phrases[0]
    else:
        # Combine with separator
        merged_text = " | ".join(unique_phrases)
    
    # Merge metadata
    search_intents = [c.get("search_intent", "") for c in chunk_group if c.get("search_intent")]
    view_types = [c.get("view_type", "") for c in chunk_group if c.get("view_type")]
    
    # Merge llm_analysis
    merged_analysis = {"merged_from": len(chunk_group)}
    for c in chunk_group:
        if c.get("llm_analysis"):
            merged_analysis.update(c["llm_analysis"])
    
    return {
        "chunk_text": merged_text,
        "chunk_hash": _hash_chunk(merged_text),
        "search_intent": " | ".join(set(search_intents)),
        "view_type": f"merged_{len(chunk_group)}",
        "semantic_density": len(chunk_group) / 10.0,  # Normalized density score
        "llm_analysis": merged_analysis,
    }


def calculate_chunk_density_scores(
    chunks: list[dict[str, Any]],
    embedding_model: Any,
) -> list[dict[str, Any]]:
    """
    Calculate and add semantic_density score to each chunk.
    
    Density = average similarity to other chunks (0.0 to 1.0)
    - High density (>0.7): Chunk is very similar to many others
    - Low density (<0.3): Chunk is unique/distinct
    """
    if len(chunks) <= 1:
        # Single chunk, density = 1.0
        for c in chunks:
            c["semantic_density"] = 1.0
        return chunks
    
    try:
        # Generate embeddings
        chunk_texts = [c["chunk_text"] for c in chunks]
        embeddings = list(embedding_model.embed(chunk_texts))
        embeddings = np.array(embeddings)
        
        # Calculate similarity matrix
        similarities = _cosine_similarity_matrix(embeddings)
        
        # Calculate density for each chunk (average similarity to others)
        for i, chunk in enumerate(chunks):
            # Exclude self-similarity
            other_similarities = np.concatenate([similarities[i, :i], similarities[i, i+1:]])
            density = float(np.mean(other_similarities))
            chunk["semantic_density"] = round(density, 3)
        
        return chunks
        
    except Exception as e:
        logger.warning(f"Failed to calculate density scores: {e}")
        # Default density
        for c in chunks:
            c["semantic_density"] = 0.5
        return chunks

