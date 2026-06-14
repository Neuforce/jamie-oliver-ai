"""Tests for spend mandate ask FSM."""

from unittest.mock import MagicMock

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
