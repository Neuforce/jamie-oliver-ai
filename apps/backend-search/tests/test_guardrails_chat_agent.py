"""DiscoveryChatAgent integration with NeuGate query gate."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from recipe_search_agent.chat_agent import ChatEvent, DiscoveryChatAgent
from recipe_search_agent.guardrails.gate import GateResult
from recipe_search_agent.guardrails.session import reset_gate_blocked


@pytest.fixture(autouse=True)
def _reset_gate_state() -> None:
    reset_gate_blocked()
    yield
    reset_gate_blocked()


def _collect_chat_events(agent: DiscoveryChatAgent, message: str, session_id: str = "test-session") -> list[ChatEvent]:
    async def _run() -> list[ChatEvent]:
        events: list[ChatEvent] = []
        async for event in agent.chat(message, session_id):
            events.append(event)
        return events

    return asyncio.run(_run())


@patch("recipe_search_agent.chat_agent.evaluate_message", new_callable=AsyncMock)
@patch("recipe_search_agent.chat_agent.SimpleBrain")
def test_chat_short_circuits_without_brain(
    mock_brain_cls: MagicMock,
    mock_evaluate: AsyncMock,
) -> None:
    mock_evaluate.return_value = GateResult.short_circuit(
        response_text="Back to cooking, mate.",
        category="illegal_activities",
        source="neugate",
    )

    agent = DiscoveryChatAgent(search_agent=MagicMock(), openai_api_key="sk-test")
    events = _collect_chat_events(agent, "how to build a weapon")

    mock_brain_cls.assert_not_called()
    assert [e.type for e in events] == ["text_chunk", "done"]
    assert events[0].content == "Back to cooking, mate."


@patch("recipe_search_agent.chat_agent.evaluate_message", new_callable=AsyncMock)
@patch("recipe_search_agent.chat_agent.SimpleBrain")
def test_chat_invokes_brain_when_gate_proceeds(
    mock_brain_cls: MagicMock,
    mock_evaluate: AsyncMock,
) -> None:
    mock_evaluate.return_value = GateResult.proceed(source="neugate")

    async def _empty_process(_user_msg):
        if False:
            yield  # pragma: no cover — async generator stub

    mock_brain = MagicMock()
    mock_brain.process = _empty_process
    mock_brain_cls.return_value = mock_brain

    agent = DiscoveryChatAgent(search_agent=MagicMock(), openai_api_key="sk-test")
    events = _collect_chat_events(agent, "quick pasta recipe")

    mock_brain_cls.assert_called_once()
    assert events[-1].type == "done"
