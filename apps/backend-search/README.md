# Backend Search - Jamie Oliver AI

PDF recipe ingestion service that:
- Extracts text from recipe PDFs
- Produces JOAv0-compliant recipe JSON (validated)
- Generates MiniLM embeddings (384 dims)
- Upserts minimal metadata + embedding into Supabase Postgres (pgvector)

## Estructura del Proyecto

```
apps/backend-search/
├── api/                    # API endpoints (Vercel serverless)
├── recipe_search_agent/     # Agente de búsqueda semántica
├── recipe_pdf_agent/        # Agente de procesamiento de PDFs
├── recipe_pdf_agent_llama/  # Agente de PDFs con Llama (LLM)
├── data/                    # Datos (recetas, PDFs procesados, errores)
├── db/                      # Scripts SQL para Supabase
├── tests/                   # Tests unitarios e integración
├── demos/                   # Scripts de demostración
├── examples/                 # Scripts explicativos
├── scripts/                 # Scripts de utilidad
└── docs/                    # Documentación organizada
    ├── api/                 # Documentación de API
    ├── deployment/          # Guías de despliegue
    ├── ingestion/           # Documentación de ingesta
    ├── design/              # Diseño y arquitectura
    ├── performance/        # Notas de rendimiento
    └── examples/            # Ejemplos y casos de uso
```

## CLI

### PDF Processing
- `recipe-pdf run <pdf_dir>` - Procesar PDFs de recetas
- `recipe-pdf watch <pdf_dir>` - Monitorear directorio y procesar nuevos PDFs
- `recipe-pdf validate <json_file>` - Validar JSON contra schema JOAv0

### Recipe Pipeline (URL Import)
- `python -m recipe_pipeline.cli import --url "URL" --enhance --publish` - Import recipe from Jamie Oliver website
- `python -m recipe_pipeline.cli batch-import --category "vegetarian" --limit 50 --enhance` - Batch import from category
- `python -m recipe_pipeline.cli enhance-existing --input-dir path/to/jsons --publish` - Enhance existing JSON files

### JSON Ingestion (Local Files)
```bash
# Import JSON recipes with LLM enhancement (recommended)
python ingest_json_recipes.py /path/to/recipes --enhance --publish

# Import without enhancement (faster, for pre-enhanced files)
python ingest_json_recipes.py /path/to/recipes --publish

# Dry run to preview what would be ingested
python ingest_json_recipes.py /path/to/recipes --enhance --dry-run
```

**Flags:**
- `--enhance` / `-e` - Use LLM to add Jamie Oliver voice, semantic step IDs, and timer detection
- `--publish` / `-p` - Publish recipes immediately (otherwise saved as draft)
- `--overwrite` - Re-process recipes that already exist in Supabase
- `--dry-run` - Show what would be processed without saving

## Desarrollo

### Tests
```bash
pytest tests/
```

### Demos
```bash
python demos/demo_semantic_search.py
```

### Ejemplos
```bash
python examples/explain_text_to_vector.py
```

## Documentación

Ver [docs/README.md](./docs/README.md) para documentación completa organizada por categorías.


