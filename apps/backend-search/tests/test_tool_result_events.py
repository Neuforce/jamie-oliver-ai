import sys
from types import ModuleType


if "supabase" not in sys.modules:
    supabase_module = ModuleType("supabase")

    class _StubClient:
        pass

    def _stub_create_client(*_args, **_kwargs):
        raise RuntimeError("create_client should not be called in these unit tests")

    supabase_module.Client = _StubClient
    supabase_module.create_client = _stub_create_client
    sys.modules["supabase"] = supabase_module

from recipe_search_agent.tool_result_events import tool_result_to_chat_events


def test_request_supertab_unlock_auto_charge_skips_consent_and_ask(monkeypatch):
    ask_calls = []

    class _FakeSpendMandateAskService:
        def create_ask(self, **kwargs):
            ask_calls.append(kwargs)
            return {"id": "ask-1"}

    monkeypatch.setattr(
        "recipe_search_agent.spend_mandate_ask_service.SpendMandateAskService",
        lambda: _FakeSpendMandateAskService(),
    )
    monkeypatch.setattr("recipe_search_agent.tool_result_events.resolve_recipe_price", lambda _rid: (199, "USD"))

    events = tool_result_to_chat_events(
        "request_supertab_unlock",
        "call-1",
        {
            "ok": True,
            "recipe_backend_id": "pesto-pasta",
            "auto_charge": True,
            "mandate": {"id": "mandate-1", "remainingAmount": 300},
            "purchase_intent": {"intent_type": "recipe_unlock"},
        },
        response_id="resp-1",
    )

    event_types = [event.type for event in events]
    assert "spend_mandate_consent_requested" not in event_types
    assert ask_calls == []

    paywall_event = next(event for event in events if event.type == "recipe_paywall_requested")
    assert paywall_event.metadata["auto_charge"] is True
    assert paywall_event.metadata["mandate"]["id"] == "mandate-1"
    assert paywall_event.metadata["tool_call_id"] == "call-1"
    assert paywall_event.metadata["response_id"] == "resp-1"


def test_request_supertab_unlock_non_auto_charge_keeps_consent_and_ask(monkeypatch):
    ask_calls = []

    class _FakeSpendMandateAskService:
        def create_ask(self, **kwargs):
            ask_calls.append(kwargs)
            return {"id": "ask-123"}

    monkeypatch.setattr(
        "recipe_search_agent.spend_mandate_ask_service.SpendMandateAskService",
        lambda: _FakeSpendMandateAskService(),
    )
    monkeypatch.setattr("recipe_search_agent.tool_result_events.resolve_recipe_price", lambda _rid: (199, "USD"))
    monkeypatch.setattr("recipe_search_agent.commerce_context.get_commerce_session_id", lambda: "sess-1")
    monkeypatch.setattr("recipe_search_agent.commerce_context.get_commerce_user_id", lambda: "user-1")

    events = tool_result_to_chat_events(
        "request_supertab_unlock",
        "call-2",
        {
            "ok": True,
            "recipe_backend_id": "pesto-pasta",
            "auto_charge": False,
            "mandate": None,
            "purchase_intent": {"intent_type": "recipe_unlock"},
        },
        response_id="resp-2",
    )

    assert len(ask_calls) == 1
    assert ask_calls[0]["backend_recipe_id"] == "pesto-pasta"
    assert ask_calls[0]["price_amount"] == 199

    event_types = [event.type for event in events]
    assert "spend_mandate_consent_requested" in event_types

    consent_event = next(event for event in events if event.type == "spend_mandate_consent_requested")
    assert consent_event.metadata["ask_id"] == "ask-123"

    paywall_event = next(event for event in events if event.type == "recipe_paywall_requested")
    assert paywall_event.metadata["auto_charge"] is False
    assert "mandate" not in paywall_event.metadata
