"""Per-request gate state for tool guards."""

from __future__ import annotations

from contextvars import ContextVar

_gate_blocked: ContextVar[bool] = ContextVar("jamie_gate_blocked", default=False)


def set_gate_blocked(blocked: bool) -> None:
    _gate_blocked.set(blocked)


def is_gate_blocked() -> bool:
    return _gate_blocked.get()


def reset_gate_blocked() -> None:
    _gate_blocked.set(False)
