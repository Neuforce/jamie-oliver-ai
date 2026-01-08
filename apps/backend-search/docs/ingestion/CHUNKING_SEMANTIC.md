# Chunking Semántico Inteligente Multi-Vista

Sistema híbrido de generación de chunks para búsqueda semántica de recetas, optimizado para múltiples tipos de queries.

## Arquitectura

```
JOAv0 Document → Semantic Analyzer → Multi-View Generator → Base Chunks
                                                                  ↓
                                                    [Optional] Embeddings → Density Optimizer
                                                                  ↓
                                                    [Optional] LLM Classifier → Enriched Chunks
```

## Fases Implementadas

### ✅ Fase 1: Multi-View Generator (Activa por defecto)

Genera chunks desde múltiples perspectivas semánticas:

**Vistas generadas:**
1. **Metadata**: Título + dificultad + tiempo + porciones
2. **Ingredientes**: 
   - Todos los principales
   - Individuales (top 5)
   - Hero ingredient
3. **Tiempo**: Exacto y por bucket (quick, under 30min, etc.)
4. **Dificultad**: Easy, Not Too Tricky, etc.
5. **Técnicas**: bake, grill, no-cook, chop, etc.
6. **Ocasiones**: christmas, party, weeknight, bbq, etc.
7. **Moods**: quick, fresh, comfort, light, festive, etc.
8. **Dietary**: vegetarian, vegan, gluten-free, etc.
9. **Natural Language**: Combinaciones inteligentes

**Resultado:**
- 15-25 chunks por receta
- Generación instantánea (<0.01s)
- Sin dependencias de LLM o embeddings

### ✅ Fase 2: Semantic Density (Opcional, desactivada)

Optimiza tamaño de chunks basándose en similitud semántica:
- Usa embeddings (fastembed) para calcular similitud
- Agrupa chunks muy similares (>85% similarity)
- Tamaño variable según densidad semántica

**Para activar:**
```python
# En .env o config
RECIPE_LLAMA_ENABLE_DENSITY=true
RECIPE_LLAMA_DENSITY_THRESHOLD=0.85
```

**Resultado:**
- Reduce chunks redundantes (ej: 22 → 15 chunks)
- Chunks más densos y significativos
- Añade ~0.5s de procesamiento

### ✅ Fase 3: LLM Light Enrichment (Opcional, desactivada)

Enriquece chunks con clasificación LLM:
- Timeout corto (10s por chunk)
- Solo clasificación, NO generación
- Añade metadata rica

**Para activar:**
```python
# En .env o config
RECIPE_LLAMA_ENABLE_LLM_ENRICHMENT=true
RECIPE_LLAMA_ENRICHMENT_MODEL=llama3.1
RECIPE_LLAMA_ENRICHMENT_TIMEOUT=10
```

**Metadata añadida:**
- `dietary_tags`: ["vegetarian", "vegan", "gluten-free"]
- `cuisine`: "italian", "asian", "international"
- `meal_type`: ["lunch", "dinner", "side"]
- `season`: "winter", "summer", "spring", "fall"
- `occasion`: ["christmas", "party", "weeknight"]
- `techniques`: ["bake", "grill", "no-cook"]

**Resultado:**
- Metadata más precisa y rica
- Añade ~2-5min para 22 chunks (con llama3.1)

## Tipos de Chunks Generados

| Vista | Ejemplo | Query Match |
|-------|---------|-------------|
| Metadata | "Christmas salad - Not Too Tricky - PT20M - 8 servings" | "ensalada fácil de 20 minutos" |
| Ingredient (all) | "Christmas salad with walnuts, pear, apple, chicory" | "ensalada con nueces y pera" |
| Ingredient (single) | "walnuts in Christmas salad" | "recetas con nueces" |
| Ingredient (hero) | "Walnuts salad" | "ensalada de nueces" |
| Time (exact) | "20-minute Christmas salad" | "receta de 20 minutos" |
| Time (bucket) | "quick 20-minute Christmas salad" | "receta rápida" |
| Difficulty | "not too tricky Christmas salad" | "receta fácil" |
| Technique | "no-cook Christmas salad" | "sin cocción" |
| Occasion | "christmas Christmas salad" | "ensalada de navidad" |
| Mood | "fresh Christmas salad" | "comida fresca" |
| Dietary | "vegetarian Christmas salad" | "recetas vegetarianas" |
| Natural | "quick festive with walnuts" | "rápida festiva con nueces" |

## Configuración

### Variables de Entorno

```bash
# Fase 1: Multi-View (siempre activa)
# No requiere configuración

# Fase 2: Density Optimization
RECIPE_LLAMA_ENABLE_DENSITY=false  # true para activar
RECIPE_LLAMA_DENSITY_THRESHOLD=0.85  # 0.0-1.0

# Fase 3: LLM Enrichment
RECIPE_LLAMA_ENABLE_LLM_ENRICHMENT=false  # true para activar
RECIPE_LLAMA_ENRICHMENT_MODEL=llama3.1
RECIPE_LLAMA_ENRICHMENT_TIMEOUT=10  # segundos por chunk
```

### En Código

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

## Uso

### Básico (solo Multi-View)

```python
from recipe_pdf_agent_llama.chunker import build_intelligent_chunks

chunks = build_intelligent_chunks(
    cfg=cfg,
    recipe_id="christmas-salad",
    clean_text="",  # No usado
    joav0_doc=joav0_doc,
)

# Resultado: 15-25 chunks en <0.01s
```

### Con Density Optimization

```python
cfg.enable_density_optimization = True

chunks = build_intelligent_chunks(
    cfg=cfg,
    recipe_id="christmas-salad",
    clean_text="",
    joav0_doc=joav0_doc,
)

# Resultado: 12-18 chunks en ~0.5s
```

### Con LLM Enrichment

```python
cfg.enable_llm_enrichment = True

chunks = build_intelligent_chunks(
    cfg=cfg,
    recipe_id="christmas-salad",
    clean_text="",
    joav0_doc=joav0_doc,
)

# Resultado: chunks con metadata rica en ~2-5min
```

## Testing

```bash
# Test básico
python tests/test_chunker.py

# Ver chunks generados
python tests/test_chunker.py | grep "Chunk"

# Con modelo específico
python tests/test_chunker.py --model llama3.1
```

## Performance

| Configuración | Chunks | Tiempo | Calidad |
|--------------|--------|--------|---------|
| Solo Multi-View | 22 | <0.01s | ⭐⭐⭐⭐ |
| + Density | 15 | ~0.5s | ⭐⭐⭐⭐⭐ |
| + LLM Enrich | 15 | ~3min | ⭐⭐⭐⭐⭐ |

## Archivos del Sistema

```
recipe_pdf_agent_llama/
├── chunker.py                  # Orchestrator principal
├── chunker_semantic.py         # Analizador semántico
├── chunker_multiview.py        # Generador multi-vista
├── chunker_deterministic.py    # Wrapper simplificado
├── chunker_density.py          # Optimizador por densidad
└── chunker_enrich.py           # Enriquecedor LLM
```

## Ventajas

1. **Mejor Recall**: Múltiples vistas → más formas de encontrar recetas
2. **Queries Naturales**: Optimizado para lenguaje natural
3. **Flexible**: Activa solo las fases que necesites
4. **Rápido**: Multi-view es instantáneo
5. **Escalable**: Sin timeouts, sin bloqueos

## Recomendaciones

### Para Desarrollo/Testing
- Solo Fase 1 (Multi-View)
- Más rápido, sin dependencias extras

### Para Producción sin LLM
- Fase 1 + Fase 2 (Multi-View + Density)
- Chunks optimizados, aún rápido (~0.5s)

### Para Máxima Calidad
- Fase 1 + Fase 2 + Fase 3 (Completo)
- Metadata muy rica, pero más lento (~3min por receta)
- Recomendable ejecutar offline/batch


