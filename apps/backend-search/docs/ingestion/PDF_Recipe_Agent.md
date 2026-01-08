# PDF Recipe Agent (JOAv0 JSON + Supabase pgvector)

This module watches a folder of recipe PDFs and automatically:
- Renames PDFs to kebab-case
- Extracts text (PyMuPDF)
- Parses into a **JOAv0-compliant** recipe JSON (validated via JSON Schema)
- Generates a **384-dim** embedding for semantic search
- Upserts **minimal metadata + embedding** into Supabase Postgres (pgvector)

## Prerequisites
- Python 3.13+ (this repo ships with a project-local venv under `jamie-oliver-ai/.venv`)
- A Supabase project with Postgres + pgvector enabled

## Database setup (Supabase SQL editor)
Run:
- `jamie-oliver-ai/db/setup_384.sql`

This creates `recipe_index` with:
- `embedding VECTOR(384)`
- `ingredients_text` for ingredient filtering (ILIKE / tsvector index)
- `semantic_recipe_search(...)` SQL function for hybrid search

## Environment variables
Set these in `jamie-oliver-ai/.env` (do not commit secrets):

- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

Optional:
- `RECIPE_PDF_LOG_LEVEL=INFO`
- `RECIPE_PDF_SUPABASE_TABLE=recipe_index`
- `RECIPE_PDF_SUPABASE_KEY_ENV=SUPABASE_SERVICE_ROLE_KEY`

## Install / run
Create a venv and install:

```bash
cd jamie-oliver-ai
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -U pip
python -m pip install -e .
```

## Commands

Batch process current PDFs in a folder:

```bash
recipe-pdf run data/recipes
```

Watch a folder (drop-in workflow):

```bash
recipe-pdf watch data/recipes
```

Validate a generated recipe JSON:

```bash
recipe-pdf validate data/recipes_json/some-recipe.json
```

## Output conventions
- Input PDFs live in: `data/recipes/` (config default; can pass a directory to the CLI)
- Generated JSON goes to: `data/recipes_json/`
- Processed PDFs moved to: `data/processed_pdfs/`
- Failed PDFs moved to: `data/errors/` and an `*.invalid.json` is written for inspection


