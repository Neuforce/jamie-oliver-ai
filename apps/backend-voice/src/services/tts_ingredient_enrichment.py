"""
Apply step-scoped ingredient quantity enrichment to assistant text before TTS (cooking mode only).
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from ccai.core import context_variables
from ccai.core.logger import configure_logger

from src.recipe_engine.ingredient_say_enrichment import enrich_say_with_ingredients
from src.recipe_engine.step_ingredient_resolver import resolve_step_ingredients

logger = configure_logger(__name__)


def _get_active_step_id(state: Dict[str, Any]) -> Optional[str]:
    """First step with status active or waiting_ack (user's current step)."""
    steps = state.get("steps") or {}
    for step_id, step_data in steps.items():
        status = (step_data or {}).get("status")
        if status in ("active", "waiting_ack"):
            return str(step_id)
    return None


def _find_step_dict(payload: Dict[str, Any], step_id: str) -> Optional[Dict[str, Any]]:
    for step in payload.get("steps") or []:
        if isinstance(step, dict) and step.get("id") == step_id:
            return step
    return None


def enrich_assistant_text_for_tts(text: str) -> str:
    """
    If cooking session has an active step and resolvable ingredients, enrich quantities.

    When the step ingredient subset is empty, returns text unchanged (no fallback to full list).

    Never raises: failures fall back to the original string so TTS always runs.
    """
    if not (text or "").strip():
        return text

    try:
        voice_mode = context_variables.get("voice_mode")
        if voice_mode != "cooking":
            return text

        session_id = context_variables.get("session_id")
        if not session_id:
            return text

        # Lazy import avoids pulling Supabase/session stack unless we are in cooking mode with a session.
        from src.services.session_service import session_service

        engine = session_service.get_engine(session_id)
        if not engine:
            return text

        payload = session_service.get_session_recipe_payload(session_id)
        if not payload:
            return text

        state = engine.get_state()
        step_id = _get_active_step_id(state)
        if not step_id:
            return text

        step_dict = _find_step_dict(payload, step_id)
        if not step_dict:
            return text

        ingredients = payload.get("ingredients") or []
        subset = resolve_step_ingredients(step_dict, ingredients)
        if not subset:
            return text

        return enrich_say_with_ingredients(text, subset)
    except Exception as exc:
        logger.warning(
            "TTS ingredient enrichment skipped (using original text): %s",
            exc,
            exc_info=True,
        )
        return text
