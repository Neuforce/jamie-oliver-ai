"""Session management for multiple concurrent recipe sessions."""

import asyncio
from typing import Dict, Optional, Callable

from ccai.core.logger import configure_logger
from .models import Recipe
from .engine import RecipeEngine

logger = configure_logger(__name__)


class RecipeSessionManager:
    """Manages multiple recipe sessions."""
    
    def __init__(self):
        """Initialize the session manager."""
        self._sessions: Dict[str, RecipeEngine] = {}
    
    def create_session(
        self,
        session_id: str,
        recipe: Recipe,
        event_callback: Optional[Callable] = None
    ) -> RecipeEngine:
        """
        Create a new recipe session.
        
        Args:
            session_id: Unique identifier for the session
            recipe: Recipe to execute
            event_callback: Optional callback for recipe events
            
        Returns:
            New RecipeEngine instance
        """
        if session_id in self._sessions:
            logger.warning(f"Session {session_id} already exists, stopping old session")
            asyncio.create_task(self._sessions[session_id].stop())
        
        engine = RecipeEngine(recipe, event_callback)
        self._sessions[session_id] = engine
        logger.info(f"Created recipe session: {session_id}")
        return engine
    
    def get_session(self, session_id: str) -> Optional[RecipeEngine]:
        """
        Get an existing recipe session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            RecipeEngine instance or None if not found
        """
        return self._sessions.get(session_id)
    
    async def stop_session(self, session_id: str) -> None:
        """
        Stop and remove a recipe session.
        
        Args:
            session_id: Session identifier
        """
        if session_id in self._sessions:
            await self._sessions[session_id].stop()
            del self._sessions[session_id]
            logger.info(f"Stopped recipe session: {session_id}")
    
    async def stop_all(self) -> None:
        """Stop all sessions."""
        for session_id in list(self._sessions.keys()):
            await self.stop_session(session_id)
        logger.info("Stopped all recipe sessions")

