"""Unit tests for DeepgramSTTService option construction.

Regression coverage for the production incident where utterance_end_ms=900
caused Deepgram to reject the live WebSocket with HTTP 400.
"""

import pytest

from ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService


def _service(**kwargs):
    return DeepgramSTTService(api_key="test-key", **kwargs)


def test_utterance_end_ms_below_minimum_is_clamped():
    service = _service(utterance_end_ms=900)
    assert service.options["utterance_end_ms"] == DeepgramSTTService.MIN_UTTERANCE_END_MS


def test_utterance_end_ms_at_minimum_is_preserved():
    service = _service(utterance_end_ms=1000)
    assert service.options["utterance_end_ms"] == 1000


def test_utterance_end_ms_above_minimum_is_preserved():
    service = _service(utterance_end_ms=1500)
    assert service.options["utterance_end_ms"] == 1500


def test_string_utterance_end_ms_is_coerced_and_clamped():
    service = _service(utterance_end_ms="800")
    assert service.options["utterance_end_ms"] == DeepgramSTTService.MIN_UTTERANCE_END_MS


@pytest.mark.parametrize("falsy", [0, None])
def test_falsy_utterance_end_ms_is_omitted(falsy):
    service = _service(utterance_end_ms=falsy)
    assert "utterance_end_ms" not in service.options
