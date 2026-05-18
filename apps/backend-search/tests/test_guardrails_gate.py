"""Unit tests for NeuGate guardrails gate (no live NeuGate required)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from recipe_search_agent.guardrails.config import GuardrailsSettings
from recipe_search_agent.guardrails.gate import evaluate_message_sync
from recipe_search_agent.guardrails.session import is_gate_blocked, reset_gate_blocked, set_gate_blocked


@pytest.fixture(autouse=True)
def _reset_gate_state() -> None:
    reset_gate_blocked()
    yield
    reset_gate_blocked()


def test_bypass_when_neugate_disabled() -> None:
    settings = GuardrailsSettings(
        neugate_enabled=False,
        neugate_url="http://localhost:8080",
        neugate_api_key="",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
    )
    result = evaluate_message_sync("anything", settings=settings)
    assert result.blocked is False
    assert result.source == "bypass"


@patch("recipe_search_agent.guardrails.gate.evaluate_via_neugate")
def test_fail_safe_on_http_error(mock_evaluate: MagicMock) -> None:
    mock_evaluate.side_effect = httpx.ConnectError("connection refused")
    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="key",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
    )
    result = evaluate_message_sync("hello", settings=settings)
    assert result.blocked is False
    assert result.source == "fail_safe"


@patch("recipe_search_agent.guardrails.gate.evaluate_via_neugate")
def test_short_circuit_on_violation(mock_evaluate: MagicMock) -> None:
    mock_evaluate.return_value = {
        "is_violation": True,
        "category": "illegal_activities",
        "action": "short_circuit",
        "cached_response": "Back to cooking, mate.",
    }
    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="key",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
    )
    result = evaluate_message_sync("bad prompt", settings=settings)
    assert result.blocked is True
    assert result.source == "neugate"
    assert result.response_text == "Back to cooking, mate."


@patch("recipe_search_agent.guardrails.gate.evaluate_via_neugate")
def test_proceed_on_safe_response(mock_evaluate: MagicMock) -> None:
    mock_evaluate.return_value = {
        "is_violation": False,
        "category": "safe_domain",
        "action": "proceed",
        "cached_response": None,
    }
    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
    )
    result = evaluate_message_sync("pasta recipe", settings=settings)
    assert result.blocked is False
    assert result.source == "neugate"


def test_search_recipes_skips_when_gate_blocked() -> None:
    from recipe_search_agent.discovery_tools import search_recipes, set_search_agent

    set_gate_blocked(True)
    mock_agent = MagicMock()
    mock_agent._generate_embedding = MagicMock()
    set_search_agent(mock_agent)

    payload = json.loads(search_recipes("quick dinner"))
    assert payload["guardrail_blocked"] is True
    assert payload["recipes"] == []
    mock_agent.search.assert_not_called()
    mock_agent._generate_embedding.assert_not_called()


def test_suggest_recipes_for_mood_skips_search_when_gate_blocked() -> None:
    from recipe_search_agent.discovery_tools import set_search_agent, suggest_recipes_for_mood

    set_gate_blocked(True)
    mock_agent = MagicMock()
    set_search_agent(mock_agent)

    payload = json.loads(suggest_recipes_for_mood("tired"))
    assert payload.get("guardrail_blocked") is True
    assert payload["recipes"] == []
    mock_agent.search.assert_not_called()


def test_plan_meal_skips_search_when_gate_blocked() -> None:
    from recipe_search_agent.discovery_tools import plan_meal, set_search_agent

    set_gate_blocked(True)
    mock_agent = MagicMock()
    set_search_agent(mock_agent)

    json.loads(plan_meal("birthday dinner", 4))
    mock_agent.search.assert_not_called()


@patch("recipe_search_agent.guardrails.gate.evaluate_via_neugate")
def test_short_circuit_uses_default_pivot_when_cached_response_empty(mock_evaluate: MagicMock) -> None:
    mock_evaluate.return_value = {
        "is_violation": True,
        "category": "illegal_activities",
        "action": "short_circuit",
        "cached_response": "   ",
    }
    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="key",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
    )
    result = evaluate_message_sync("bad", settings=settings)
    assert result.blocked is True
    assert "kitchen" in (result.response_text or "").lower()
