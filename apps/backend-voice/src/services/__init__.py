"""Services for the Jamie Oliver AI Backend.

Imports are lazy (PEP 562) so lightweight submodules (e.g. tts_ingredient_enrichment)
can load without pulling AssistantFactory, Supabase, or the full session stack.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .assistant_factory import AssistantFactory
    from .event_handler import RecipeEventHandler
    from .session_service import SessionService, session_service

__all__ = [
    "RecipeEventHandler",
    "AssistantFactory",
    "SessionService",
    "session_service",
]


def __getattr__(name: str) -> Any:
    if name == "RecipeEventHandler":
        from .event_handler import RecipeEventHandler

        return RecipeEventHandler
    if name == "AssistantFactory":
        from .assistant_factory import AssistantFactory

        return AssistantFactory
    if name == "SessionService":
        from .session_service import SessionService

        return SessionService
    if name == "session_service":
        from .session_service import session_service

        return session_service
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
