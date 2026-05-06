"""Session payload updates when scale_recipe runs (NEU-612)."""

import pytest

from src.recipe_engine.ingredient_say_enrichment import enrich_say_with_ingredients
from src.recipe_engine.session_recipe_scaling import (
    normalize_stored_quantity,
    scale_recipe_payload_in_place,
)


def test_scale_recipe_payload_updates_ingredients_and_servings():
    payload = {
        "recipe": {"id": "test-recipe", "servings": 2, "title": "T"},
        "ingredients": [
            {"name": "eggs", "quantity": 2, "unit": None},
            {"name": "milk", "quantity": 100, "unit": "ml"},
        ],
    }
    msg, mutated = scale_recipe_payload_in_place(payload, 4)

    assert mutated is True
    assert payload["recipe"]["servings"] == 4
    assert payload["ingredients"][0]["quantity"] == 4
    assert payload["ingredients"][1]["quantity"] == 200
    assert "to 4 servings" in msg
    assert "Scaled ingredients" in msg


def test_scale_recipe_payload_chained_uses_current_servings():
    payload = {
        "recipe": {"id": "r", "servings": 2},
        "ingredients": [{"name": "eggs", "quantity": 2, "unit": None}],
    }
    scale_recipe_payload_in_place(payload, 4)
    assert payload["ingredients"][0]["quantity"] == 4
    scale_recipe_payload_in_place(payload, 2)
    assert payload["recipe"]["servings"] == 2
    assert payload["ingredients"][0]["quantity"] == 2


def test_after_scale_tts_enrichment_uses_session_quantities():
    payload = {
        "recipe": {"id": "r", "servings": 2},
        "ingredients": [{"name": "eggs", "quantity": 2, "unit": None}],
    }
    scale_recipe_payload_in_place(payload, 4)
    enriched = enrich_say_with_ingredients("Crack the eggs into a bowl.", payload["ingredients"])
    assert "4 eggs" in enriched


def test_normalize_stored_quantity_int_when_whole():
    assert normalize_stored_quantity(4.0) == 4
    assert normalize_stored_quantity(3.9999999) == 4


def test_normalize_stored_quantity_float_when_fractional():
    v = normalize_stored_quantity(1.25)
    assert v == 1.25 or abs(v - 1.25) < 1e-6


def test_scale_no_ingredients_not_mutated():
    payload = {"recipe": {"servings": 4}, "ingredients": []}
    msg, mutated = scale_recipe_payload_in_place(payload, 8)
    assert mutated is False
    assert "[INFO]" in msg
