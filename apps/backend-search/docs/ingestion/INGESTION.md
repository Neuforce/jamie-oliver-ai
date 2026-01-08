# 📥 Recipe PDF Ingestion Pipeline

## What It Does

Extracts recipe data from PDFs, parses it into structured JSON (JOAv0 schema), generates semantic chunks, creates embeddings, and stores everything in Supabase for search.

**Input:** PDF files with recipes  
**Output:** Validated JSON + 7-10 semantic chunks + 384D embeddings → Supabase

---

## Libraries Used

- **`pdfplumber`** - PDF text extraction with coordinates
- **`langchain`** + **`langchain-ollama`** - LLM orchestration framework
- **`pydantic`** - Data validation with typed models
- **Ollama** + **Llama 3.1/3.2** - Local LLM for parsing
- **`fastembed`** - Fast embedding generation (BAAI/bge-small-en-v1.5)
- **`supabase-py`** - PostgreSQL + pgvector client

---

## Pipeline Diagram

```text
┌─────────────────────────────────────────────────────┐
│  INPUT: recipe.pdf                                  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  1. PDF EXTRACTION (pdfplumber)                     │
│     • Extract text with coordinates                 │
│     • Separate left/right columns                   │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  2. STRUCTURED PARSING (LangChain + Ollama)         │
│     • Detect sections (meta, ingredients, method)   │
│     • Parse with Pydantic models                    │
│     • Clean & normalize text                        │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  3. VALIDATION (JOAv0 Schema)                       │
│     • Validate JSON structure                       │
│     • Save: data/recipes_json/recipe-name.json      │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  4. MULTI-VIEW CHUNKING (Deterministic)             │
│     1. Metadata: "Recipe Name - Category, Time"     │
│     2. Main Ingredients: "ingredient1, ingredient2" │
│     3. Time/Difficulty: "Easy - 20 minutes"         │
│     4-6. Individual Ingredients: "walnut", "pear"   │
│     7. Method: "Wash, chop, mix..."                 │
│     8. Dietary: "Vegetarian, Gluten-free"           │
│     9. Natural Language: "A festive salad with..."  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  5. EMBEDDINGS (fastembed)                          │
│     • Model: BAAI/bge-small-en-v1.5                 │
│     • Generate 384D vector per chunk                │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  6. STORAGE (Supabase)                              │
│     • recipe_index: metadata + filters              │
│     • intelligent_recipe_chunks: chunks + embeddings│
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  OUTPUT: Ready for semantic search                  │
└─────────────────────────────────────────────────────┘
```

---

## Usage

```bash
# Process all PDFs in directory
python -m recipe_pdf_agent_llama.cli run data/recipes

# Test chunking
python tests/test_chunker.py
```

**Time:** ~3-5 minutes per PDF

---

## Documentation

- `INGESTION.md` - This document
- `GITHUB_ACTIONS.md` - Automated processing
- `SEARCH_AGENT_DESIGN.md` - Search system
