import asyncio
from typing import AsyncGenerator, Optional, Dict, Any

from ccai.core.logger import configure_logger
from ccai.core.tracing import observe_speech_processing
from .base import BaseSpeechToText
from .models import Transcription

logger = configure_logger(__name__)


class DeepgramSTTService(BaseSpeechToText):
    """
    A speech-to-text service using Deepgram's real-time transcription API.
    """

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
            vad_events (bool): Whether to include voice activity detection events.
            endpointing (Optional[int]): Endpointing duration in milliseconds.
        """
        try:
            import deepgram
        except ImportError:
            raise ImportError(
                "Deepgram SDK is not installed. Please install it using 'pip install deepgram-sdk'."
            )

        self._initialize_client(api_key)
        self.transcript_queue: asyncio.Queue = asyncio.Queue()

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

    @observe_speech_processing("transcription", "deepgram")
    async def transcribe(
        self, audio_stream: AsyncGenerator[bytes, None]
    ) -> AsyncGenerator[str, None]:
        """
        Transcribe audio from an asynchronous audio stream.

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

        dg_connection = self.client.listen.websocket.v("1")
        options = LiveOptions(**self.options)

        def on_message(_, result, **__):
            try:
                self.transcript_queue.put_nowait(result)
                # logger.debug(f"Transcription received: {result}")
            except Exception as e:
                logger.error(f"Error pushing transcription: {e}")

        def on_utterance(_, utterance_end, **__):
            try:
                self.transcript_queue.put_nowait(utterance_end)

            except Exception as e:
                logger.error(f"Error pushing utterance: {e}")

        def on_error(_, error, **__):
            logger.error(f"Deepgram error: {error}")
            self.transcript_queue.put_nowait(f"ERROR: {error}")

        def on_close(_, __, **___):
            logger.debug("Deepgram connection closed.")

        dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
        dg_connection.on(LiveTranscriptionEvents.UtteranceEnd, on_utterance)
        dg_connection.on(LiveTranscriptionEvents.Error, on_error)
        dg_connection.on(LiveTranscriptionEvents.Close, on_close)

        if not dg_connection.start(options):
            raise RuntimeError("Failed to start Deepgram connection")

        logger.debug("Deepgram connection started.")

        async def send_audio():
            """
            Send audio chunks to Deepgram for transcription.
            """
            try:
                async for chunk in audio_stream:
                    dg_connection.send(chunk)
            except Exception as e:
                logger.error(f"Error sending audio to Deepgram: {e}")
            finally:
                logger.debug("Finishing Deepgram connection.")
                dg_connection.finish()
                await self.transcript_queue.put(None)  # Signal end of transcription

        # Start sending audio in the background
        transcription_task = asyncio.create_task(send_audio())

        try:
            while True:
                transcript = await self.transcript_queue.get()
                if not transcript:
                    break

                clean_transcript = await self.preprocess_transcription(transcript)
                if clean_transcript and clean_transcript.content:
                    # print(clean_transcript)
                    yield clean_transcript

        except asyncio.CancelledError:
            logger.info("Transcription task was cancelled.")
            if transcription_task:
                transcription_task.cancel()
                await transcription_task
            raise
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            raise
        finally:
            dg_connection.finish()
            logger.debug("Deepgram connection closed.")

    async def preprocess_transcription(self, transcript) -> Transcription:
        """
        Preprocess the transcription result.

        Args:
            transcript (str): Transcription result.
        """

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
