---
title: Cantidades de ingredientes en los pasos (NEU-584)
linear: NEU-584
repo: jamie-oliver-ai
overview: Enriquecer el texto de voz/UI (`on_enter.say`) con cantidades tomadas de la lista estructurada de ingredientes del mismo JSON, de modo que el usuario no tenga que volver a la lista (p. ej. "Crack in 1 egg" en lugar de solo "egg").
todos:
  - id: extend-recipe-ingredients
    content: Añadir `ingredients` a `Recipe` y cargarlos en `Recipe.from_dict`
  - id: implement-enrichment
    content: Crear `enrich_say_with_ingredients` + `format_ingredient_phrase` con tests (banana-bread + caso edge)
  - id: wire-engine-main
    content: Usar enriquecimiento en `RecipeEngine` (MESSAGE) y `_get_first_step_say_text` en main.py
  - id: prompt-nudge
    content: "Opcional: una línea en `prompts.py` para parafraseo con cantidades"
---

# Plan: cantidades de ingredientes en los pasos (NEU-584)

## Contexto técnico (estado actual)

- Cada receta en [`apps/frontend/public/recipes-json/*.json`](../../apps/frontend/public/recipes-json/) tiene `ingredients` (objetos con `name`, `quantity`, `unit`) y `steps[].on_enter[].say` (guion TTS).
- Al arrancar un paso, [`RecipeEngine.start_step`](../../apps/backend-voice/src/recipe_engine/engine.py) emite `EventType.MESSAGE` con `action["say"]` tal cual; el frontend recibe `recipe_message` ([`event_handler.py`](../../apps/backend-voice/src/services/event_handler.py)).
- El modelo [`Recipe`](../../apps/backend-voice/src/recipe_engine/models.py) **no** carga hoy los `ingredients` del payload; solo metadatos + pasos.
- El agente ya puede listar cantidades con `get_ingredients()` ([`recipe_context_tools.py`](../../apps/backend-voice/src/tools/recipe_context_tools.py)), pero eso no cambia el guion automático del paso.

## Enfoque recomendado: enriquecimiento en runtime (backend-voice)

**Objetivo:** una sola función que, dado `say` + lista de ingredientes del payload, devuelva un texto con cantidades donde el guion menciona el ingrediente sin número.

**Por qué aquí y no solo editar JSON a mano:** cualquier receta nueva o actualizada se beneficia sin reescribir 50+ archivos; se puede afinar la heurística en un solo sitio.

### 1. Cargar ingredientes en el modelo de receta

- Extender [`Recipe`](../../apps/backend-voice/src/recipe_engine/models.py) con algo como `ingredients: List[Dict[str, Any]] = field(default_factory=list)` y rellenarlo en `Recipe.from_dict` desde `data.get("ingredients", [])`.
- Verificar que [`Recipe.from_dict(payload)`](../../apps/backend-voice/src/tools/recipe_tools.py) (y tests) sigan funcionando con payloads que no traen `ingredients` (lista vacía).

### 2. Módulo de enriquecimiento + pruebas

- Nuevo módulo p. ej. [`apps/backend-voice/src/recipe_engine/ingredient_say_enrichment.py`](../../apps/backend-voice/src/recipe_engine/ingredient_say_enrichment.py) (o `src/utils/`) con:
  - **`format_ingredient_phrase(ing)`**: misma lógica de legibilidad que ya usa `get_ingredients` (cantidad + unidad + nombre), para construir frases cortas ("150 g sugar", "1 egg", "3 ripe bananas").
  - **`enrich_say_with_ingredients(say: str, ingredients: list) -> str`**: para cada ingrediente, detectar menciones del **nombre base** en `say` (límites de palabra, evitar falsos positivos tipo "egg" en palabras compuestas si aplica) y, si la frase ya no lleva cantidad cerca, sustituir o anteponer la forma con cantidad.
- **Tests unitarios** en [`apps/backend-voice/tests/`](../../apps/backend-voice/tests/) usando un trozo real de [`banana-bread.json`](../../apps/frontend/public/recipes-json/banana-bread.json) (paso `stir_sugar_egg_vanilla`: de "sugar, egg, and vanilla" a algo que incluya cantidades coherentes con el JSON).

### 3. Aplicar en el motor (fuente de verdad del audio/UI)

- En [`engine.py`](../../apps/backend-voice/src/recipe_engine/engine.py), antes de emitir `MESSAGE`, sustituir `action["say"]` por `enrich_say_with_ingredients(say, self.recipe.ingredients)` (si hay ingredientes).

### 4. Primer paso / intro en `main.py`

- [`_get_first_step_say_text`](../../apps/backend-voice/src/main.py) usa el mismo `on_enter.say`: aplicar el mismo enriquecimiento pasando `recipe_payload.get("ingredients", [])` para que la primera instrucción sea consistente.

### 5. Ajuste opcional del system prompt

- Una línea en [`prompts.py`](../../apps/backend-voice/src/config/prompts.py): cuando el modelo **parafrasee** un paso (no lea literal el `recipe_message`), debe **priorizar cantidades** alineadas con `get_ingredients` / datos de la receta. Evita desalineación si el LLM habla por su cuenta.

## Qué queda fuera del MVP (explícito)

- **Mapeo explícito paso→ingredientes** (`ingredient_ids` por step): más preciso para recetas complejas, pero implica cambio de esquema y más trabajo de autoría; reservar si las heurísticas fallan en casos reales.
- **Re-escritura masiva de JSON**: opcional como mejora de calidad editorial después, no requisito para el comportamiento automático.

## Criterios de aceptación

- Al iniciar un paso cuyo `say` menciona ingredientes también listados con cantidad, el texto emitido en `recipe_message` incluye esas cantidades de forma natural (validado con al menos banana bread + un segundo ejemplo en tests).
- Recetas sin `ingredients` o con lista vacía: comportamiento idéntico al actual (sin errores).
- Tests de regresión del motor / `Recipe.from_dict` pasan.
