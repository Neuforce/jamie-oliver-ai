"""Unit tests for Deepgram STT transcript segment joining (NEU-643 Finding E)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService, join_transcript_segments


class TestJoinTranscriptSegments:
    def test_joins_with_space(self):
        assert join_transcript_segments("can you tell me", "what you're") == "can you tell me what you're"

    def test_empty_existing_returns_segment(self):
        assert join_transcript_segments("", "hello") == "hello"

    def test_empty_segment_returns_existing(self):
        assert join_transcript_segments("hello", "") == "hello"

    def test_strips_whitespace(self):
        assert join_transcript_segments("  hello  ", "  world  ") == "hello world"


def _result(
    transcript: str,
    *,
    is_final: bool = False,
    speech_final: bool = False,
    confidence: float = 0.95,
) -> SimpleNamespace:
    alt = SimpleNamespace(transcript=transcript, confidence=confidence)
    channel = SimpleNamespace(alternatives=[alt])
    return SimpleNamespace(
        type="Results",
        channel=channel,
        is_final=is_final,
        speech_final=speech_final,
    )


@pytest.fixture
def stt(monkeypatch: pytest.MonkeyPatch) -> DeepgramSTTService:
    monkeypatch.setattr(
        DeepgramSTTService,
        "_initialize_client",
        lambda self, api_key: None,
    )
    return DeepgramSTTService(api_key="test-key")


def test_is_final_chunks_join_with_space(stt: DeepgramSTTService):
    async def run() -> None:
        first = await stt.preprocess_transcription(_result("can you tell me", is_final=True))
        assert first is not None
        assert first.is_final is False
        assert first.content == "can you tell me"

        second = await stt.preprocess_transcription(_result("what you're", is_final=True))
        assert second is not None
        assert second.content == "can you tell me what you're"
        assert stt.buffer == "can you tell me what you're"

    asyncio.run(run())


def test_speech_final_flushes_buffer(stt: DeepgramSTTService):
    async def run() -> None:
        await stt.preprocess_transcription(_result("can you tell me", is_final=True))
        final = await stt.preprocess_transcription(
            _result("seven ways", speech_final=True),
        )
        assert final is not None
        assert final.is_final is True
        assert final.content == "can you tell me seven ways"
        assert stt.buffer == ""

    asyncio.run(run())


def test_generic_live_options_passed_to_deepgram(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        DeepgramSTTService,
        "_initialize_client",
        lambda self, api_key: None,
    )
    service = DeepgramSTTService(
        api_key="test-key",
        model="nova-3",
        punctuate=True,
        numerals=True,
        smart_format=True,
    )
    assert service.options["model"] == "nova-3"
    assert service.options["punctuate"] is True
    assert service.options["numerals"] is True
    assert service.options["smart_format"] is True
