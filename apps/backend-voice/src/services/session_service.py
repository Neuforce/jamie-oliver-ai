"""Session management service."""

from typing import Dict, Callable, Optional, Any

from ccai.core.logger import configure_logger
from src.recipe_engine import RecipeSessionManager

logger = configure_logger(__name__)


class SessionService:
    """Manages sessions and their associated callbacks."""
    
    def __init__(self):
        """Initialize the session service."""
        self._session_manager = RecipeSessionManager()
        self._event_callbacks: Dict[str, Callable] = {}
        self._session_recipes: Dict[str, str] = {}
        self._session_recipe_payloads: Dict[str, Dict[str, Any]] = {}
        self._assistants: Dict[str, Any] = {}
        self._output_channels: Dict[str, Any] = {}
        self._kitchen_timers: Dict[str, Dict[str, Any]] = {}
    
    def get_session_manager(self) -> RecipeSessionManager:
        """Get the recipe session manager."""
        return self._session_manager
    
    def register_event_callback(self, session_id: str, callback: Callable) -> None:
        """
        Register an event callback for a session.
        
        Args:
            session_id: Session identifier
            callback: Event callback function
        """
        self._event_callbacks[session_id] = callback
        logger.info(f"Registered event callback for session: {session_id}")
    
    def get_event_callback(self, session_id: str) -> Optional[Callable]:
        """
        Get the event callback for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Event callback function or None
        """
        return self._event_callbacks.get(session_id)
    
    def set_session_recipe(self, session_id: str, recipe_id: str) -> None:
        """Track which recipe is associated with a session."""
        if recipe_id:
            self._session_recipes[session_id] = recipe_id
            logger.info(f"Session {session_id} set to recipe {recipe_id}")
        elif session_id in self._session_recipes:
            del self._session_recipes[session_id]
    
    def get_session_recipe(self, session_id: str) -> Optional[str]:
        """Get the recipe id currently linked to a session."""
        return self._session_recipes.get(session_id)

    def set_session_recipe_payload(self, session_id: str, payload: Dict[str, Any] | None) -> None:
        """Store the raw recipe payload for a session."""
        if payload:
            self._session_recipe_payloads[session_id] = payload
        elif session_id in self._session_recipe_payloads:
            del self._session_recipe_payloads[session_id]

    def get_session_recipe_payload(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve the raw recipe payload for a session."""
        return self._session_recipe_payloads.get(session_id)
    
    def get_engine(self, session_id: str):
        """
        Get the recipe engine for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            RecipeEngine instance or None
        """
        return self._session_manager.get_session(session_id)
    
    def register_assistant(self, session_id: str, assistant: Any) -> None:
        """
        Register a voice assistant instance for a session.
        
        Args:
            session_id: Session identifier
            assistant: Voice assistant instance
        """
        self._assistants[session_id] = assistant
        logger.info(f"Registered assistant for session: {session_id}")
    
    def get_assistant(self, session_id: str) -> Optional[Any]:
        """
        Get the voice assistant instance for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Voice assistant instance or None
        """
        return self._assistants.get(session_id)

    def register_output_channel(self, session_id: str, output_channel: Any) -> None:
        """Store the output channel so tools can send UI events."""
        self._output_channels[session_id] = output_channel
        logger.info(f"Registered output channel for session: {session_id}")

    def get_output_channel(self, session_id: str) -> Optional[Any]:
        """Retrieve the output channel for a session."""
        return self._output_channels.get(session_id)

    async def send_control_event(self, session_id: str, action: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Send a control event (e.g., timer actions) to the frontend."""
        logger.info(f"🕐 [CONTROL] send_control_event: session={session_id}, action={action}, data={data}")
        output_channel = self._output_channels.get(session_id)
        if not output_channel:
            logger.error(f"🕐 [CONTROL] No output channel for session {session_id}")
            raise RuntimeError(f"No output channel registered for session {session_id}")

        payload = {"action": action}
        if data:
            payload["data"] = data

        logger.info(f"🕐 [CONTROL] Sending event via output channel: {payload}")
        await output_channel.send_event("control", payload)
        logger.info(f"🕐 [CONTROL] Event sent successfully")

    def set_kitchen_timer_state(self, session_id: str, *, running: bool, seconds: Optional[int] = None) -> None:
        """Persist current kitchen timer state so tools can reason about it."""
        state = self._kitchen_timers.setdefault(session_id, {})
        state["running"] = running
        if seconds is not None:
            state["seconds"] = seconds

    def get_kitchen_timer_state(self, session_id: str) -> Dict[str, Any]:
        """Return current timer state for a session."""
        return self._kitchen_timers.get(session_id, {"running": False, "seconds": 0})
    
    async def cleanup_session(self, session_id: str) -> None:
        """
        Clean up a session and its resources.
        
        Args:
            session_id: Session identifier
        """
        if session_id in self._event_callbacks:
            del self._event_callbacks[session_id]
        if session_id in self._session_recipes:
            del self._session_recipes[session_id]
        if session_id in self._session_recipe_payloads:
            del self._session_recipe_payloads[session_id]
        if session_id in self._output_channels:
            del self._output_channels[session_id]
        if session_id in self._kitchen_timers:
            del(self._kitchen_timers[session_id])
        if session_id in self._assistants:
            del self._assistants[session_id]
        
        await self._session_manager.stop_session(session_id)
        logger.info(f"Cleaned up session: {session_id}")


# Global session service instance
session_service = SessionService()

