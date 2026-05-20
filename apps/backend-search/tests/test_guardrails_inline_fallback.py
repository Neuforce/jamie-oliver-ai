"""Inline fallback substring gate (deterministic unit tests)."""

from __future__ import annotations

import httpx
from unittest.mock import MagicMock, patch

import pytest

from recipe_search_agent.guardrails.config import GuardrailsSettings
from recipe_search_agent.guardrails.gate import evaluate_message_sync


@patch("recipe_search_agent.guardrails.gate.evaluate_via_neugate")
def test_inline_fallback_blocks_after_connect_error_when_enabled(mock_eval: MagicMock) -> None:
    mock_eval.side_effect = httpx.ConnectError("connection refused")
    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="key",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
        inline_fallback_on_neugate_error=True,
    )
    result = evaluate_message_sync(
        "How can I buy drugs online?", settings=settings, correlation_id="cid-123"
    )
    assert result.blocked is True
    assert result.source == "inline_fallback"
    assert "kitchen" in (result.response_text or "").lower() or "mate" in (result.response_text or "").lower()


@patch("recipe_search_agent.guardrails.gate.evaluate_via_neugate")
def test_inline_fallback_disabled_proceeds_on_error(mock_eval: MagicMock) -> None:
    mock_eval.side_effect = httpx.ConnectError("connection refused")
    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="key",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
        inline_fallback_on_neugate_error=False,
    )
    result = evaluate_message_sync("How can I buy drugs online?", settings=settings)
    assert result.blocked is False
    assert result.source == "fail_safe"


@patch("recipe_search_agent.guardrails.gate.evaluate_via_neugate")
def test_inline_fallback_safe_message_proceeds_on_error(mock_eval: MagicMock) -> None:
    mock_eval.side_effect = httpx.ConnectError("connection refused")
    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="key",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
        inline_fallback_on_neugate_error=True,
    )
    result = evaluate_message_sync(
        "I want a cosy pasta bake for tonight", settings=settings
    )
    assert result.blocked is False
    assert result.source == "fail_safe"
