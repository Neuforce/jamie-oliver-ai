"""
Langfuse tracing integration for CCAI voice assistant system.
Provides comprehensive observability for conversations, LLM calls, function executions,
and speech processing operations.
"""

import os
import time
import asyncio
import functools
from typing import Dict, Any, Optional, List, AsyncGenerator, Union
from langfuse import Langfuse, observe, get_client
from ccai.core import context_variables
from ccai.core.logger import configure_logger

logger = configure_logger(__name__)

class CCLangfuseTracer:
    """
    Central tracing manager for CCAI voice assistant system.
    Handles conversation-level traces, user session tracking, and component-specific observations.
    """
    
    def __init__(self):
        """Initialize Langfuse client with configuration from environment variables."""
        self.client = None
        
        # Try to get environment variables first
        secret_key = os.getenv("LANGFUSE_SECRET_KEY")
        public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
        host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
        
        if not secret_key or not public_key:
            logger.warning("Langfuse credentials not found in environment variables. Tracing disabled.")
            return
            
        try:
            # Initialize Langfuse client directly
            self.client = Langfuse(
                secret_key=secret_key,
                public_key=public_key,
                host=host
            )
            logger.info(f"Langfuse tracing initialized successfully with host: {host}")
        except Exception as e:
            logger.error(f"Failed to initialize Langfuse client: {e}")
            self.client = None
    
    def start_conversation_trace(
        self, 
        call_sid: str, 
        phone_number: Optional[str] = None,
        agent_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Start a new conversation context for tracing.
        In Langfuse v3, traces are created automatically by @observe decorators.
        This function just sets up the context for proper session linking.
        
        Args:
            call_sid: Twilio call SID for unique call identification
            phone_number: Customer phone number (if available)
            agent_name: Name of the AI agent/assistant
            metadata: Additional metadata for the trace
        
        Returns:
            session_id: The session ID for grouping traces
        """
        try:
            trace_metadata = {
                "call_sid": call_sid,
                "system": "ccai_voice_assistant",
                "channel": "voice",
                **(metadata or {})
            }
            
            if phone_number:
                trace_metadata["phone_number"] = phone_number
            if agent_name:
                trace_metadata["agent_name"] = agent_name
            
            # Store context for @observe decorators to use
            context_variables.set("session_id", call_sid)
            context_variables.set("user_id", phone_number or call_sid)
            context_variables.set("trace_metadata", trace_metadata)
            
            logger.info(f"✅ Started conversation session: {call_sid} for user: {phone_number or call_sid}")
            return call_sid
            
        except Exception as e:
            logger.error(f"❌ Failed to start conversation session for {call_sid}: {e}", exc_info=True)
            return None
    
    def get_current_trace_context(self) -> Dict[str, Any]:
        """Get current trace context information."""
        return {
            "trace_id": context_variables.get("trace_id"),
            "session_id": context_variables.get("session_id"),
            "user_id": context_variables.get("user_id"),
        }
    
    def update_conversation_trace(
        self, 
        input_text: Optional[str] = None,
        output_text: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Update the main conversation trace with input/output."""
        if not self.client:
            return
            
        try:
            trace_id = context_variables.get("trace_id")
            if not trace_id:
                return
            
            # Get existing conversation data to append to it
            existing_input = context_variables.get("conversation_input", "")
            existing_output = context_variables.get("conversation_output", "")
            
            # Build conversation history
            if input_text:
                new_input = f"{existing_input}\nUser: {input_text}".strip()
                context_variables.set("conversation_input", new_input)
            
            if output_text:
                new_output = f"{existing_output}\nAssistant: {output_text}".strip()
                context_variables.set("conversation_output", new_output)
            
            # Update the trace with the full conversation so far
            update_data = {}
            if input_text or output_text:
                full_conversation = ""
                if context_variables.get("conversation_input"):
                    full_conversation += context_variables.get("conversation_input")
                if context_variables.get("conversation_output"):
                    full_conversation += "\n" + context_variables.get("conversation_output")
                
                update_data["input"] = full_conversation.strip()
            
            if metadata:
                existing_metadata = context_variables.get("trace_metadata", {})
                existing_metadata.update(metadata)
                context_variables.set("trace_metadata", existing_metadata)
                update_data["metadata"] = existing_metadata
                
            if update_data:
                self.client.trace(id=trace_id, **update_data)
                logger.debug(f"Updated conversation trace {trace_id} with new dialogue")
                
        except Exception as e:
            logger.error(f"Failed to update conversation trace: {e}")
    
    def end_conversation_trace(self, metadata: Optional[Dict[str, Any]] = None):
        """End the current conversation trace."""
        if not self.client:
            return
            
        try:
            trace_id = context_variables.get("trace_id")
            if trace_id:
                # Add final metadata if provided
                final_metadata = context_variables.get("trace_metadata", {})
                if metadata:
                    final_metadata.update(metadata)
                
                # Get final conversation for output
                full_conversation = ""
                if context_variables.get("conversation_input"):
                    full_conversation += context_variables.get("conversation_input")
                if context_variables.get("conversation_output"):
                    full_conversation += "\n" + context_variables.get("conversation_output")
                
                # Final trace update
                if full_conversation or final_metadata:
                    update_data = {}
                    if full_conversation:
                        update_data["output"] = full_conversation.strip()
                    if final_metadata:
                        update_data["metadata"] = final_metadata
                    
                    self.client.trace(id=trace_id, **update_data)
            
            # Clear context variables
            context_variables.clear()
            logger.info(f"Ended conversation trace: {trace_id}")
            
        except Exception as e:
            logger.error(f"Failed to end conversation trace: {e}")

# Global tracer instance
tracer = CCLangfuseTracer()

def trace_conversation_start(
    call_sid: str, 
    phone_number: Optional[str] = None,
    agent_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """Convenience function to start conversation tracing."""
    return tracer.start_conversation_trace(call_sid, phone_number, agent_name, metadata)

def trace_conversation_end(metadata: Optional[Dict[str, Any]] = None):
    """Convenience function to end conversation tracing."""
    tracer.end_conversation_trace(metadata)

def observe_voice_assistant(name: str = "voice_assistant_operation"):
    """
    Decorator for voice assistant operations using the Langfuse @observe decorator.
    """
    return observe(name=name)

def observe_llm_generation(
    model: str,
    provider: str = "unknown",
    input_cost_per_token: Optional[float] = None,
    output_cost_per_token: Optional[float] = None
):
    """
    Decorator specifically for LLM generation calls using Langfuse @observe.
    """
    return observe(name=f"llm_generation_{provider}")

def observe_function_call(function_name: str):
    """
    Decorator for function/tool calls using Langfuse @observe.
    """
    return observe(name=f"function_call_{function_name}")

def observe_speech_processing(operation_type: str, provider: str = "unknown"):
    """
    Decorator for speech processing operations using Langfuse @observe.
    """
    return observe(name=f"speech_{operation_type}_{provider}")

def flush_traces():
    """Flush any pending traces to Langfuse."""
    if tracer.client:
        try:
            tracer.client.flush()
            logger.debug("Flushed traces to Langfuse")
        except Exception as e:
            logger.error(f"Failed to flush traces: {e}")

@observe(name="connection_test")
def test_langfuse_connection():
    """Test function to verify Langfuse connection works with @observe decorator."""
    try:
        # Set test context
        context_variables.set("session_id", "test_session")
        context_variables.set("user_id", "test_user")
        
        # This function will automatically create a trace via @observe
        logger.info("Testing Langfuse connection with @observe decorator")
        
        # Flush to ensure data is sent
        if tracer.client:
            tracer.client.flush()
        
        logger.info("✅ Langfuse connection test completed successfully")
        return True
    except Exception as e:
        logger.error(f"❌ Langfuse connection test failed: {e}")
        return False
