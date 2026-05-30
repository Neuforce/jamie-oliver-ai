"""Golden culinary prompts must not be blocked by the gate (mocked NeuGate safe responses)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from recipe_search_agent.guardrails.config import GuardrailsSettings
from recipe_search_agent.guardrails.gate import evaluate_message_sync

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "golden_cooking.json"


def _settings() -> GuardrailsSettings:
    return GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="key",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
    )


@pytest.fixture
def golden_cases() -> list[dict[str, str]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@patch("jamie_guardrails.gate.evaluate_via_neugate")
def test_golden_cooking_prompts_proceed(mock_evaluate: MagicMock, golden_cases: list[dict[str, str]]) -> None:
    mock_evaluate.return_value = {
        "is_violation": False,
        "category": "safe_domain",
        "action": "proceed",
        "cached_response": None,
    }
    settings = _settings()

    for case in golden_cases:
        prompt = case["prompt"]
        result = evaluate_message_sync(prompt, settings=settings)
        assert result.blocked is False, f"golden case blocked unexpectedly: {prompt!r}"
        assert result.source == "neugate"

    assert mock_evaluate.call_count == len(golden_cases)
