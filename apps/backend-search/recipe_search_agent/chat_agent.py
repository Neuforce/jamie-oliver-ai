"""
Chat agent for Jamie Oliver recipe discovery.

Uses CCAI's SimpleBrain for LLM orchestration with tool calling,
and manages chat sessions with persistent memory.
"""

import os
import logging
import asyncio
import time
import uuid
from typing import Dict, Optional, AsyncGenerator, Any
from dataclasses import dataclass
from datetime import datetime, timedelta

from ccai.core.brain.simple_brain import SimpleBrain
from ccai.core.llm.llm_openai import OpenAILLM
from ccai.core.llm.base import ChunkResponse, FunctionCallResponse
from ccai.core.memory.chat_memory import SimpleChatMemory
from ccai.core.messages.base import SystemMessage, UserMessage

from recipe_search_agent.prompts import (
    DISCOVERY_PROMPT_REVISION,
    JAMIE_DISCOVERY_PROMPT,
    PREPROMPT_VERSION,
)
from recipe_search_agent.discovery_tools import (
    discovery_function_manager,
    set_search_agent,
)
from recipe_search_agent.guardrails import evaluate_message, reset_gate_blocked, set_gate_blocked
from recipe_search_agent.focused_recipe_context import build_focused_recipe_context_suffix

logger = logging.getLogger(__name__)


@dataclass
class ChatSession:
    """Represents an active chat session."""
    session_id: str
    chat_memory: SimpleChatMemory
    created_at: datetime
    last_activity: datetime
    prompt_revision: int = 0


from recipe_search_agent.chat_events import ChatEvent
from recipe_search_agent.tool_result_events import tool_result_to_chat_events


class DiscoveryChatAgent:
    """
    Chat agent for recipe discovery using Jamie Oliver persona.

    Manages multiple chat sessions and uses CCAI's SimpleBrain for
    LLM orchestration with tool calling.
    """

    # Session timeout in minutes
    SESSION_TIMEOUT_MINUTES = 60

    def __init__(
        self,
        search_agent,
        openai_api_key: Optional[str] = None,
        model: str = "gpt-4o",
        temperature: float = 0.7,
    ):
        """
        Initialize the discovery chat agent.

        Args:
            search_agent: RecipeSearchAgent instance for search tools
            openai_api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
            model: LLM model to use
            temperature: Sampling temperature for LLM
        """
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required")

        self.model = model
        self.temperature = temperature
        self.search_agent = search_agent

        # Set the search agent for tools to use
        set_search_agent(search_agent)

        # Active sessions: session_id -> ChatSession
        self._sessions: Dict[str, ChatSession] = {}

        logger.info(
            "DiscoveryChatAgent initialized model=%s preprompt=%s prompt_revision=%s",
            model,
            PREPROMPT_VERSION,
            DISCOVERY_PROMPT_REVISION,
        )

    def _inject_current_system_prompt(self, chat_memory: SimpleChatMemory) -> None:
        """Replace stale system preamble so prompt edits reach long-lived websocket sessions."""
        hist = chat_memory.history
        if not hist:
            chat_memory.add_system_message(content=JAMIE_DISCOVERY_PROMPT)
            return
        if isinstance(hist[0], SystemMessage):
            chat_memory.history[0] = SystemMessage(content=JAMIE_DISCOVERY_PROMPT)
            return
        chat_memory.history.insert(0, SystemMessage(content=JAMIE_DISCOVERY_PROMPT))

    def _create_llm(self) -> OpenAILLM:
        """Create a new LLM instance."""
        return OpenAILLM(
            api_key=self.openai_api_key,
            model=self.model,
            temperature=self.temperature,
        )

    def _get_or_create_session(self, session_id: str) -> ChatSession:
        """Get existing session or create a new one."""
        # Clean up expired sessions periodically
        self._cleanup_expired_sessions()

        if session_id not in self._sessions:
            chat_memory = SimpleChatMemory()
            chat_memory.add_system_message(content=JAMIE_DISCOVERY_PROMPT)

            self._sessions[session_id] = ChatSession(
                session_id=session_id,
                chat_memory=chat_memory,
                created_at=datetime.now(),
                last_activity=datetime.now(),
                prompt_revision=DISCOVERY_PROMPT_REVISION,
            )
            logger.info(f"Created new chat session: {session_id}")
        else:
            sess = self._sessions[session_id]
            sess.last_activity = datetime.now()
            if sess.prompt_revision != DISCOVERY_PROMPT_REVISION:
                logger.info(
                    "Upgrading discovery system prompt revision %s -> %s for session %s",
                    sess.prompt_revision,
                    DISCOVERY_PROMPT_REVISION,
                    session_id,
                )
                self._inject_current_system_prompt(sess.chat_memory)
                sess.prompt_revision = DISCOVERY_PROMPT_REVISION

        return self._sessions[session_id]

    def _cleanup_expired_sessions(self) -> None:
        """Remove sessions that have been inactive for too long."""
        now = datetime.now()
        timeout = timedelta(minutes=self.SESSION_TIMEOUT_MINUTES)

        expired = [
            sid for sid, session in self._sessions.items()
            if now - session.last_activity > timeout
        ]

        for sid in expired:
            del self._sessions[sid]
            logger.info(f"Cleaned up expired session: {sid}")

    def clear_session(self, session_id: str) -> bool:
        """
        Clear a chat session's memory.

        Args:
            session_id: Session to clear

        Returns:
            True if session was cleared, False if not found
        """
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.info(f"Cleared chat session: {session_id}")
            return True
        return False

    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a session."""
        session = self._sessions.get(session_id)
        if not session:
            return None

        return {
            "session_id": session.session_id,
            "created_at": session.created_at.isoformat(),
            "last_activity": session.last_activity.isoformat(),
            "message_count": len(session.chat_memory.get_messages()),
        }

    def commit_partial_response(self, session_id: str, content: str) -> None:
        """
        Commit a partial assistant response to the session's chat memory.

        Called by DiscoveryVoiceHandler when a turn is interrupted mid-LLM-stream
        so that the next LLM call sees a well-formed conversation history rather
        than an orphaned user message with no reply.

        Args:
            session_id: Session to update.
            content: Partial assistant text accumulated before the interrupt.
        """
        session = self._sessions.get(session_id)
        if session and content:
            session.chat_memory.add_assistant_message(content=content)
            logger.debug(
                "Committed partial response (%d chars) for session %s",
                len(content),
                session_id,
            )

    async def chat(
        self,
        message: str,
        session_id: str,
        focused_recipe_backend_id: Optional[str] = None,
    ) -> AsyncGenerator[ChatEvent, None]:
        """
        Process a chat message and stream responses.

        This method works identically for text and voice - the presentation
        layer (frontend) handles any differences in how results are displayed.

        Args:
            message: User's message
            session_id: Session identifier for conversation continuity

        Yields:
            ChatEvent objects with response chunks and tool call info
        """
        session = self._get_or_create_session(session_id)
        turn_started_at = time.perf_counter()
        response_id = str(uuid.uuid4())

        correlation_id = str(uuid.uuid4())
        gate_started_at = time.perf_counter()
        gate = await evaluate_message(message, correlation_id=correlation_id)
        logger.info(
            "[voice_latency] %s",
            {
                "stage": "guardrail_complete",
                "session_id": session_id,
                "gate_ms": round((time.perf_counter() - gate_started_at) * 1000, 1),
                "total_ms": round((time.perf_counter() - turn_started_at) * 1000, 1),
                "blocked": gate.blocked,
            },
        )
        if gate.blocked:
            set_gate_blocked(True)
            logger.info(
                "Query gate blocked session=%s source=%s category=%s correlation_id=%s",
                session_id,
                gate.source,
                gate.category,
                correlation_id,
            )
            yield ChatEvent(type="text_chunk", content=gate.response_text or "")
            yield ChatEvent(type="done", content="", metadata={"response_id": str(uuid.uuid4())})
            reset_gate_blocked()
            return

        set_gate_blocked(False)

        agent_message = message
        focused_id = (focused_recipe_backend_id or "").strip()
        if focused_id:
            agent_message = message + build_focused_recipe_context_suffix(focused_id)

        # Create brain with session's memory
        brain = SimpleBrain(
            llm=self._create_llm(),
            chat_memory=session.chat_memory,
            function_manager=discovery_function_manager,
        )

        # Create user message - identical processing for text and voice
        user_msg = UserMessage(content=agent_message)

        logger.info(f"Processing message for session {session_id}: {message[:50]}...")

        # Track tool calls to emit their results after processing
        pending_tool_calls: Dict[str, str] = {}  # tool_call_id -> function_name
        tool_calls_seen: set[str] = set()
        tool_results_emitted = False

        # Track whether the LLM actually produced any prose. Used below to
        # decide whether we need to synthesise a short intro for tool-only
        # turns where the model went straight to tool calling without saying
        # anything to the user.
        tool_used = False
        any_text_sent = False
        first_text_chunk_logged = False
        tool_call_started_at: Dict[str, float] = {}

        try:
            # Process message through brain
            async for event in brain.process(user_msg):
                if isinstance(event, ChunkResponse):
                    # Stream every chunk through untouched. We used to cap
                    # post-tool prose at 240 chars (tool-dominant policy),
                    # but the new UI renders the full response inside the
                    # Jamie card alongside the tool results, so the cap was
                    # silently clipping mid-sentence ("...Gourmet Beef
                    # Burger - A"). One source of truth: whatever the LLM
                    # says, the user sees.
                    if event.content:
                        any_text_sent = True
                        if not first_text_chunk_logged:
                            first_text_chunk_logged = True
                            logger.info(
                                "[voice_latency] %s",
                                {
                                    "stage": "llm_first_text_chunk",
                                    "session_id": session_id,
                                    "total_ms": round((time.perf_counter() - turn_started_at) * 1000, 1),
                                },
                            )
                        yield ChatEvent(
                            type="text_chunk",
                            content=event.content,
                            metadata={"response_id": response_id},
                        )
                elif isinstance(event, FunctionCallResponse):
                    tool_used = True
                    tool_calls_seen.add(event.function_name)
                    # Track this tool call
                    pending_tool_calls[event.tool_call_id] = event.function_name
                    tool_call_started_at[event.tool_call_id] = time.perf_counter()
                    logger.info(
                        "[voice_latency] %s",
                        {
                            "stage": "tool_call_requested",
                            "session_id": session_id,
                            "tool_name": event.function_name,
                            "total_ms": round((time.perf_counter() - turn_started_at) * 1000, 1),
                        },
                    )

                    # Tool call event
                    yield ChatEvent(
                        type="tool_call",
                        content=event.function_name,
                        metadata={
                            "tool_call_id": event.tool_call_id,
                            "arguments": event.arguments,
                            "response_id": response_id,
                        }
                    )

            # Emit structured tool outputs in conversation order (toolCallId-bound).
            if pending_tool_calls:
                import json

                messages = session.chat_memory.get_messages()
                tool_call_order = list(pending_tool_calls.keys())

                for msg in messages:
                    if not hasattr(msg, "tool_call_id"):
                        continue
                    tool_call_id = msg.tool_call_id
                    if tool_call_id not in pending_tool_calls:
                        continue

                    func_name = pending_tool_calls.pop(tool_call_id)
                    try:
                        result = json.loads(msg.content)
                        if not isinstance(result, dict):
                            continue
                        for structured in tool_result_to_chat_events(
                            func_name,
                            tool_call_id,
                            result,
                            response_id=response_id,
                        ):
                            logger.info(
                                "Emitted %s for tool %s (%s)",
                                structured.type,
                                func_name,
                                tool_call_id,
                            )
                            tool_results_emitted = True
                            yield structured
                    except (json.JSONDecodeError, KeyError, TypeError) as exc:
                        logger.warning(
                            "Failed to parse tool result for %s (%s): %s",
                            func_name,
                            tool_call_id,
                            exc,
                        )

                if pending_tool_calls:
                    logger.warning(
                        "Unmatched tool calls (no ToolMessage): %s order=%s",
                        list(pending_tool_calls.keys()),
                        tool_call_order,
                    )

            # Fallback intro only when the model ran a tool but never said
            # anything to the user. This keeps a short narration on screen
            # instead of a silent recipe carousel under an empty speaker
            # badge. When the model does produce prose we leave it alone
            # (no truncation, no rewriting).
            if tool_used and not any_text_sent and tool_results_emitted:
                if "plan_meal" in tool_calls_seen:
                    intro = "Here’s a meal plan I put together for you."
                elif "get_recipe_details" in tool_calls_seen:
                    intro = "Here are the details for that recipe."
                elif "request_supertab_unlock" in tool_calls_seen:
                    intro = (
                        "Getting My Tab checkout going — if the sheet doesn’t pop up, "
                        "tap **Put it on my Tab** on this recipe."
                    )
                elif "create_shopping_list" in tool_calls_seen:
                    intro = "Here’s your shopping list."
                else:
                    intro = "Here are some great options for you."
                yield ChatEvent(type="text_chunk", content=intro)

            # Signal completion
            logger.info(
                "[voice_latency] %s",
                {
                    "stage": "turn_complete",
                    "session_id": session_id,
                    "total_ms": round((time.perf_counter() - turn_started_at) * 1000, 1),
                },
            )
            yield ChatEvent(type="done", content="", metadata={"response_id": response_id})

        except Exception as e:
            logger.error(f"Error processing chat message: {e}", exc_info=True)
            yield ChatEvent(
                type="error",
                content=str(e),
            )

    async def chat_sync(
        self,
        message: str,
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Process a chat message and return complete response.

        Non-streaming version for simpler use cases.

        Args:
            message: User's message
            session_id: Session identifier

        Returns:
            Dict with response text and any tool calls made
        """
        full_response = ""
        tool_calls = []

        async for event in self.chat(message, session_id):
            if event.type == "text_chunk":
                full_response += event.content
            elif event.type == "tool_call":
                tool_calls.append({
                    "function": event.content,
                    "arguments": event.metadata.get("arguments") if event.metadata else None,
                })
            elif event.type == "error":
                return {
                    "error": event.content,
                    "response": None,
                    "tool_calls": tool_calls,
                }

        return {
            "response": full_response,
            "tool_calls": tool_calls,
        }


# Singleton instance (created on first use)
_chat_agent: Optional[DiscoveryChatAgent] = None


def get_chat_agent(search_agent) -> DiscoveryChatAgent:
    """
    Get or create the singleton chat agent instance.

    Args:
        search_agent: RecipeSearchAgent instance

    Returns:
        DiscoveryChatAgent singleton
    """
    global _chat_agent

    if _chat_agent is None:
        _chat_agent = DiscoveryChatAgent(search_agent=search_agent)

    return _chat_agent


def reset_chat_agent() -> None:
    """Reset the singleton chat agent (useful for testing)."""
    global _chat_agent
    _chat_agent = None
