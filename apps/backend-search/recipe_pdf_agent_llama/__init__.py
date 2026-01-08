"""Llama 3.1 (Ollama) PDF recipe ingestion agent.

This module is intentionally separate from `recipe_pdf_agent/` (heuristic pipeline).
It uses a lightweight PDF text extractor plus Llama 3.1 for:
- understanding/cleaning
- JOAv0 JSON structuring (schema-compliant)
- search-intent chunk generation (3–10 chunks)
"""


