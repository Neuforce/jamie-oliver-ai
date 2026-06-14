"""Request-scoped commerce context for tool → ask correlation."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

commerce_session_id: ContextVar[Optional[str]] = ContextVar("commerce_session_id", default=None)
commerce_user_id: ContextVar[Optional[str]] = ContextVar("commerce_user_id", default=None)


def set_commerce_context(session_id: Optional[str], user_id: Optional[str] = None) -> None:
    commerce_session_id.set(session_id)
    commerce_user_id.set(user_id)


def get_commerce_session_id() -> Optional[str]:
    return commerce_session_id.get()


def get_commerce_user_id() -> Optional[str]:
    return commerce_user_id.get()
