"""Embedding generation utilities (384-dim) for semantic search.

We use `fastembed` (ONNX-runtime) to avoid heavy PyTorch dependencies and to
keep query-time latency low.
"""

from __future__ import annotations

import logging
from functools import lru_cache

import numpy as np
from fastembed import TextEmbedding

logger = logging.getLogger(__name__)


@lru_cache(maxsize=2)
def _get_model(model_name: str) -> TextEmbedding:
    logger.info("Loading embedding model: %s", model_name)
    return TextEmbedding(model_name=model_name)


def embed_text(text: str, *, model_name: str) -> list[float]:
    """
    Generate a single embedding vector for the given text.

    Returns:
        A list[float] of length 384 for the configured model.
    """
    model = _get_model(model_name)
    vec = next(model.embed([text]))
    if isinstance(vec, np.ndarray):
        return vec.astype(float).tolist()
    # fastembed returns numpy arrays today; keep a safe fallback.
    return [float(x) for x in vec]


