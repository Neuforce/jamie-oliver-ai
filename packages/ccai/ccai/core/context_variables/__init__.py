# ccai/core/context_variables/__init__.py
from contextvars import ContextVar
from typing import Dict, Any

_context_data: ContextVar[Dict[str, Any]] = ContextVar('context_data', default={})

def get(key: str, default=None):
    """Get a context variable"""
    return _context_data.get().get(key, default)

def set(key: str, value: Any):
    """Set a context variable"""
    current = _context_data.get().copy()
    current[key] = value
    _context_data.set(current)

def get_all() -> Dict[str, Any]:
    """Get all context variables"""
    return _context_data.get()

def clear():
    """Clear all context variables"""
    _context_data.set({})