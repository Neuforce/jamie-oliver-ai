"""Tests for step-scoped ingredient resolution (TTS enrichment)."""

import json
from pathlib import Path

from src.recipe_engine.step_ingredient_resolver import resolve_step_ingredients


def _banana_bread():
    root = Path(__file__).resolve().parents[3]
    path = root / "apps" / "frontend" / "public" / "recipes-json" / "banana-bread.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_resolve_stir_sugar_egg_vanilla_includes_three_ingredients():
    data = _banana_bread()
    ingredients = data["ingredients"]
    step = next(s for s in data["steps"] if s["id"] == "stir_sugar_egg_vanilla")
    subset = resolve_step_ingredients(step, ingredients)
    names = {ing["name"] for ing in subset}
    assert "sugar" in names
    assert "1 egg" in names
    assert "vanilla" in names


def test_resolve_preheat_step_empty_subset_when_no_ingredient_mentions():
    data = _banana_bread()
    ingredients = data["ingredients"]
    step = next(s for s in data["steps"] if s["id"] == "preheat_oven")
    subset = resolve_step_ingredients(step, ingredients)
    assert subset == []


def test_resolve_none_step_returns_empty():
    assert resolve_step_ingredients(None, [{"name": "x"}]) == []


def test_resolve_empty_ingredients_returns_empty():
    assert resolve_step_ingredients({"descr": "Mix sugar"}, []) == []
