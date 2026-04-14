"""Tests for TTS-bound ingredient enrichment."""

import importlib
import sys
import types
from unittest.mock import MagicMock

mod = importlib.import_module("src.services.tts_ingredient_enrichment")


def _install_fake_session_service(monkeypatch, mock_svc: MagicMock) -> None:
    """Prevent importing real session_service (Supabase chain) during tests."""
    fake_mod = types.ModuleType("src.services.session_service")
    fake_mod.session_service = mock_svc
    monkeypatch.setitem(sys.modules, "src.services.session_service", fake_mod)


def test_enrich_skips_when_not_cooking_mode(monkeypatch):
    monkeypatch.setattr(mod.context_variables, "get", lambda k, d=None: None)
    assert mod.enrich_assistant_text_for_tts("Add sugar.") == "Add sugar."


def test_enrich_applies_when_cooking_and_active_step(monkeypatch):
    payload = {
        "steps": [
            {
                "id": "stir_sugar",
                "descr": "Stir in sugar",
                "instructions": "Stir in sugar",
                "on_enter": [{"say": "Stir in sugar."}],
            }
        ],
        "ingredients": [{"name": "sugar", "unit": "g", "quantity": 150.0}],
    }
    engine = MagicMock()
    engine.get_state.return_value = {
        "steps": {
            "stir_sugar": {"id": "stir_sugar", "status": "active"},
        }
    }

    mock_svc = MagicMock()
    mock_svc.get_engine.return_value = engine
    mock_svc.get_session_recipe_payload.return_value = payload
    _install_fake_session_service(monkeypatch, mock_svc)

    def fake_get(key, default=None):
        if key == "voice_mode":
            return "cooking"
        if key == "session_id":
            return "sess1"
        return default

    monkeypatch.setattr(mod.context_variables, "get", fake_get)

    out = mod.enrich_assistant_text_for_tts("Now stir in the sugar until smooth.")
    assert "150 grams sugar" in out or "150 g sugar" in out


def test_enrich_empty_subset_returns_unchanged(monkeypatch):
    payload = {
        "steps": [
            {
                "id": "preheat",
                "descr": "Preheat the oven",
                "instructions": "Preheat",
                "on_enter": [],
            }
        ],
        "ingredients": [{"name": "sugar", "unit": "g", "quantity": 150.0}],
    }
    engine = MagicMock()
    engine.get_state.return_value = {
        "steps": {
            "preheat": {"id": "preheat", "status": "active"},
        }
    }

    mock_svc = MagicMock()
    mock_svc.get_engine.return_value = engine
    mock_svc.get_session_recipe_payload.return_value = payload
    _install_fake_session_service(monkeypatch, mock_svc)

    def fake_get(key, default=None):
        if key == "voice_mode":
            return "cooking"
        if key == "session_id":
            return "sess1"
        return default

    monkeypatch.setattr(mod.context_variables, "get", fake_get)

    text = "Lovely, preheat the oven."
    assert mod.enrich_assistant_text_for_tts(text) == text
