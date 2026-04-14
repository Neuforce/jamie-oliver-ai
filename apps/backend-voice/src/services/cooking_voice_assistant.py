"""
Voice assistant wrapper that enriches LLM text with step-scoped ingredient quantities before TTS.
"""

from __future__ import annotations

from ccai.core.logger import configure_logger
from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant

from src.services.tts_ingredient_enrichment import enrich_assistant_text_for_tts

logger = configure_logger(__name__)


class CookingVoiceAssistant(SimpleVoiceAssistant):
    """Same as SimpleVoiceAssistant, with deterministic quantity injection before synthesis."""

    async def synth_and_send(self, text: str):
        try:
            enriched = enrich_assistant_text_for_tts(text)
        except Exception as exc:
            logger.error("Unexpected error in enrich_assistant_text_for_tts: %s", exc, exc_info=True)
            enriched = text
        if not (enriched or "").strip():
            enriched = text
        await super().synth_and_send(enriched)
