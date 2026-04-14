"""Tests for ingredient quantity enrichment in step narration (NEU-584)."""

import json
from pathlib import Path

from src.recipe_engine.ingredient_say_enrichment import (
    enrich_say_with_ingredients,
    format_ingredient_phrase,
)


def test_format_ingredient_phrase_sugar_and_egg():
    assert (
        format_ingredient_phrase({"name": "sugar", "unit": "g", "quantity": 150.0})
        == "150 grams sugar"
    )
    assert format_ingredient_phrase({"name": "sugar", "unit": "g", "quantity": 1.0}) == "1 gram sugar"
    assert format_ingredient_phrase({"name": "1 egg", "unit": None, "quantity": None}) == "1 egg"


def test_enrich_banana_bread_stir_step():
    root = Path(__file__).resolve().parents[3]
    path = root / "apps" / "frontend" / "public" / "recipes-json" / "banana-bread.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    ingredients = data["ingredients"]
    step = next(s for s in data["steps"] if s["id"] == "stir_sugar_egg_vanilla")
    say = step["on_enter"][0]["say"]

    out = enrich_say_with_ingredients(say, ingredients)

    assert "150 grams sugar" in out or "150 g sugar" in out or "150g sugar" in out.replace(" ", "")
    assert "1 egg" in out
    assert "1 teaspoon vanilla" in out or "1 tsp vanilla" in out or "vanilla" in out


def test_enrich_idempotent_when_phrase_already_present():
    ingredients = [
        {"name": "sugar", "unit": "g", "quantity": 150.0},
    ]
    say = "Stir in 150 g sugar until smooth."
    assert enrich_say_with_ingredients(say, ingredients) == say


def test_enrich_empty_ingredients_returns_say():
    say = "Mix well."
    assert enrich_say_with_ingredients(say, []) == say
    assert enrich_say_with_ingredients(say, None) == say  # type: ignore[arg-type]


def test_eggplant_not_replaced():
    ingredients = [{"name": "1 egg", "unit": None, "quantity": None}]
    say = "Dice the eggplant finely."
    assert enrich_say_with_ingredients(say, ingredients) == say


def test_recipe_from_dict_loads_ingredients():
    from src.recipe_engine import Recipe

    payload = {
        "recipe": {
            "id": "t",
            "title": "T",
            "servings": 2,
            "estimated_total": "PT1H",
            "difficulty": "easy",
            "locale": "en",
        },
        "steps": [
            {
                "id": "s1",
                "descr": "Mix",
                "type": "immediate",
                "depends_on": [],
                "on_enter": [{"say": "Add sugar."}],
            }
        ],
        "ingredients": [{"name": "sugar", "unit": "g", "quantity": 100}],
    }
    r = Recipe.from_dict(payload)
    assert len(r.ingredients) == 1
    assert r.ingredients[0]["name"] == "sugar"
