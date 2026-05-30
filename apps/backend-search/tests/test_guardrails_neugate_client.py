"""Tests for NeuGate HTTP client (mocked transport)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx

from recipe_search_agent.guardrails.config import GuardrailsSettings
from recipe_search_agent.guardrails.neugate_client import evaluate_via_neugate


def _settings(*, api_key: str = "test-key") -> GuardrailsSettings:
    return GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://neugate.test",
        neugate_api_key=api_key,
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.5,
    )


@patch("jamie_guardrails.neugate_client.httpx.Client")
def test_evaluate_via_neugate_posts_message_and_policy(mock_client_cls: MagicMock) -> None:
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "is_violation": False,
        "action": "proceed",
        "category": "safe_domain",
    }
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post.return_value = mock_response
    mock_client_cls.return_value = mock_client

    policy = {"critical_blocks": ["illegal_activities"], "pivot_templates": ["Pivot."]}
    settings = _settings()

    result = evaluate_via_neugate(message="pasta tonight", policy=policy, settings=settings)

    assert result["action"] == "proceed"
    mock_client.post.assert_called_once()
    call_args = mock_client.post.call_args
    assert call_args[0][0] == "http://neugate.test/v1/evaluate"
    body = call_args[1]["json"]
    assert body["project_id"] == "jamie-oliver-ai"
    assert body["message"] == "pasta tonight"
    assert body["policy"] == policy
    assert call_args[1]["headers"]["X-API-Key"] == "test-key"


@patch("jamie_guardrails.neugate_client.httpx.Client")
def test_evaluate_via_neugate_omits_api_key_header_when_empty(mock_client_cls: MagicMock) -> None:
    mock_response = MagicMock()
    mock_response.json.return_value = {"is_violation": False, "action": "proceed"}
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post.return_value = mock_response
    mock_client_cls.return_value = mock_client

    settings = _settings(api_key="")
    evaluate_via_neugate(message="hello", policy={}, settings=settings)

    headers = mock_client.post.call_args[1]["headers"]
    assert "X-API-Key" not in headers


@patch("jamie_guardrails.neugate_client.httpx.Client")
def test_evaluate_via_neugate_raises_on_http_error(mock_client_cls: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post.side_effect = httpx.ConnectError("refused")
    mock_client_cls.return_value = mock_client

    try:
        evaluate_via_neugate(message="x", policy={}, settings=_settings())
    except httpx.ConnectError:
        return
    raise AssertionError("expected ConnectError")
