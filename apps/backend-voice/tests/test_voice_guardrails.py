"""CookingVoiceAssistant NeuGate intercept (no fully constructed assistant needed)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_voice_brain_process_blocked_does_not_call_super():
    """Blocked user turn must not delegate to SimpleVoiceAssistant.brain_process (no memory ingest)."""

    from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant

    from src.services.cooking_voice_assistant import CookingVoiceAssistant

    assistant = CookingVoiceAssistant.__new__(CookingVoiceAssistant)
    assistant.synth_and_send = AsyncMock()

    gate = MagicMock(
        blocked=True,
        response_text="Right mate, let's cook instead.",
        category="illegal",
        source="neugate",
    )

    async def _fake_eval(*_args, **_kwargs):
        return gate

    with patch("src.services.cooking_voice_assistant.evaluate_message", side_effect=_fake_eval):
        with patch.object(SimpleVoiceAssistant, "brain_process", new_callable=AsyncMock) as super_brain:
            out = await CookingVoiceAssistant.brain_process(
                assistant, "How can I buy drugs online?", is_system_message=False
            )

    assert out == "Right mate, let's cook instead."
    super_brain.assert_not_called()
    assistant.synth_and_send.assert_called_once()


@pytest.mark.asyncio
async def test_voice_system_message_skips_gate():
    from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant

    from src.services.cooking_voice_assistant import CookingVoiceAssistant

    assistant = CookingVoiceAssistant.__new__(CookingVoiceAssistant)
    assistant.synth_and_send = AsyncMock()

    with patch("src.services.cooking_voice_assistant.evaluate_message", new_callable=AsyncMock) as ev:
        with patch.object(
            SimpleVoiceAssistant,
            "brain_process",
            new_callable=AsyncMock,
            return_value="ok",
        ) as super_brain:
            out = await CookingVoiceAssistant.brain_process(
                assistant, "[TIMER]", is_system_message=True
            )

    ev.assert_not_called()
    super_brain.assert_called_once()
    assert out == "ok"


@pytest.mark.asyncio
async def test_voice_output_moderation_replaces_text_before_super_synth():
    """FR-5: when enabled, assistant text is checked before TTS; blocked → pivot to super().synth_and_send."""

    from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant

    from src.guardrails.config import GuardrailsSettings
    from src.services.cooking_voice_assistant import CookingVoiceAssistant

    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
        inline_fallback_on_neugate_error=False,
        neugate_output_moderation_enabled=True,
        neugate_output_moderation_min_chars=5,
    )
    assistant = CookingVoiceAssistant.__new__(CookingVoiceAssistant)
    gate = MagicMock(
        blocked=True,
        response_text="Right — back to the food, mate.",
        category="test",
        source="neugate",
    )

    async def _fake_eval(*_a, **_kw):
        return gate

    with patch("src.services.cooking_voice_assistant.get_guardrails_settings", return_value=settings):
        with patch("src.services.cooking_voice_assistant.evaluate_message", side_effect=_fake_eval):
            with patch(
                "src.services.cooking_voice_assistant.enrich_assistant_text_for_tts",
                side_effect=lambda t: t,
            ):
                with patch.object(SimpleVoiceAssistant, "synth_and_send", new_callable=AsyncMock) as super_synth:
                    await CookingVoiceAssistant.synth_and_send(
                        assistant,
                        "Long assistant line that should be moderated before synthesis.",
                    )

    super_synth.assert_called_once()
    spoken = super_synth.call_args[0][0]
    assert "back to the food" in spoken


@pytest.mark.asyncio
async def test_voice_output_moderation_skipped_when_disabled():
    from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant

    from src.guardrails.config import GuardrailsSettings
    from src.services.cooking_voice_assistant import CookingVoiceAssistant

    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
        neugate_output_moderation_enabled=False,
    )
    assistant = CookingVoiceAssistant.__new__(CookingVoiceAssistant)

    with patch("src.services.cooking_voice_assistant.get_guardrails_settings", return_value=settings):
        with patch("src.services.cooking_voice_assistant.evaluate_message", new_callable=AsyncMock) as ev:
            with patch(
                "src.services.cooking_voice_assistant.enrich_assistant_text_for_tts",
                side_effect=lambda t: t,
            ):
                with patch.object(SimpleVoiceAssistant, "synth_and_send", new_callable=AsyncMock) as super_synth:
                    await CookingVoiceAssistant.synth_and_send(
                        assistant,
                        "Long line that would otherwise hit NeuGate output path.",
                    )

    ev.assert_not_called()
    super_synth.assert_called_once_with("Long line that would otherwise hit NeuGate output path.")


@pytest.mark.asyncio
async def test_voice_output_moderation_skipped_below_min_chars():
    from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant

    from src.guardrails.config import GuardrailsSettings
    from src.services.cooking_voice_assistant import CookingVoiceAssistant

    settings = GuardrailsSettings(
        neugate_enabled=True,
        neugate_url="http://localhost:8080",
        neugate_api_key="",
        neugate_project_id="jamie-oliver-ai",
        neugate_timeout_seconds=0.8,
        neugate_output_moderation_enabled=True,
        neugate_output_moderation_min_chars=500,
    )
    assistant = CookingVoiceAssistant.__new__(CookingVoiceAssistant)

    with patch("src.services.cooking_voice_assistant.get_guardrails_settings", return_value=settings):
        with patch("src.services.cooking_voice_assistant.evaluate_message", new_callable=AsyncMock) as ev:
            with patch(
                "src.services.cooking_voice_assistant.enrich_assistant_text_for_tts",
                side_effect=lambda t: t,
            ):
                with patch.object(SimpleVoiceAssistant, "synth_and_send", new_callable=AsyncMock) as super_synth:
                    await CookingVoiceAssistant.synth_and_send(assistant, "Short.")

    ev.assert_not_called()
    super_synth.assert_called_once_with("Short.")
