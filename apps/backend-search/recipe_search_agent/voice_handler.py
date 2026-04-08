"""
Voice handler for recipe discovery chat agent.

Architecture
════════════════════════════════════════════════════════════════════
Browser ── PCM mic audio ──► WebSocketAudioInterface (api.py)
                                         │ audio stream generator
                               DeepgramSTTService.transcribe()
                                         │ Transcription
           any non-empty → interrupt()   │ is_final only → _brain_queue
                                         ▼
                               _brain_task (_process_brain_queue)
                                 DiscoveryChatAgent.chat()
                             sentence-by-sentence → _audio_queue
                                         ▼
                               _output_task (_process_output_queue)
                               ElevenLabsTTS.synthesize() → send_audio()
                               checks interrupt_requested on every chunk
                                         ▼
Browser ◄── PCM TTS audio ◄── WebSocketAudioOutput

Interrupt invariant (mirrors SimpleVoiceAssistant exactly):
  Any non-empty transcription → interrupt() (set flag, drain queue, clear output)
  Only is_final=True transcripts   → put to _brain_queue for processing
  interrupt() atomically: set interrupt_requested, drain _audio_queue,
              call output_channel.clear(), set is_speaking=False

Memory on interrupt:
  If interrupted while brain is mid-LLM-stream, the partial response text is
  committed to chat_memory via chat_agent.commit_partial_response() so the
  next LLM call doesn't see an orphaned user message and repeat the answer.
"""

import asyncio
import logging
import os
import re
from typing import Any, Optional, Tuple

from ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService
from ccai.core.text_to_speech.elevenlabs_tts import ElevenLabsTextToSpeech
from ccai.core.audio_interface.audio_output.websocket_audio_output import WebSocketAudioOutput
from ccai.core.logger import configure_logger

from recipe_search_agent.chat_agent import DiscoveryChatAgent

logger = configure_logger(__name__)


# ── configuration ─────────────────────────────────────────────────────────────

class VoiceConfig:
    """Configuration for voice services (all values from environment variables)."""

    def __init__(
        self,
        deepgram_api_key: str,
        elevenlabs_api_key: str,
        elevenlabs_voice_id: str,
        elevenlabs_model_id: str,
        sample_rate: int = 16000,
        tts_output_format: str = "pcm_16000",
        tts_speed: float = 1.0,
        stt_language: str = "en-US",
        stt_interim_results: bool = True,
        stt_utterance_end_ms: int = 1500,
        stt_endpointing_ms: int = 700,
    ):
        self.deepgram_api_key = deepgram_api_key
        self.elevenlabs_api_key = elevenlabs_api_key
        self.elevenlabs_voice_id = elevenlabs_voice_id
        self.elevenlabs_model_id = elevenlabs_model_id
        self.sample_rate = sample_rate
        self.tts_output_format = tts_output_format
        self.tts_speed = tts_speed
        self.stt_language = stt_language
        self.stt_interim_results = stt_interim_results
        self.stt_utterance_end_ms = stt_utterance_end_ms
        self.stt_endpointing_ms = stt_endpointing_ms


def get_voice_config() -> VoiceConfig:
    """Build VoiceConfig strictly from environment variables."""
    deepgram_key     = os.getenv("DEEPGRAM_API_KEY")
    elevenlabs_key   = os.getenv("ELEVENLABS_API_KEY")
    elevenlabs_voice = os.getenv("ELEVENLABS_VOICE_ID")
    elevenlabs_model = os.getenv("ELEVENLABS_MODEL_ID")

    if not deepgram_key:
        raise ValueError("DEEPGRAM_API_KEY is required for voice chat")
    if not elevenlabs_key:
        raise ValueError("ELEVENLABS_API_KEY is required for voice chat")
    if not elevenlabs_voice:
        raise ValueError("ELEVENLABS_VOICE_ID is required for voice chat")
    if not elevenlabs_model:
        raise ValueError("ELEVENLABS_MODEL_ID is required for voice chat")

    return VoiceConfig(
        deepgram_api_key=deepgram_key,
        elevenlabs_api_key=elevenlabs_key,
        elevenlabs_voice_id=elevenlabs_voice,
        elevenlabs_model_id=elevenlabs_model,
        sample_rate=int(os.getenv("VOICE_SAMPLE_RATE", "16000")),
        tts_speed=float(os.getenv("TTS_SPEED", "1.0")),
        stt_language=os.getenv("STT_LANGUAGE", "en-US"),
        stt_interim_results=os.getenv("STT_INTERIM_RESULTS", "true").strip().lower() != "false",
        stt_utterance_end_ms=int(os.getenv("STT_UTTERANCE_END_MS", "1500")),
        stt_endpointing_ms=int(os.getenv("STT_ENDPOINTING_MS", "700")),
    )


# ── text helpers (module-level, no state) ─────────────────────────────────────

def _contains_punctuation(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Check if the text contains a natural sentence boundary and split there.

    Mirrors SimpleVoiceAssistant.contains_punctuation() exactly.

    Returns (sentence_up_to_boundary, remainder) or (None, None) if the
    buffer is too short to flush yet.
    """
    pattern = r"([.,;:?!])([ \n]|$)"
    matches = list(re.finditer(pattern, text))
    if matches and len(text.split()) > 8:
        last_match = matches[-1]
        end_index = last_match.end()
        sentence = text[:end_index].strip()
        remainder = text[end_index:].strip()
        return sentence, remainder if remainder else None
    return None, None


def _clean_for_tts(text: str) -> str:
    """Strip markdown so it doesn't get read aloud verbatim."""
    if not text:
        return ""
    t = text.replace("**", "").replace("*", "").replace("`", "")
    t = re.sub(r"(?m)^\s*[-•]\s*", "", t)
    t = re.sub(r"(?m)^\s*#+\s*", "", t)
    return re.sub(r"\s+", " ", t).strip()


# ── DiscoveryVoiceHandler ─────────────────────────────────────────────────────

class DiscoveryVoiceHandler:
    """
    Voice handler for the discovery chat agent.

    Mirrors SimpleVoiceAssistant architecture exactly:
    - Two decoupled queues: _brain_queue and _audio_queue
    - STT loop: any non-empty content → interrupt(); is_final → _brain_queue
    - Brain task: DiscoveryChatAgent.chat() → sentence chunks → _audio_queue
    - Output task: TTS.synthesize() → output_channel.send_audio()
    - interrupt() atomically clears both queues and stops all output

    This class does NOT manage the WebSocket handshake — that is done by
    WebSocketAudioInterface in api.py before this handler is created.
    """

    def __init__(
        self,
        input_channel,
        output_channel: WebSocketAudioOutput,
        control_queue: "asyncio.Queue[str]",
        chat_agent: DiscoveryChatAgent,
        config: VoiceConfig,
        session_id: str = "",
    ):
        self.input_channel  = input_channel
        self.output_channel = output_channel
        self.control_queue  = control_queue
        self.chat_agent     = chat_agent
        self.config         = config
        self.session_id     = session_id or f"voice_{id(self)}"

        # ── queues (mirrors SimpleVoiceAssistant) ──────────────────────────
        self._brain_queue: asyncio.Queue[str] = asyncio.Queue()
        self._audio_queue: asyncio.Queue      = asyncio.Queue()

        # ── state ──────────────────────────────────────────────────────────
        self.interrupt_requested    = asyncio.Event()
        self.is_speaking            = False
        self.brain_processing       = False
        self._is_running            = False
        self._response_counter      = 0
        self._current_response_id: Optional[str] = None

        # ── voice services ─────────────────────────────────────────────────
        self.stt = DeepgramSTTService(
            api_key=config.deepgram_api_key,
            sample_rate=config.sample_rate,
            language=config.stt_language,
            interim_results=config.stt_interim_results,
            utterance_end_ms=config.stt_utterance_end_ms,
            endpointing=config.stt_endpointing_ms,
        )
        self.tts = ElevenLabsTextToSpeech(
            api_key=config.elevenlabs_api_key,
            voice_id=config.elevenlabs_voice_id,
            model_id=config.elevenlabs_model_id,
            speed=config.tts_speed,
            similarity_boost=0.8,
            stability=0.5,
            output_format=config.tts_output_format,
        )

    # ── response ID helpers ───────────────────────────────────────────────────

    def _next_response_id(self) -> str:
        self._response_counter += 1
        return f"{self.session_id}:r{self._response_counter}"

    # ── send helpers ──────────────────────────────────────────────────────────

    async def _send(self, event: str, data: Any = None, response_id: Optional[str] = None) -> None:
        """Send a JSON message to the browser via the output channel's WebSocket."""
        msg: dict = {"event": event}
        if data is not None:
            msg["data"] = data
        if response_id is not None:
            msg["responseId"] = response_id
        try:
            await self.output_channel.websocket.send_json(msg)
        except Exception as exc:
            logger.debug("_send %s failed: %s", event, exc)

    async def _send_audio(self, chunk: bytes, response_id: Optional[str] = None) -> None:
        """Send a raw PCM audio chunk, preserving the active responseId for the frontend."""
        import base64 as _b64
        msg: dict = {
            "event": "audio",
            "data": _b64.b64encode(chunk).decode("utf-8"),
        }
        if response_id is not None:
            msg["responseId"] = response_id
        try:
            await self.output_channel.websocket.send_json(msg)
        except Exception as exc:
            logger.debug("_send_audio failed: %s", exc)

    # ── interrupt (mirrors SimpleVoiceAssistant.interrupt() exactly) ──────────

    def _clear_audio_queue(self) -> None:
        """Drain all pending items from the audio output queue."""
        while not self._audio_queue.empty():
            try:
                self._audio_queue.get_nowait()
                self._audio_queue.task_done()
            except asyncio.QueueEmpty:
                break

    async def interrupt(self, reason: str = "client") -> None:
        """
        Atomically stop all output and signal brain processing to halt.

        Sets interrupt_requested so both the brain loop and the TTS loop
        check it and exit cleanly on the next iteration.
        """
        logger.info("Interrupt requested: %s", reason)
        self.interrupt_requested.set()
        await self.output_channel.clear()
        self._clear_audio_queue()
        self.is_speaking = False
        await self._send("interrupted", {"reason": reason})

    # ── synth_and_send ────────────────────────────────────────────────────────

    async def synth_and_send(self, text: str) -> None:
        """Queue text for TTS synthesis (non-blocking, mirrors SimpleVoiceAssistant).

        The current response ID is embedded so the output task can tag each
        audio chunk — the frontend gates playback on a matching responseId.
        """
        if text:
            await self._audio_queue.put({
                "command": "synthesize",
                "text": text,
                "response_id": self._current_response_id,
            })

    # ── public entry point ────────────────────────────────────────────────────

    async def handle(self) -> None:
        """
        Start all background tasks and run the STT loop for the full session.

        Called from api.py after WebSocketAudioInterface has accepted the
        connection and completed the initial handshake.
        """
        self._is_running = True

        await self._send("session_info", {
            "session_id": self.session_id,
            "sample_rate": self.config.sample_rate,
        })

        brain_task   = asyncio.create_task(self._process_brain_queue(),   name="dvh_brain")
        output_task  = asyncio.create_task(self._process_output_queue(),  name="dvh_output")
        control_task = asyncio.create_task(self._monitor_controls(),      name="dvh_control")

        try:
            await self._stt_loop()
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("STT loop error: %s", exc, exc_info=True)
            await self._send("error", str(exc))
        finally:
            self._is_running = False
            for task in (brain_task, output_task, control_task):
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        logger.info("Voice session ended: %s", self.session_id)

    # ── STT loop (mirrors SimpleVoiceAssistant.start()) ───────────────────────

    async def _stt_loop(self) -> None:
        """
        Receive transcriptions from Deepgram and drive the brain queue.

        Partial vs. final treatment is intentionally different:

        PARTIAL: set interrupt_requested + drain audio queue so TTS stops
          streaming new chunks, but do NOT send "interrupted" to the frontend.
          Audio chunks already in the browser's audio buffer keep playing.
          This prevents spurious activeResponseId resets from ambient noise
          or Deepgram partials that arrive before the first audio chunk.

        FINAL: call interrupt() which sends "interrupted" to the frontend,
          causing it to stop all audio and reset its active-response tracking.
          Then queue the utterance for brain processing.
        """
        await self._send("listening")

        async for transcription in self.stt.transcribe(self.input_channel):
            if not transcription.content:
                continue

            if transcription.is_final:
                # Full utterance confirmed — hard stop any active output and
                # cleanly reset the frontend for the new response turn.
                await self.interrupt(reason="user_speaking")
                text = transcription.content.strip()
                if not text:
                    continue
                logger.info("Final transcript [%s]: %s", self.session_id, text)
                await self._send("transcript_final", text)
                self.interrupt_requested.clear()
                await self._brain_queue.put(text)
            else:
                # Partial transcript: signal TTS to stop on the next chunk
                # (interrupt_requested checked every chunk in the output task).
                # Do NOT clear the audio queue here — that would also remove the
                # "done" sentinel and leave the frontend stuck waiting for a
                # response that never completes (audio goes silent mid-sentence
                # with no recovery path).
                # The output task will skip any remaining synthesize items when
                # interrupt_requested is set, but the "done" sentinel still flows
                # through and resets the frontend correctly.
                self.interrupt_requested.set()
                await self._send("transcript_interim", transcription.content)

    # ── control monitor ───────────────────────────────────────────────────────

    async def _monitor_controls(self) -> None:
        """
        Forward explicit client-side interrupt/cancel events to interrupt().

        These come from the frontend's cancel button or programmatic calls,
        as opposed to speech-detected barge-in which comes from _stt_loop.
        """
        while self._is_running:
            try:
                event_type = await asyncio.wait_for(self.control_queue.get(), timeout=0.5)
                if event_type in ("interrupt", "cancel"):
                    logger.info("Client control event [%s]: %s", self.session_id, event_type)
                    await self.interrupt(reason=event_type)
                self.control_queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("Control monitor error: %s", exc)

    # ── brain task (mirrors SimpleVoiceAssistant._process_brain_queue()) ──────

    async def _process_brain_queue(self) -> None:
        """
        Consume final transcripts, process through DiscoveryChatAgent,
        and queue TTS sentences to the audio output queue.
        """
        while True:
            try:
                transcription = await self._brain_queue.get()

                self.brain_processing = True
                self.interrupt_requested.clear()

                # Generate a per-turn response ID so the frontend can correlate
                # processing / text_chunk / audio / done events to a single turn.
                rid = self._next_response_id()
                self._current_response_id = rid
                await self._send("processing", response_id=rid)

                try:
                    await self._brain_process_internal(transcription)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.error("Brain processing error: %s", exc, exc_info=True)
                    await self._send("error", str(exc))
                finally:
                    self._brain_queue.task_done()
                    self.brain_processing = False
                    self._current_response_id = None
                    # ── DO NOT send "done" here ──────────────────────────────────
                    # The brain finishes *before* TTS audio has been sent.
                    # If we send "done" now the frontend sees isAudioPlaying=false,
                    # calls resetActiveResponse(), and every subsequent audio chunk
                    # fails the isCurrentResponse() check → silent playback.
                    #
                    # Instead we push a sentinel into the audio queue.  The output
                    # task will send "done" (and "listening") only after all audio
                    # chunks for this turn have been flushed to the client.
                    # _clear_audio_queue() removes the sentinel on interrupt, so no
                    # stale "done" is ever emitted — "interrupted" handles the reset.
                    await self._audio_queue.put({"command": "done", "response_id": rid})

            except asyncio.CancelledError:
                logger.info("Brain queue processor cancelled")
                break
            except Exception as exc:
                logger.error("Brain queue processor error: %s", exc)
                await asyncio.sleep(0.1)

    async def _brain_process_internal(self, transcription: str) -> str:
        """
        Stream response from DiscoveryChatAgent and queue TTS sentences.

        Memory invariant on interrupt:
          If interrupted while the LLM is still streaming, the partial text
          accumulated so far is committed to chat_memory so the next turn's
          LLM call sees a well-formed conversation history (no orphaned user
          message without a reply).
        """
        buffer       = ""
        full_content = ""

        try:
            async for event in self.chat_agent.chat(transcription, self.session_id):
                if self.interrupt_requested.is_set():
                    logger.info(
                        "Brain processing interrupted mid-stream [%s]", self.session_id
                    )
                    break

                if event.type == "text_chunk":
                    full_content += event.content
                    buffer       += event.content
                    await self._send("text_chunk", event.content, response_id=self._current_response_id)

                    sentence, remainder = _contains_punctuation(buffer)
                    if sentence:
                        await self.synth_and_send(sentence)
                        buffer = remainder or ""

                elif event.type == "tool_call":
                    logger.info("Tool called: %s", event.content)

                elif event.type in ("recipes", "meal_plan", "recipe_detail", "shopping_list"):
                    await self._send(event.type, event.metadata)

                elif event.type == "error":
                    logger.error("Chat agent error: %s", event.content)
                    await self._send("error", event.content)

            # Flush any remaining buffered text that didn't end with punctuation.
            if buffer.strip() and not self.interrupt_requested.is_set():
                await self.synth_and_send(buffer)

        finally:
            # Commit partial response to memory if we were interrupted mid-stream.
            # Without this the LLM sees an orphaned user message on the next turn
            # and may repeat the same answer.
            if full_content and self.interrupt_requested.is_set():
                self.chat_agent.commit_partial_response(self.session_id, full_content)

        return full_content

    # ── output task (mirrors SimpleVoiceAssistant._process_output_queue()) ────

    async def _process_output_queue(self) -> None:
        """
        Consume TTS synthesis commands from _audio_queue and stream audio.

        Checks interrupt_requested on every audio chunk so TTS stops within
        one chunk (~100 ms) of an interrupt being signalled.
        """
        while True:
            try:
                item = await self._audio_queue.get()

                if isinstance(item, dict) and item.get("command") == "synthesize":
                    # If an interrupt fired (user speaking, barge-in, etc.)
                    # skip this item entirely — no ElevenLabs API call, no audio.
                    # The "done" sentinel will still be processed so the frontend
                    # receives a clean end-of-turn signal.
                    if self.interrupt_requested.is_set():
                        self._audio_queue.task_done()
                        continue

                    text        = item.get("text", "")
                    response_id = item.get("response_id")
                    clean = _clean_for_tts(text)
                    if clean:
                        self.is_speaking = True
                        try:
                            async for chunk in self.tts.synthesize(clean):
                                if self.interrupt_requested.is_set():
                                    logger.info("TTS stream interrupted")
                                    break
                                await self._send_audio(chunk, response_id=response_id)
                        except Exception as exc:
                            logger.error("TTS error: %s", exc, exc_info=True)
                        finally:
                            self.is_speaking = False

                elif isinstance(item, dict) and item.get("command") == "done":
                    # Sentinel placed by the brain task after all TTS text has
                    # been queued.  We only reach here when every audio chunk for
                    # this turn has already been sent, so the frontend's
                    # isAudioPlaying flag is accurate and the deferred-reset logic
                    # in the "done" handler works correctly.
                    response_id = item.get("response_id")
                    await self._send("done", response_id=response_id)
                    if (
                        not self.interrupt_requested.is_set()
                        and self._brain_queue.empty()
                    ):
                        await self._send("listening")

                self._audio_queue.task_done()

            except asyncio.CancelledError:
                logger.info("Output queue processor cancelled")
                break
            except Exception as exc:
                logger.error("Output queue processor error: %s", exc)
