# Multi-view semantic chunking

Hybrid chunk generation for recipe semantic search, tuned for many query styles.

## Architecture

```
JOAv0 Document → Semantic Analyzer → Multi-View Generator → Base Chunks
                                                                  ↓
                                                    [Optional] Embeddings → Density Optimizer
                                                                  ↓
                                                    [Optional] LLM Classifier → Enriched Chunks
```

## Implemented phases

### Phase 1: Multi-view generator (on by default)

Chunks from several semantic angles:

**Views:**
1. **Metadata** — title + difficulty + time + servings  
2. **Ingredients** — all main; top 5 singles; hero ingredient  
3. **Time** — exact + bucket (quick, under 30 min, …)  
4. **Difficulty** — Easy, Not Too Tricky, …  
5. **Techniques** — bake, grill, no-cook, chop, …  
6. **Occasions** — christmas, party, weeknight, bbq, …  
7. **Moods** — quick, fresh, comfort, light, festive, …  
8. **Dietary** — vegetarian, vegan, gluten-free, …  
9. **Natural language** — blended phrases  

**Result:** ~15–25 chunks per recipe, &lt;0.01s, no LLM/embeddings required.

### Phase 2: Semantic density (optional, off)

Merge near-duplicate chunks using embedding similarity:
- Uses fastembed similarity  
- Merges very similar chunks (&gt;85%)  
- Variable chunk size by semantic density  

**Enable:**
```bash
RECIPE_LLAMA_ENABLE_DENSITY=true
RECIPE_LLAMA_DENSITY_THRESHOLD=0.85
```

**Effect:** fewer redundant chunks (e.g. 22 → 15), ~+0.5s.

### Phase 3: LLM light enrichment (optional, off)

LLM classification (not generation) per chunk:
- Short timeout (~10s/chunk)  
- Richer tags  

**Enable:**
```bash
RECIPE_LLAMA_ENABLE_LLM_ENRICHMENT=true
RECIPE_LLAMA_ENRICHMENT_MODEL=llama3.1
RECIPE_LLAMA_ENRICHMENT_TIMEOUT=10
```

**Extra fields:** `dietary_tags`, `cuisine`, `meal_type`, `season`, `occasion`, `techniques`.

**Cost:** ~2–5 min for ~22 chunks on llama3.1.

## Chunk types

| View | Example chunk text | Example user query |
|------|-------------------|--------------------|
| Metadata | "Christmas salad - Not Too Tricky - PT20M - 8 servings" | "easy 20 minute salad" |
| Ingredient (all) | "Christmas salad with walnuts, pear, apple, chicory" | "salad with walnuts and pear" |
| Ingredient (single) | "walnuts in Christmas salad" | "recipes with walnuts" |
| Ingredient (hero) | "Walnuts salad" | "walnut salad" |
| Time (exact) | "20-minute Christmas salad" | "20 minute recipe" |
| Time (bucket) | "quick 20-minute Christmas salad" | "quick recipe" |
| Difficulty | "not too tricky Christmas salad" | "easy recipe" |
| Technique | "no-cook Christmas salad" | "no cook" |
| Occasion | "christmas Christmas salad" | "christmas salad" |
| Mood | "fresh Christmas salad" | "fresh food" |
| Dietary | "vegetarian Christmas salad" | "vegetarian recipes" |
| Natural | "quick festive with walnuts" | "quick festive with walnuts" |

## Configuration

### Environment

```bash
# Phase 1: always on — no flags

# Phase 2
RECIPE_LLAMA_ENABLE_DENSITY=false
RECIPE_LLAMA_DENSITY_THRESHOLD=0.85

# Phase 3
RECIPE_LLAMA_ENABLE_LLM_ENRICHMENT=false
RECIPE_LLAMA_ENRICHMENT_MODEL=llama3.1
RECIPE_LLAMA_ENRICHMENT_TIMEOUT=10
```

### In code

```python
from recipe_pdf_agent_llama.config import LlamaAgentConfig

cfg = LlamaAgentConfig(
    enable_density_optimization=True,
    density_threshold=0.85,
    enable_llm_enrichment=True,
    enrichment_model="llama3.1",
    enrichment_timeout=10,
)
```

## Usage

### Basic (multi-view only)

```python
from recipe_pdf_agent_llama.chunker import build_intelligent_chunks

chunks = build_intelligent_chunks(
    cfg=cfg,
    recipe_id="christmas-salad",
    clean_text="",  # unused
    joav0_doc=joav0_doc,
)
# ~15–25 chunks in <0.01s
```

### With density

```python
cfg.enable_density_optimization = True
chunks = build_intelligent_chunks(...)
# ~12–18 chunks in ~0.5s
```

### With LLM enrichment

```python
cfg.enable_llm_enrichment = True
chunks = build_intelligent_chunks(...)
# richer metadata, ~2–5 min
```

## Tests

```bash
python tests/test_chunker.py
python tests/test_chunker.py | grep "Chunk"
python tests/test_chunker.py --model llama3.1
```

## Performance

| Setup | Chunks | Time | Quality |
|-------|--------|------|---------|
| Multi-view only | 22 | <0.01s | ⭐⭐⭐⭐ |
| + density | 15 | ~0.5s | ⭐⭐⭐⭐⭐ |
| + LLM enrich | 15 | ~3 min | ⭐⭐⭐⭐⭐ |

## Files

```
recipe_pdf_agent_llama/
├── chunker.py                  # orchestrator
├── chunker_semantic.py         # semantic analyzer
├── chunker_multiview.py        # multi-view generator
├── chunker_deterministic.py    # thin wrapper
├── chunker_density.py          # density merge
└── chunker_enrich.py           # LLM enrichment
```

## Why use it

1. **Recall** — many phrasings hit the index  
2. **Natural queries** — aligned with how people search  
3. **Toggle cost** — enable only phases you need  
4. **Fast default** — multi-view is instant  
5. **Scalable** — no blocking LLM in the default path  

## Recommendations

- **Dev / test:** phase 1 only  
- **Prod without LLM:** phases 1 + 2 (~0.5s)  
- **Max quality:** all phases — run offline/batch (~3 min/recipe)  
