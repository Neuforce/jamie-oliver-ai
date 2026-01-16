import asyncio
from typing import AsyncGenerator, Optional, Dict, Any, Callable

from ccai.core.logger import configure_logger
from ccai.core.tracing import observe_speech_processing
from .base import BaseSpeechToText
from .models import Transcription

logger = configure_logger(__name__)


class DeepgramSTTService(BaseSpeechToText):
    """
    A speech-to-text service using Deepgram's real-time transcription API.
    
    Features:
    - Real-time transcription with interim results
    - Auto-reconnect with exponential backoff on connection failure
    - Voice activity detection (VAD) support
    """

    # Reconnection settings
    MAX_RECONNECT_ATTEMPTS = 5
    INITIAL_RECONNECT_DELAY = 1.0  # seconds
    MAX_RECONNECT_DELAY = 30.0  # seconds
    BACKOFF_MULTIPLIER = 2.0

    def __init__(
        self,
        api_key: str,
        model: str = "nova-3",
        language: str = "es-US",
        smart_format: bool = True,
        encoding: str = "linear16",
        channels: int = 1,
        sample_rate: int = 8000,
        interim_results: bool = True,
        utterance_end_ms: Optional[int] = "1000",
        endpointing: Optional[int] = 250,
        on_reconnecting: Optional[Callable[[int], None]] = None,
        on_reconnected: Optional[Callable[[], None]] = None,
        on_connection_failed: Optional[Callable[[str], None]] = None,
    ):
        """
        Initialize the DeepgramSTTService.

        Args:
            api_key (str): Deepgram API key.
            model (str): Deepgram model to use.
            language (str): Language code.
            smart_format (bool): Whether to apply smart formatting.
            encoding (str): Audio encoding format.
            channels (int): Number of audio channels.
            sample_rate (int): Sample rate of the audio.
            interim_results (bool): Whether to receive interim transcription results.
            utterance_end_ms (Optional[str]): Time in milliseconds to consider the end of an utterance.
            endpointing (Optional[int]): Endpointing duration in milliseconds.
            on_reconnecting (Optional[Callable]): Callback when reconnection attempt starts.
            on_reconnected (Optional[Callable]): Callback when reconnection succeeds.
            on_connection_failed (Optional[Callable]): Callback when all reconnection attempts fail.
        """
        try:
            import deepgram
        except ImportError:
            raise ImportError(
                "Deepgram SDK is not installed. Please install it using 'pip install deepgram-sdk'."
            )

        self._api_key = api_key
        self._initialize_client(api_key)
        self.transcript_queue: asyncio.Queue = asyncio.Queue()
        
        # Reconnection state
        self._reconnect_attempts = 0
        self._is_reconnecting = False
        self._should_reconnect = True
        self._connection_closed_normally = False
        
        # Callbacks for connection events
        self._on_reconnecting = on_reconnecting
        self._on_reconnected = on_reconnected
        self._on_connection_failed = on_connection_failed

        self.options: Dict[str, Any] = {
            "model": model,
            "language": language,
            "smart_format": smart_format,
            "encoding": encoding,
            "channels": channels,
            "sample_rate": sample_rate,
            "interim_results": interim_results,
            "vad_events": True,
        }

        # self.options = deepgram.LiveOptions(
        #     model=model,
        #     language=language,
        #     smart_format=smart_format,
        #     encoding=encoding,
        #     channels=channels,
        #     sample_rate=sample_rate,
        #     interim_results=interim_results,
        #     utterance_end_ms=utterance_end_ms,
        #     vad_events=True,
        #     endpointing=endpointing,
        # )

        if utterance_end_ms:
            self.options["utterance_end_ms"] = utterance_end_ms

        if endpointing:
            self.options["endpointing"] = endpointing

        self.buffer = ""
        self.needs_utterance = False
        
        # Active connection reference for reconnection
        self._dg_connection = None
        self._audio_stream_ref = None

    def _initialize_client(self, api_key: str):
        """
        Initialize the Deepgram client.

        Args:
            api_key (str): Deepgram API key.
        """
        try:
            from deepgram import (
                DeepgramClient,
                DeepgramClientOptions,
            )
        except ImportError:
            raise ImportError(
                "Deepgram SDK is not installed. Please install it using 'pip install deepgram-sdk'."
            )

        config = DeepgramClientOptions(
            options={"keepalive": "true"},
            # verbose=logging.DEBUG,
        )
        self.client = DeepgramClient(api_key, config)

        logger.debug("Deepgram client initialized.")

    def _calculate_reconnect_delay(self) -> float:
        """Calculate delay for next reconnection attempt with exponential backoff."""
        delay = self.INITIAL_RECONNECT_DELAY * (self.BACKOFF_MULTIPLIER ** self._reconnect_attempts)
        return min(delay, self.MAX_RECONNECT_DELAY)

    async def _attempt_reconnect(self) -> bool:
        """
        Attempt to reconnect to Deepgram with exponential backoff.
        
        Returns:
            bool: True if reconnection succeeded, False otherwise.
        """
        if not self._should_reconnect:
            return False
            
        if self._reconnect_attempts >= self.MAX_RECONNECT_ATTEMPTS:
            logger.error(f"Max reconnection attempts ({self.MAX_RECONNECT_ATTEMPTS}) reached")
            if self._on_connection_failed:
                self._on_connection_failed("Max reconnection attempts reached")
            return False

        self._reconnect_attempts += 1
        delay = self._calculate_reconnect_delay()
        
        logger.info(f"🔄 Reconnecting to Deepgram (attempt {self._reconnect_attempts}/{self.MAX_RECONNECT_ATTEMPTS}) in {delay:.1f}s...")
        
        if self._on_reconnecting:
            self._on_reconnecting(self._reconnect_attempts)
        
        await asyncio.sleep(delay)
        
        try:
            # Reinitialize the client
            self._initialize_client(self._api_key)
            logger.info("✅ Deepgram client reinitialized")
            return True
        except Exception as e:
            logger.error(f"❌ Reconnection failed: {e}")
            return False

    @observe_speech_processing("transcription", "deepgram")
    async def transcribe(
        self, audio_stream: AsyncGenerator[bytes, None]
    ) -> AsyncGenerator[str, None]:
        """
        Transcribe audio from an asynchronous audio stream.
        
        Features auto-reconnect with exponential backoff on connection failure.

        Args:
            audio_stream (AsyncGenerator[bytes, None]): The audio stream generator.

        Yields:
            str: Transcribed text from the audio stream.
        """
        try:
            from deepgram import (
                LiveOptions,
                LiveTranscriptionEvents,
            )
        except ImportError:
            raise ImportError(
                "Deepgram SDK is not installed. Please install it using 'pip install deepgram-sdk'."
            )

        # Reset reconnection state
        self._reconnect_attempts = 0
        self._should_reconnect = True
        self._connection_closed_normally = False
        self._audio_stream_ref = audio_stream
        
        # Create a reconnection event to signal when we need to reconnect
        reconnect_event = asyncio.Event()
        connection_error_code = None

        dg_connection = self.client.listen.websocket.v("1")
        self._dg_connection = dg_connection
        options = LiveOptions(**self.options)

        def on_message(_, result, **__):
            try:
                self.transcript_queue.put_nowait(result)
            except Exception as e:
                logger.error(f"Error pushing transcription: {e}")

        def on_utterance(_, utterance_end, **__):
            try:
                self.transcript_queue.put_nowait(utterance_end)
            except Exception as e:
                logger.error(f"Error pushing utterance: {e}")

        def on_error(_, error, **__):
            nonlocal connection_error_code
            logger.error(f"Deepgram error: {error}")
            
            # Check if this is a connection error that warrants reconnection
            error_str = str(error) if error else ""
            if "ConnectionClosed" in error_str or "1006" in error_str:
                connection_error_code = 1006
                logger.warning("🔴 Connection closed unexpectedly (code 1006), will attempt reconnect")
                reconnect_event.set()
            else:
                self.transcript_queue.put_nowait(f"ERROR: {error}")

        def on_close(_, close_event, **__):
            nonlocal connection_error_code
            
            # Extract close code if available
            close_code = getattr(close_event, 'code', None) if close_event else None
            logger.debug(f"Deepgram connection closed (code: {close_code})")
            
            # Normal closure codes: 1000 (normal), 1001 (going away)
            if close_code in (1000, 1001) or self._connection_closed_normally:
                logger.debug("Connection closed normally")
                return
            
            # Abnormal closure - trigger reconnect
            if close_code == 1006 or close_code is None:
                connection_error_code = close_code or 1006
                logger.warning(f"🔴 Abnormal connection closure (code: {connection_error_code})")
                reconnect_event.set()

        dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
        dg_connection.on(LiveTranscriptionEvents.UtteranceEnd, on_utterance)
        dg_connection.on(LiveTranscriptionEvents.Error, on_error)
        dg_connection.on(LiveTranscriptionEvents.Close, on_close)

        if not dg_connection.start(options):
            raise RuntimeError("Failed to start Deepgram connection")

        logger.debug("✅ Deepgram connection started.")
        
        # Reset reconnection counter on successful connection
        self._reconnect_attempts = 0
        if self._on_reconnected and self._is_reconnecting:
            self._on_reconnected()
        self._is_reconnecting = False

        async def send_audio():
            """Send audio chunks to Deepgram for transcription."""
            try:
                async for chunk in audio_stream:
                    if self._dg_connection:
                        self._dg_connection.send(chunk)
            except Exception as e:
                logger.error(f"Error sending audio to Deepgram: {e}")
            finally:
                logger.debug("Finishing Deepgram audio send.")
                if self._dg_connection and not reconnect_event.is_set():
                    self._connection_closed_normally = True
                    self._dg_connection.finish()
                await self.transcript_queue.put(None)

        # Start sending audio in the background
        transcription_task = asyncio.create_task(send_audio())

        try:
            while True:
                # Check for reconnection signal with timeout
                try:
                    transcript = await asyncio.wait_for(
                        self.transcript_queue.get(),
                        timeout=0.5
                    )
                except asyncio.TimeoutError:
                    # Check if we need to reconnect
                    if reconnect_event.is_set():
                        logger.info("🔄 Reconnection triggered...")
                        reconnect_event.clear()
                        
                        # Cancel current transcription task
                        if transcription_task and not transcription_task.done():
                            transcription_task.cancel()
                            try:
                                await transcription_task
                            except asyncio.CancelledError:
                                pass
                        
                        # Attempt reconnection
                        self._is_reconnecting = True
                        if await self._attempt_reconnect():
                            # Reconnection successful - but we can't resume the same stream
                            # Signal the caller to restart
                            logger.info("✅ Reconnected to Deepgram - stream will restart")
                            self.transcript_queue.put_nowait("RECONNECTED")
                            break
                        else:
                            # Reconnection failed
                            logger.error("❌ Failed to reconnect to Deepgram")
                            break
                    continue
                
                if not transcript:
                    break

                # Handle reconnection signal
                if transcript == "RECONNECTED":
                    yield Transcription(content="[Connection restored]", is_final=True)
                    break

                clean_transcript = await self.preprocess_transcription(transcript)
                if clean_transcript and clean_transcript.content:
                    yield clean_transcript

        except asyncio.CancelledError:
            logger.info("Transcription task was cancelled.")
            self._should_reconnect = False
            if transcription_task and not transcription_task.done():
                transcription_task.cancel()
                try:
                    await transcription_task
                except asyncio.CancelledError:
                    pass
            raise
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            raise
        finally:
            self._connection_closed_normally = True
            if self._dg_connection:
                try:
                    self._dg_connection.finish()
                except Exception:
                    pass
            self._dg_connection = None
            logger.debug("Deepgram connection cleaned up.")
    
    def stop(self):
        """Stop transcription and prevent auto-reconnect."""
        self._should_reconnect = False
        self._connection_closed_normally = True
        if self._dg_connection:
            try:
                self._dg_connection.finish()
            except Exception:
                pass
            self._dg_connection = None

    async def preprocess_transcription(self, transcript) -> Transcription:
        """
        Preprocess the transcription result.

        Args:
            transcript: Transcription result from Deepgram (object with .type attribute)
        """
        # Guard against error strings or unexpected types
        if isinstance(transcript, str):
            if transcript.startswith("ERROR:"):
                logger.warning(f"Received error in transcript queue: {transcript}")
            return None
        
        if not hasattr(transcript, 'type'):
            logger.warning(f"Received transcript without type attribute: {type(transcript)}")
            return None

        # Perform any necessary preprocessing here
        if transcript.type == "Results" and not transcript.is_final:
            return Transcription(
                content=transcript.channel.alternatives[0].transcript,
                is_final=False,
            )

        if transcript.type == "UtteranceEnd":
            # if self.needs_utterance:
            logger.debug("Detected UtteranceEnd.")
            #

            # self.needs_utterance = False
            # full_speech = self.buffer
            # self.buffer = ""
            #
            # if not full_speech:
            #     return

            if self.buffer:
                logger.debug(f"Utterance buffer: {self.buffer}")
                full_speech = self.buffer
                self.buffer = ""
                return Transcription(
                    content=full_speech,
                    is_final=True,
                )
            else:
                logger.debug(f"Utterance buffer: NULL")
                return

            # return Transcription(
            #     content=full_speech,
            #     is_final=True,
            # )

        # else:
        #     return

        sentence = transcript.channel.alternatives[0].transcript

        if transcript.speech_final:
            # logger.debug("Detected final speech.")
            # logger.debug(f"Existing buffer: {self.buffer}")
            # logger.debug(f"New result: {sentence}")

            # self.needs_utterance = False
            full_speech = self.buffer + " " + sentence
            self.buffer = ""

            if not full_speech.strip():
                return

            return Transcription(
                content=full_speech,
                is_final=True,
            )

        if transcript.is_final:
            # self.needs_utterance = True
            self.buffer += sentence

        if not self.buffer:
            return

        # logger.debug("Detected interim speech.")
        # logger.debug(f"Existing buffer: {self.buffer}")
        # logger.debug(f"New result: {sentence}")

        return Transcription(
            content=self.buffer,
            is_final=False,
        )
