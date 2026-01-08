# Llama 3.1 PDF Recipe Agent (Ollama) — JOAv0 JSON + Intelligent Chunks

This is a **new** ingestion pipeline (separate from `recipe_pdf_agent/`) that uses:
- **Lightweight PDF text extraction** (`pdfplumber`)
- **Llama 3.1 via local Ollama** for understanding + JOAv0 structuring + search-intent chunking
- **384-dim embeddings** (`fastembed`) per chunk
- Supabase Postgres (pgvector) storage into **`intelligent_recipe_chunks`**

## 1) Supabase DB setup
In the Supabase SQL editor, run:
- `jamie-oliver-ai/db/setup_intelligent_chunks_384.sql`

## 2) Ollama setup
Install and run Ollama locally, then pull the model:

```bash
ollama pull llama3.1
ollama serve
```

Default agent expects Ollama at `http://localhost:11434`.

## 3) Environment variables
Set in `jamie-oliver-ai/.env` (never commit secrets):

- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

Optional overrides:
- `RECIPE_LLAMA_LOG_LEVEL=INFO`
- `RECIPE_LLAMA_OLLAMA_URL=http://localhost:11434`
- `RECIPE_LLAMA_MODEL=llama3.1`
- `RECIPE_LLAMA_SUPABASE_TABLE=intelligent_recipe_chunks`

## 4) Install + run

```bash
cd jamie-oliver-ai
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -U pip
python -m pip install -e .
```

### Batch run
```bash
recipe-llama run data/recipes
```

### Watch mode (drop PDFs into the folder)
```bash
recipe-llama watch data/recipes
```

### Validate output JSON
```bash
recipe-llama validate data/recipes_json/some-recipe.json
```

## Output conventions
- Inbox: `data/recipes/`
- JSON output: `data/recipes_json/`
- Processed PDFs: `data/processed_pdfs/`
- Errors: `data/errors/`

## Notes
- If Ollama is not running (or `llama3.1` is not pulled), the pipeline will fail with a clear error.
- Chunk upserts are idempotent via `(recipe_id, chunk_hash)` unique index.


