# 🔍 Semantic Search Agent

## What It Does

Hybrid search system that finds recipes using semantic embeddings (vector search), exact filters (category, mood, complexity), and full-text search on ingredients. Returns ranked results with explanations.

**Input:** Natural language query + optional filters  
**Output:** Ranked recipes with similarity scores + matching chunks  
**Speed:** ~200-300ms per search

---

## Libraries Used

- **`fastembed`** - Generate query embeddings (BAAI/bge-small-en-v1.5)
- **`supabase-py`** - PostgreSQL + pgvector client
- **`fastapi`** - REST API framework
- **`pydantic`** - Request/response validation
- **PostgreSQL + pgvector** - Vector similarity search
- **Full-Text Search (FTS)** - Ingredient matching

---

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────┐
│  INPUT: "quick vegetarian pasta under 30 minutes"   │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  1. QUERY PROCESSING                                │
│     • Extract intent: "pasta", "vegetarian", "quick"│
│     • Generate embedding: [0.234, -0.567, ...]      │
│     • Parse filters: category, complexity, etc.     │
│     • Set threshold: 0.3 (default)                  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  2. HYBRID SEARCH (Supabase SQL Function)           │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Vector Search│  │ Exact Filters│  │ FTS on    │  │
│  │ (embeddings) │  │ (category,   │  │Ingredients│  │
│  │              │  │  mood, etc.) │  │           │  │
│  └──────────────┘  └──────────────┘  └───────────┘  │
│         ↓                 ↓                ↓        │
│         └─────────────────┴────────────────┘        │
│                       ↓                             │
│            ┌──────────────────────┐                 │
│            │ Combine & Rank       │                 │
│            │ (weighted scores)    │                 │
│            │ 70% vector + 30% FTS │                 │
│            └──────────────────────┘                 │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  3. RESULTS ENRICHMENT                              │
│     • Fetch full recipe JSON from file_path         │
│     • Explain why each recipe matched               │
│     • Add matching chunks for context               │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  OUTPUT: Ranked results with scores                 │
│  [                                                  │
│    {                                                │
│      "recipe_id": "vegetarian-pasta-primavera",     │
│      "title": "Vegetarian Pasta Primavera",         │
│      "similarity_score": 0.89,                      │
│      "chunks": [...],                               │
│      "full_recipe": {...}                           │
│    }                                                │
│  ]                                                  │
└─────────────────────────────────────────────────────┘
```

---

## Hybrid Search Components

### 1. Vector Search (70% weight)

- Generates 384D embedding from query
- Searches `intelligent_recipe_chunks` table
- Uses cosine similarity (pgvector `<=>` operator)
- Filters by `similarity_threshold` (default: 0.3)

### 2. Exact Filters (pre-filter)

- `category`: breakfast, lunch, dinner, dessert, snack
- `mood`: comfort, light, festive, healthy, indulgent
- `complexity`: easy, medium, hard, not-too-tricky
- `cost`: budget, moderate, premium, splurge

### 3. Full-Text Search (30% weight)

- Searches `ingredients_text` column in `recipe_index`
- Uses PostgreSQL `ts_rank()` with `plainto_tsquery()`
- Example: `"tomato basil"` matches all recipes with those ingredients

---

## API Usage

### Endpoint: `POST /api/v1/recipes/search`

**Request:**
```json
{
  "query": "quick vegetarian pasta",
  "complexity": "easy",
  "top_k": 5,
  "similarity_threshold": 0.5
}
```

**Response:**
```json
{
  "query": "quick vegetarian pasta",
  "total": 3,
  "took_ms": 245,
  "results": [
    {
      "recipe_id": "vegetarian-pasta-primavera",
      "title": "Vegetarian Pasta Primavera",
      "similarity_score": 0.89,
      "combined_score": 0.87,
      "chunks": [...]
    }
  ]
}
```

---

## Key Parameters

### `similarity_threshold` (0.0 - 1.0)

Controls minimum similarity score for results:

- **0.2-0.3** (low): More results, exploratory
- **0.3** (default): Balanced
- **0.5-0.7** (high): Fewer, more precise results
- **0.8+** (very high): Nearly exact matches

### `top_k` (1-50)

Maximum number of results to return.

---

## Embedding Model

**BAAI/bge-small-en-v1.5**
- 384 dimensions
- BERT-based transformer encoder
- State-of-the-art for semantic search
- L2 normalized (unit vectors)
- Cosine similarity via inner product

**Why it works:**
```python
"quick pasta"       → [0.23, -0.56, 0.12, ...]
"fast noodles"      → [0.24, -0.55, 0.13, ...]  # Similarity: 0.89
"christmas dessert" → [-0.12, 0.34, -0.89, ...] # Similarity: 0.12
```

Embeddings capture **meaning**, not exact words.

---

## Usage

```bash
# Start API
./scripts/start_api.sh

# Test in browser
open http://localhost:8000/docs

# Test with Python
python tests/test_search_agent.py
```

---

## Documentation

- `SEARCH_AGENT_DESIGN.md` - This document
- `SEARCH_API_USAGE.md` - Detailed API guide
- `threshold_examples.md` - Threshold parameter guide
