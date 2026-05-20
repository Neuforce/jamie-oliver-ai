---
title: Ingredient quantities in steps (NEU-584)
linear: NEU-584
repo: jamie-oliver-ai
overview: Enrich voice/UI text (`on_enter.say`) with quantities from the structured ingredient list in the same JSON so the user does not have to jump back to the list (e.g. “Crack in 1 egg” instead of only “egg”).
todos:
  - id: extend-recipe-ingredients
    content: Add `ingredients` to `Recipe` and load them in `Recipe.from_dict`
  - id: implement-enrichment
    content: Add `enrich_say_with_ingredients` + `format_ingredient_phrase` with tests (banana-bread + edge case)
  - id: wire-engine-main
    content: Use enrichment in `RecipeEngine` (MESSAGE) and `_get_first_step_say_text` in main.py
  - id: prompt-nudge
    content: "Optional: one line in `prompts.py` for paraphrasing with quantities"
---

# Plan: ingredient quantities in steps (NEU-584)

## Technical context (current state)

- Each recipe in [`apps/frontend/public/recipes-json/*.json`](../../apps/frontend/public/recipes-json/) has `ingredients` (objects with `name`, `quantity`, `unit`) and `steps[].on_enter[].say` (TTS script).
- When a step starts, [`RecipeEngine.start_step`](../../apps/backend-voice/src/recipe_engine/engine.py) emits `EventType.MESSAGE` with `action["say"]` unchanged; the frontend receives `recipe_message` ([`event_handler.py`](../../apps/backend-voice/src/services/event_handler.py)).
- The [`Recipe`](../../apps/backend-voice/src/recipe_engine/models.py) model does **not** yet load `ingredients` from the payload—only metadata + steps.
- The agent can already list quantities via `get_ingredients()` ([`recipe_context_tools.py`](../../apps/backend-voice/src/tools/recipe_context_tools.py)), but that does not change the automatic per-step script.

## Recommended approach: runtime enrichment (backend-voice)

**Goal:** one function that, given `say` + the payload’s ingredient list, returns text with quantities where the script names an ingredient without a number.

**Why here instead of hand-editing JSON:** every new or updated recipe benefits without rewriting 50+ files; heuristics live in one place.

### 1. Load ingredients on the recipe model

- Extend [`Recipe`](../../apps/backend-voice/src/recipe_engine/models.py) with e.g. `ingredients: List[Dict[str, Any]] = field(default_factory=list)` and populate it in `Recipe.from_dict` from `data.get("ingredients", [])`.
- Ensure [`Recipe.from_dict(payload)`](../../apps/backend-voice/src/tools/recipe_tools.py) (and tests) still work when `ingredients` is missing (empty list).

### 2. Enrichment module + tests

- New module e.g. [`apps/backend-voice/src/recipe_engine/ingredient_say_enrichment.py`](../../apps/backend-voice/src/recipe_engine/ingredient_say_enrichment.py) (or `src/utils/`) with:
  - **`format_ingredient_phrase(ing)`**: same readability rules as `get_ingredients` (qty + unit + name) for short phrases (“150 g sugar”, “1 egg”, “3 ripe bananas”).
  - **`enrich_say_with_ingredients(say: str, ingredients: list) -> str`**: for each ingredient, detect **base name** mentions in `say` (word boundaries; avoid false positives like “egg” inside compounds if needed) and, if there is no quantity nearby, substitute or prefix the quantified form.
- **Unit tests** under [`apps/backend-voice/tests/`](../../apps/backend-voice/tests/) using a slice of [`banana-bread.json`](../../apps/frontend/public/recipes-json/banana-bread.json) (step `stir_sugar_egg_vanilla`: from “sugar, egg, and vanilla” to text that includes quantities consistent with the JSON).

### 3. Apply in the engine (source of truth for audio/UI)

- In [`engine.py`](../../apps/backend-voice/src/recipe_engine/engine.py), before emitting `MESSAGE`, replace `action["say"]` with `enrich_say_with_ingredients(say, self.recipe.ingredients)` when ingredients exist.

### 4. First step / intro in `main.py`

- [`_get_first_step_say_text`](../../apps/backend-voice/src/main.py) uses the same `on_enter.say`: apply the same enrichment with `recipe_payload.get("ingredients", [])` so the first cue stays consistent.

### 5. Optional system prompt tweak

- One line in [`prompts.py`](../../apps/backend-voice/src/config/prompts.py): when the model **paraphrases** a step (instead of reading `recipe_message` literally), it should **prioritize quantities** aligned with `get_ingredients` / recipe data—reduces drift when the LLM improvises.

## Explicitly out of MVP

- **Explicit step→ingredient mapping** (`ingredient_ids` per step): more precise for complex recipes but needs schema + authoring work; consider if heuristics fail in production.
- **Bulk JSON rewrite:** optional editorial follow-up, not required for automatic behavior.

## Acceptance criteria

- For a step whose `say` mentions ingredients that also appear with quantities in the list, the `recipe_message` text includes those quantities naturally (validated with at least banana bread + a second example in tests).
- Recipes with missing or empty `ingredients`: same behavior as today (no errors).
- Engine / `Recipe.from_dict` regression tests pass.
