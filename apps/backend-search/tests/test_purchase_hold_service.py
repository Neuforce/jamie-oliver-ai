"""Tests for purchase hold FSM service."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from unittest.mock import patch

from recipe_search_agent.purchase_hold_service import PURCHASE_HOLD_SECONDS, PurchaseHoldService


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def test_create_hold_sets_holding_status_and_30s_expiry():
    repo = MagicMock()
    repo.create_hold.side_effect = lambda payload: payload
    service = PurchaseHoldService(repository=repo)

    hold = service.create_hold(
        user_id="user-1",
        session_id="session-1",
        backend_recipe_id="pasta",
        price_amount=500,
        currency_code="USD",
        ask_id="ask-1",
        mandate_id="mandate-1",
        tool_call_id="tc-1",
        response_id="resp-1",
    )

    assert hold["status"] == "holding"
    delta = datetime.fromisoformat(hold["hold_expires_at"]) - datetime.now(timezone.utc)
    assert PURCHASE_HOLD_SECONDS - 2 <= delta.total_seconds() <= PURCHASE_HOLD_SECONDS + 2


def test_commit_hold_succeeds_when_expired():
    past = datetime.now(timezone.utc) - timedelta(seconds=5)
    repo = MagicMock()
    repo.get_hold.return_value = {"id": "hold-1", "status": "holding", "hold_expires_at": _iso(past)}
    repo.claim_hold_transition.return_value = {
        "id": "hold-1",
        "status": "committed",
        "hold_expires_at": _iso(past),
        "committed_at": _iso(datetime.now(timezone.utc)),
    }
    service = PurchaseHoldService(repository=repo)

    result = service.commit_hold("hold-1")

    assert result["ok"] is True
    assert result["hold"]["status"] == "committed"
    repo.claim_hold_transition.assert_called_once()


def test_commit_hold_before_expiry_returns_not_yet_expired_without_transition():
    future = datetime.now(timezone.utc) + timedelta(seconds=15)
    repo = MagicMock()
    repo.get_hold.return_value = {"id": "hold-1", "status": "holding", "hold_expires_at": _iso(future)}
    service = PurchaseHoldService(repository=repo)

    result = service.commit_hold("hold-1")

    assert result == {"ok": False, "error": "not_yet_expired", "hold": repo.get_hold.return_value}
    repo.claim_hold_transition.assert_not_called()


def test_commit_hold_is_idempotent_when_already_committed():
    committed = {"id": "hold-1", "status": "committed"}
    repo = MagicMock()
    repo.get_hold.return_value = committed
    service = PurchaseHoldService(repository=repo)

    first = service.commit_hold("hold-1")
    second = service.commit_hold("hold-1")

    assert first["ok"] is True
    assert first["already_committed"] is True
    assert second["ok"] is True
    assert second["already_committed"] is True
    repo.claim_hold_transition.assert_not_called()


def test_commit_hold_on_undone_returns_already_undone():
    repo = MagicMock()
    repo.get_hold.return_value = {"id": "hold-1", "status": "undone"}
    service = PurchaseHoldService(repository=repo)

    result = service.commit_hold("hold-1")

    assert result["ok"] is False
    assert result["error"] == "already_undone"
    repo.claim_hold_transition.assert_not_called()


def test_undo_hold_transitions_and_records_decline_receipt():
    repo = MagicMock()
    repo.get_hold.return_value = {
        "id": "hold-1",
        "status": "holding",
        "backend_recipe_id": "pasta",
        "ask_id": "ask-1",
        "mandate_id": "mandate-1",
        "session_id": "session-1",
        "user_id": "user-1",
        "tool_call_id": "tc-1",
        "response_id": "resp-1",
    }
    repo.claim_hold_transition.return_value = {
        **repo.get_hold.return_value,
        "status": "undone",
        "undone_at": _iso(datetime.now(timezone.utc)),
    }
    service = PurchaseHoldService(repository=repo)

    with patch("recipe_search_agent.purchase_hold_service.record_agent_action_receipt") as record_mock:
        result = service.undo_hold(
            "hold-1",
            channel="voice",
            decision_detail="undo that",
            user_id="user-override",
        )

    assert result["ok"] is True
    assert result["hold"]["status"] == "undone"
    record_mock.assert_called_once()
    receipt = record_mock.call_args[0][0]
    assert receipt.outcome == "decline"
    assert receipt.action_name == "undo_purchase_hold"


def test_undo_hold_is_idempotent_and_does_not_duplicate_receipt():
    holding = {"id": "hold-1", "status": "holding", "backend_recipe_id": "pasta"}
    undone = {"id": "hold-1", "status": "undone", "backend_recipe_id": "pasta"}
    repo = MagicMock()
    repo.get_hold.side_effect = [holding, undone]
    repo.claim_hold_transition.return_value = undone
    service = PurchaseHoldService(repository=repo)

    with patch("recipe_search_agent.purchase_hold_service.record_agent_action_receipt") as record_mock:
        first = service.undo_hold("hold-1", channel="chat")
        second = service.undo_hold("hold-1", channel="chat")

    assert first["ok"] is True
    assert second["ok"] is True
    assert second.get("already_undone") is True
    record_mock.assert_called_once()


def test_undo_hold_on_committed_returns_already_committed_without_receipt():
    repo = MagicMock()
    repo.get_hold.return_value = {"id": "hold-1", "status": "committed"}
    service = PurchaseHoldService(repository=repo)

    with patch("recipe_search_agent.purchase_hold_service.record_agent_action_receipt") as record_mock:
        result = service.undo_hold("hold-1", channel="chat")

    assert result["ok"] is False
    assert result["error"] == "already_committed"
    repo.claim_hold_transition.assert_not_called()
    record_mock.assert_not_called()


def test_commit_hold_race_refetches_and_returns_coherent_error():
    expired_holding = {
        "id": "hold-1",
        "status": "holding",
        "hold_expires_at": _iso(datetime.now(timezone.utc) - timedelta(seconds=2)),
    }
    repo = MagicMock()
    repo.get_hold.side_effect = [expired_holding, {"id": "hold-1", "status": "undone"}]
    repo.claim_hold_transition.return_value = None
    service = PurchaseHoldService(repository=repo)

    result = service.commit_hold("hold-1")

    assert result["ok"] is False
    assert result["error"] == "already_undone"
    assert repo.get_hold.call_count == 2
