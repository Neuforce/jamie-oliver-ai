"""Unit tests for verbal spend-consent resolution in DiscoveryVoiceHandler."""

import asyncio
from unittest.mock import AsyncMock


def _make_handler(*, session_id: str = "session-1", user_id: str | None = "user-1"):
    from recipe_search_agent.voice_handler import DiscoveryVoiceHandler

    handler = object.__new__(DiscoveryVoiceHandler)
    handler.session_id = session_id
    handler.jamie_user_id = user_id
    handler._current_response_id = "resp-1"
    handler._send = AsyncMock()
    handler.synth_and_send = AsyncMock()
    return handler


def _resolved_payload(send_mock: AsyncMock):
    for call in send_mock.await_args_list:
        if call.args and call.args[0] == "spend_mandate_consent_resolved":
            return call.args[1]
    return None


def test_verbal_consent_no_open_ask_returns_false_and_sends_no_event(monkeypatch):
    class FakeAskService:
        def get_open_ask_for_session(self, session_id: str):
            return None

    monkeypatch.setattr(
        "recipe_search_agent.spend_mandate_ask_service.SpendMandateAskService",
        FakeAskService,
    )
    monkeypatch.setattr(
        "recipe_search_agent.commerce_context.set_commerce_context",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "recipe_search_agent.consent_intent.classify_consent_utterance",
        lambda _text: "grant",
    )

    handler = _make_handler()
    resolved = asyncio.run(handler._try_verbal_consent_resolution("yes"))

    assert resolved is False
    assert _resolved_payload(handler._send) is None


def test_verbal_consent_grant_emits_approved_with_serialized_mandate(monkeypatch):
    ask = {"id": "ask-1", "backend_recipe_id": "pasta"}
    mandate = {
        "id": "mandate-1",
        "user_id": "user-1",
        "session_id": "session-1",
        "ceiling_amount": 1200,
        "currency_code": "USD",
        "consumed_amount": 0,
        "status": "active",
        "source": "voice",
        "granted_at": "2026-01-01T00:00:00+00:00",
        "expires_at": "2026-01-01T00:30:00+00:00",
    }

    class FakeAskService:
        def get_open_ask_for_session(self, session_id: str):
            return ask

        def resolve_ask(self, ask_id: str, *, grant: bool, user_id: str | None, source: str):
            assert ask_id == "ask-1"
            assert grant is True
            assert user_id == "user-1"
            assert source == "voice"
            return {"ok": True, "ask": ask, "mandate": mandate}

    monkeypatch.setattr(
        "recipe_search_agent.spend_mandate_ask_service.SpendMandateAskService",
        FakeAskService,
    )
    monkeypatch.setattr(
        "recipe_search_agent.commerce_context.set_commerce_context",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "recipe_search_agent.consent_intent.classify_consent_utterance",
        lambda _text: "grant",
    )

    handler = _make_handler()
    resolved = asyncio.run(handler._try_verbal_consent_resolution("yes"))

    payload = _resolved_payload(handler._send)
    assert resolved is True
    assert payload is not None
    assert payload["approved"] is True
    assert payload["reason"] is None
    assert payload["mandate"]["id"] == "mandate-1"
    assert payload["mandate"]["userId"] == "user-1"
    assert payload["mandate"]["remainingAmount"] == 1200


def test_verbal_consent_decline_emits_declined_reason(monkeypatch):
    ask = {"id": "ask-1", "backend_recipe_id": "pasta"}

    class FakeAskService:
        def get_open_ask_for_session(self, session_id: str):
            return ask

        def resolve_ask(self, ask_id: str, *, grant: bool, user_id: str | None, source: str):
            assert grant is False
            return {"ok": True, "ask": ask, "mandate": None}

    monkeypatch.setattr(
        "recipe_search_agent.spend_mandate_ask_service.SpendMandateAskService",
        FakeAskService,
    )
    monkeypatch.setattr(
        "recipe_search_agent.commerce_context.set_commerce_context",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "recipe_search_agent.consent_intent.classify_consent_utterance",
        lambda _text: "decline",
    )

    handler = _make_handler()
    resolved = asyncio.run(handler._try_verbal_consent_resolution("no"))

    payload = _resolved_payload(handler._send)
    assert resolved is True
    assert payload is not None
    assert payload["approved"] is False
    assert payload["reason"] == "declined"
    assert payload["mandate"] is None


def test_verbal_consent_grant_without_user_id_emits_needs_tab_and_no_mandate(monkeypatch):
    ask = {"id": "ask-1", "backend_recipe_id": "pasta"}

    class FakeAskService:
        def __init__(self):
            self.minted_count = 0

        def get_open_ask_for_session(self, session_id: str):
            return ask

        def resolve_ask(self, ask_id: str, *, grant: bool, user_id: str | None, source: str):
            if grant and not user_id:
                return {"ok": False, "error": "user_id_required_for_grant", "ask": ask, "mandate": None}
            self.minted_count += 1
            return {"ok": True, "ask": ask, "mandate": {"id": "unexpected"}}

    fake_service = FakeAskService()
    monkeypatch.setattr(
        "recipe_search_agent.spend_mandate_ask_service.SpendMandateAskService",
        lambda: fake_service,
    )
    monkeypatch.setattr(
        "recipe_search_agent.commerce_context.set_commerce_context",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "recipe_search_agent.consent_intent.classify_consent_utterance",
        lambda _text: "grant",
    )

    handler = _make_handler(user_id=None)
    resolved = asyncio.run(handler._try_verbal_consent_resolution("yes"))

    payload = _resolved_payload(handler._send)
    assert resolved is True
    assert payload is not None
    assert payload["approved"] is False
    assert payload["reason"] == "needs_tab"
    assert payload["mandate"] is None
    assert fake_service.minted_count == 0


def test_verbal_consent_grant_on_expired_ask_emits_expired_reason(monkeypatch):
    ask = {"id": "ask-1", "backend_recipe_id": "pasta"}

    class FakeAskService:
        def get_open_ask_for_session(self, session_id: str):
            return ask

        def resolve_ask(self, ask_id: str, *, grant: bool, user_id: str | None, source: str):
            return {"ok": False, "error": "ask_expired", "ask": ask, "mandate": None}

    monkeypatch.setattr(
        "recipe_search_agent.spend_mandate_ask_service.SpendMandateAskService",
        FakeAskService,
    )
    monkeypatch.setattr(
        "recipe_search_agent.commerce_context.set_commerce_context",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "recipe_search_agent.consent_intent.classify_consent_utterance",
        lambda _text: "grant",
    )

    handler = _make_handler()
    resolved = asyncio.run(handler._try_verbal_consent_resolution("yes"))

    payload = _resolved_payload(handler._send)
    assert resolved is True
    assert payload is not None
    assert payload["approved"] is False
    assert payload["reason"] == "expired"
    assert payload["mandate"] is None


def test_verbal_consent_double_grant_is_idempotent_no_second_mandate_minted(monkeypatch):
    class FakeAskService:
        def __init__(self):
            self.ask = {"id": "ask-1", "backend_recipe_id": "pasta", "status": "requested"}
            self.minted_count = 0
            self.mandate = None

        def get_open_ask_for_session(self, session_id: str):
            return self.ask

        def resolve_ask(self, ask_id: str, *, grant: bool, user_id: str | None, source: str):
            if self.ask["status"] == "active":
                return {
                    "ok": True,
                    "ask": self.ask,
                    "mandate": self.mandate,
                    "already_resolved": True,
                }
            self.minted_count += 1
            self.mandate = {
                "id": "mandate-1",
                "user_id": user_id,
                "session_id": "session-1",
                "ceiling_amount": 1200,
                "currency_code": "USD",
                "consumed_amount": 0,
                "status": "active",
                "source": source,
                "granted_at": "2026-01-01T00:00:00+00:00",
                "expires_at": "2026-01-01T00:30:00+00:00",
            }
            self.ask["status"] = "active"
            return {"ok": True, "ask": self.ask, "mandate": self.mandate}

    fake_service = FakeAskService()
    monkeypatch.setattr(
        "recipe_search_agent.spend_mandate_ask_service.SpendMandateAskService",
        lambda: fake_service,
    )
    monkeypatch.setattr(
        "recipe_search_agent.commerce_context.set_commerce_context",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "recipe_search_agent.consent_intent.classify_consent_utterance",
        lambda _text: "grant",
    )

    handler = _make_handler()
    first = asyncio.run(handler._try_verbal_consent_resolution("yes"))
    second = asyncio.run(handler._try_verbal_consent_resolution("yes again"))

    events = [
        call.args[1]
        for call in handler._send.await_args_list
        if call.args and call.args[0] == "spend_mandate_consent_resolved"
    ]
    assert first is True
    assert second is True
    assert fake_service.minted_count == 1
    assert len(events) == 2
    assert events[0]["mandate"]["id"] == "mandate-1"
    assert events[1]["mandate"]["id"] == "mandate-1"
