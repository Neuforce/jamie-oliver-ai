"""Tests for spend mandate ask FSM."""

from unittest.mock import MagicMock
from unittest.mock import patch

from recipe_search_agent.spend_mandate_ask_service import SpendMandateAskService


def test_decline_ask():
    repo = MagicMock()
    repo.get_ask.return_value = {
        "id": "ask-1",
        "status": "requested",
        "backend_recipe_id": "salad",
        "ceiling_amount": 1000,
        "currency_code": "USD",
    }
    repo.update_ask.return_value = {
        "id": "ask-1",
        "status": "declined",
        "backend_recipe_id": "salad",
    }
    service = SpendMandateAskService(repository=repo, mandate_service=MagicMock())

    result = service.resolve_ask("ask-1", grant=False)
    assert result["ok"] is True
    assert result["mandate"] is None
    repo.update_ask.assert_called_once()


def test_decline_records_action_receipt_with_channel_and_decision_detail():
    repo = MagicMock()
    repo.get_ask.return_value = {
        "id": "ask-1",
        "status": "requested",
        "backend_recipe_id": "salad",
        "ceiling_amount": 1000,
        "currency_code": "USD",
        "session_id": "session-1",
        "user_id": "user-1",
        "tool_call_id": "tc-1",
        "response_id": "resp-1",
    }
    repo.update_ask.return_value = {
        "id": "ask-1",
        "status": "declined",
        "backend_recipe_id": "salad",
    }
    service = SpendMandateAskService(repository=repo, mandate_service=MagicMock())

    with patch(
        "recipe_search_agent.spend_mandate_ask_service.record_agent_action_receipt"
    ) as record_mock:
        result = service.resolve_ask(
            "ask-1",
            grant=False,
            channel="chat",
            decision_detail="button:decline",
        )

    assert result["ok"] is True
    record_mock.assert_called_once()
    receipt = record_mock.call_args[0][0]
    assert receipt.outcome == "decline"
    assert receipt.channel == "chat"
    assert receipt.decision_detail == "button:decline"
    assert receipt.ask_id == "ask-1"
    assert receipt.action_name == "request_supertab_unlock"
    assert receipt.kind == "write"


def test_grant_requires_user_id():
    repo = MagicMock()
    repo.get_ask.return_value = {
        "id": "ask-1",
        "status": "requested",
        "backend_recipe_id": "salad",
        "ceiling_amount": 1000,
        "currency_code": "USD",
        "user_id": None,
    }
    mandate_service = MagicMock()
    service = SpendMandateAskService(repository=repo, mandate_service=mandate_service)

    result = service.resolve_ask("ask-1", grant=True)
    assert result["ok"] is False
    assert result["error"] == "user_id_required_for_grant"
    mandate_service.create_mandate.assert_not_called()


def test_requested_ask_expires_before_grant():
    repo = MagicMock()
    repo.get_ask.return_value = {
        "id": "ask-1",
        "status": "requested",
        "backend_recipe_id": "salad",
        "ceiling_amount": 1000,
        "currency_code": "USD",
        "user_id": "user-1",
        "expires_at": "2000-01-01T00:00:00",
    }
    repo.update_ask.return_value = {
        "id": "ask-1",
        "status": "expired",
        "backend_recipe_id": "salad",
    }
    mandate_service = MagicMock()
    service = SpendMandateAskService(repository=repo, mandate_service=mandate_service)

    result = service.resolve_ask("ask-1", grant=True)

    assert result["ok"] is False
    assert result["error"] == "ask_expired"
    assert result["ask"]["status"] == "expired"
    mandate_service.create_mandate.assert_not_called()
    repo.update_ask.assert_called_once()


def test_grant_records_action_receipt_with_channel_and_decision_detail():
    repo = MagicMock()
    repo.get_ask.return_value = {
        "id": "ask-1",
        "status": "requested",
        "backend_recipe_id": "salad",
        "ceiling_amount": 1000,
        "currency_code": "USD",
        "session_id": "session-1",
        "user_id": "user-1",
        "tool_call_id": "tc-1",
        "response_id": "resp-1",
    }
    repo.update_ask.return_value = {
        "id": "ask-1",
        "status": "active",
        "backend_recipe_id": "salad",
        "mandate_id": "mandate-1",
    }
    mandate_service = MagicMock()
    mandate_service.create_mandate.return_value = {
        "id": "mandate-1",
        "user_id": "user-1",
    }
    service = SpendMandateAskService(repository=repo, mandate_service=mandate_service)

    with patch(
        "recipe_search_agent.spend_mandate_ask_service.record_agent_action_receipt"
    ) as record_mock:
        result = service.resolve_ask(
            "ask-1",
            grant=True,
            user_id="user-1",
            channel="voice",
            decision_detail="yes put it on my tab",
        )

    assert result["ok"] is True
    assert result["mandate"]["id"] == "mandate-1"
    record_mock.assert_called_once()
    receipt = record_mock.call_args[0][0]
    assert receipt.outcome == "accept"
    assert receipt.channel == "voice"
    assert receipt.decision_detail == "yes put it on my tab"
    assert receipt.ask_id == "ask-1"
    assert receipt.action_name == "request_supertab_unlock"
    assert receipt.kind == "write"


def test_receipt_repository_failure_does_not_break_resolve_grant():
    repo = MagicMock()
    repo.get_ask.return_value = {
        "id": "ask-1",
        "status": "requested",
        "backend_recipe_id": "salad",
        "ceiling_amount": 1000,
        "currency_code": "USD",
        "session_id": "session-1",
        "user_id": "user-1",
    }
    repo.update_ask.return_value = {
        "id": "ask-1",
        "status": "active",
        "backend_recipe_id": "salad",
        "mandate_id": "mandate-1",
    }
    mandate_service = MagicMock()
    mandate_service.create_mandate.return_value = {
        "id": "mandate-1",
        "user_id": "user-1",
    }
    service = SpendMandateAskService(repository=repo, mandate_service=mandate_service)

    with patch(
        "recipe_search_agent.repositories.AgentActionReceiptRepository.create_receipt",
        side_effect=RuntimeError("db unavailable"),
    ):
        result = service.resolve_ask("ask-1", grant=True, user_id="user-1")

    assert result["ok"] is True
    assert result["ask"]["status"] == "active"
    assert result["mandate"]["id"] == "mandate-1"


def test_receipt_repository_failure_does_not_break_resolve_decline():
    repo = MagicMock()
    repo.get_ask.return_value = {
        "id": "ask-1",
        "status": "requested",
        "backend_recipe_id": "salad",
        "ceiling_amount": 1000,
        "currency_code": "USD",
        "session_id": "session-1",
        "user_id": "user-1",
    }
    repo.update_ask.return_value = {
        "id": "ask-1",
        "status": "declined",
        "backend_recipe_id": "salad",
    }
    service = SpendMandateAskService(repository=repo, mandate_service=MagicMock())

    with patch(
        "recipe_search_agent.repositories.AgentActionReceiptRepository.create_receipt",
        side_effect=RuntimeError("db unavailable"),
    ):
        result = service.resolve_ask("ask-1", grant=False)

    assert result["ok"] is True
    assert result["ask"]["status"] == "declined"
    assert result["mandate"] is None
