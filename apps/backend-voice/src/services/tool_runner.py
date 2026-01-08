"""Helpers for invoking recipe tools outside of the voice assistant."""

from contextlib import contextmanager
from typing import Awaitable, Callable, Any, Dict

from ccai.core import context_variables


@contextmanager
def recipe_tool_session(session_context: Dict[str, Any] | None = None):
    """
    Context manager to temporarily set context variables while running tools.

    Args:
        session_context: Mapping of context keys/values to inject
    """
    previous_context = dict(context_variables.get_all() or {})
    if session_context:
        for key, value in session_context.items():
            context_variables.set(key, value)
    try:
        yield
    finally:
        context_variables.clear()
        for key, value in previous_context.items():
            context_variables.set(key, value)


async def run_recipe_tool(
    session_id: str,
    tool_fn: Callable[..., Awaitable[Any]],
    **kwargs,
) -> Any:
    """
    Execute a recipe tool with the given session context.

    Args:
        session_id: Active session identifier
        tool_fn: Tool coroutine to invoke (e.g., confirm_step_done)
        **kwargs: Tool keyword arguments

    Returns:
        Result of the tool invocation
    """
    with recipe_tool_session({"session_id": session_id}):
        return await tool_fn(**kwargs)

