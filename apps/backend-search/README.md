# Backend Search — Jamie Oliver AI

PDF recipe ingestion service that:

- Extracts text from recipe PDFs
- Produces JOAv0-compliant recipe JSON (validated)
- Generates MiniLM embeddings (384 dimensions)
- Upserts minimal metadata + embedding into Supabase Postgres (pgvector)

## Project structure

```
apps/backend-search/
├── api/                    # API endpoints (Vercel serverless)
├── recipe_search_agent/     # Semantic search agent
├── recipe_pdf_agent/        # PDF processing agent
├── recipe_pdf_agent_llama/  # PDF agent with Llama (LLM)
├── data/                    # Data (recipes, processed PDFs, errors)
├── db/                      # SQL scripts for Supabase
├── tests/                   # Unit and integration tests
├── demos/                   # Demo scripts
├── examples/                 # Exploratory scripts
├── scripts/                 # Utility scripts
└── docs/                    # Documentation
    ├── api/                 # API documentation
    ├── deployment/          # Deployment guides
    ├── ingestion/           # Ingestion documentation
    ├── design/              # Design and architecture
    ├── performance/        # Performance notes
    └── examples/            # Examples and use cases
```

## Discovery dev workflow

Runtime discovery uses **one catalog**: published rows in Supabase `recipes` only. Local JSON under `data/recipes/` and frontend `public/recipes-json/` are for ingest/seed — not for search or cards at runtime.

See [Discovery tool contract](../../docs/architecture/DISCOVERY_TOOL_CONTRACT.md).

Smoke tests (backend must be running on `:8000`):

```bash
python scripts/smoke-discovery.py
python scripts/smoke-discovery.py --save scripts/baseline-discovery.json
```


### PDF processing

- `recipe-pdf run <pdf_dir>` — Process recipe PDFs
- `recipe-pdf watch <pdf_dir>` — Watch directory and process new PDFs
- `recipe-pdf validate <json_file>` — Validate JSON against JOAv0 schema

### Recipe pipeline (URL import)

- `python -m recipe_pipeline.cli import --url "URL" --enhance --publish` — Import recipe from Jamie Oliver website
- `python -m recipe_pipeline.cli batch-import --category "vegetarian" --limit 50 --enhance` — Batch import from category
- `python -m recipe_pipeline.cli enhance-existing --input-dir path/to/jsons --publish` — Enhance existing JSON files

### JSON ingestion (local files)

```bash
# Import JSON recipes with LLM enhancement (recommended)
python ingest_json_recipes.py /path/to/recipes --enhance --publish

# Import without enhancement (faster, for pre-enhanced files)
python ingest_json_recipes.py /path/to/recipes --publish

# Dry run to preview what would be ingested
python ingest_json_recipes.py /path/to/recipes --enhance --dry-run
```

**Flags:**

- `--enhance` / `-e` — Use LLM to add Jamie Oliver voice, semantic step IDs, and timer detection
- `--publish` / `-p` — Publish recipes immediately (otherwise saved as draft)
- `--overwrite` — Re-process recipes that already exist in Supabase
- `--dry-run` — Show what would be processed without saving

## Development

### Tests

```bash
pytest tests/
```

### Demos

```bash
python demos/demo_semantic_search.py
```

### Examples

```bash
python examples/explain_text_to_vector.py
```

## Documentation

See [docs/README.md](./docs/README.md) for full documentation organized by category.


