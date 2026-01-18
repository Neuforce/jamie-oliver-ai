"""
Chat agent for Jamie Oliver recipe discovery.

Uses CCAI's SimpleBrain for LLM orchestration with tool calling,
and manages chat sessions with persistent memory.
"""

import os
import logging
import asyncio
from typing import Dict, Optional, AsyncGenerator, Any
from dataclasses import dataclass
from datetime import datetime, timedelta

from ccai.core.brain.simple_brain import SimpleBrain
from ccai.core.llm.llm_openai import OpenAILLM
from ccai.core.llm.base import ChunkResponse, FunctionCallResponse
from ccai.core.memory.chat_memory import SimpleChatMemory
from ccai.core.messages.base import UserMessage

from recipe_search_agent.prompts import JAMIE_DISCOVERY_PROMPT
from recipe_search_agent.discovery_tools import (
    discovery_function_manager,
    set_search_agent,
)

logger = logging.getLogger(__name__)


@dataclass
class ChatSession:
    """Represents an active chat session."""
    session_id: str
    chat_memory: SimpleChatMemory
    created_at: datetime
    last_activity: datetime


@dataclass 
class ChatEvent:
    """Event emitted during chat processing."""
    type: str  # "text_chunk", "tool_call", "tool_result", "done", "error"
    content: str
    metadata: Optional[Dict[str, Any]] = None


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
        
        logger.info(f"DiscoveryChatAgent initialized with model={model}")
    
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
            )
            logger.info(f"Created new chat session: {session_id}")
        else:
            # Update last activity
            self._sessions[session_id].last_activity = datetime.now()
        
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
    
    async def chat(
        self,
        message: str,
        session_id: str,
    ) -> AsyncGenerator[ChatEvent, None]:
        """
        Process a chat message and stream responses.
        
        Args:
            message: User's message
            session_id: Session identifier for conversation continuity
            
        Yields:
            ChatEvent objects with response chunks and tool call info
        """
        session = self._get_or_create_session(session_id)
        
        # Create brain with session's memory
        brain = SimpleBrain(
            llm=self._create_llm(),
            chat_memory=session.chat_memory,
            function_manager=discovery_function_manager,
        )
        
        # Create user message
        user_msg = UserMessage(content=message)
        
        logger.info(f"Processing message for session {session_id}: {message[:50]}...")
        
        try:
            # Process message through brain
            async for event in brain.process(user_msg):
                if isinstance(event, ChunkResponse):
                    # Text chunk from LLM
                    yield ChatEvent(
                        type="text_chunk",
                        content=event.content,
                    )
                elif isinstance(event, FunctionCallResponse):
                    # Tool call event
                    yield ChatEvent(
                        type="tool_call",
                        content=event.function_name,
                        metadata={
                            "tool_call_id": event.tool_call_id,
                            "arguments": event.arguments,
                        }
                    )
            
            # Signal completion
            yield ChatEvent(type="done", content="")
            
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
