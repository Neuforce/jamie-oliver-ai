"""Configuration module for Jamie Oliver AI Backend."""

from .settings import settings
from .prompts import JAMIE_OLIVER_SYSTEM_PROMPT, RECIPE_CONTEXT_TEMPLATE

__all__ = ["settings", "JAMIE_OLIVER_SYSTEM_PROMPT", "RECIPE_CONTEXT_TEMPLATE"]

