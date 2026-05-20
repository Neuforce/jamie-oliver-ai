"""
Voice assistant wrapper that enriches LLM text with step-scoped ingredient quantities before TTS.
"""

from __future__ import annotations

import uuid

from ccai.core.logger import configure_logger
from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant

from src.guardrails import evaluate_message, reset_gate_blocked, set_gate_blocked
from src.guardrails.config import get_guardrails_settings
from src.services.tts_ingredient_enrichment import enrich_assistant_text_for_tts

logger = configure_logger(__name__)


class CookingVoiceAssistant(SimpleVoiceAssistant):
    """Same as SimpleVoiceAssistant, with deterministic quantity injection before synthesis."""

    async def brain_process(self, transcription: str, is_system_message: bool = False):  # type: ignore[override]
        """
        Run NeuGate on user transcript before invoking the brain.
        Never adds jailbroken user text to chat memory when blocked (super not called).
        """
        if not is_system_message and (transcription or "").strip():
            cid = str(uuid.uuid4())
            gate = await evaluate_message(transcription, correlation_id=cid)
            if gate.blocked:
                set_gate_blocked(True)
                pivot = (gate.response_text or "").strip() or (
                    "Let's keep it in the kitchen — what do you fancy cooking?"
                )
                logger.info(
                    "Voice query gate blocked source=%s category=%s cid=%s",
                    gate.source,
                    gate.category,
                    cid,
                )
                await self.synth_and_send(pivot)
                reset_gate_blocked()
                return pivot
            set_gate_blocked(False)

        return await super().brain_process(transcription, is_system_message)

    async def synth_and_send(self, text: str):
        try:
            enriched = enrich_assistant_text_for_tts(text)
        except Exception as exc:
            logger.error("Unexpected error in enrich_assistant_text_for_tts: %s", exc, exc_info=True)
            enriched = text
        if not (enriched or "").strip():
            enriched = text

        # FR-5: optional NeuGate pass on assistant text before TTS (high-risk channel).
        settings = get_guardrails_settings()
        to_speak = enriched
        if (
            settings.neugate_enabled
            and settings.neugate_output_moderation_enabled
            and (to_speak or "").strip()
            and len(to_speak.strip()) >= settings.neugate_output_moderation_min_chars
        ):
            cid = str(uuid.uuid4())
            out_gate = await evaluate_message(to_speak, correlation_id=f"tts-out-{cid}")
            if out_gate.blocked:
                pivot = (out_gate.response_text or "").strip() or (
                    "Let's keep it in the kitchen — what do you fancy cooking?"
                )
                logger.info(
                    "Voice output gate blocked source=%s category=%s cid=%s",
                    out_gate.source,
                    out_gate.category,
                    cid,
                )
                to_speak = pivot

        await super().synth_and_send(to_speak)
