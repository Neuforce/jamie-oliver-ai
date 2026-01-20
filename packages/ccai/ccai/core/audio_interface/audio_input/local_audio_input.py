import asyncio
import audioop
from ccai.core.logger import configure_logger
from typing import AsyncGenerator, Optional

try:
    import pyaudio
except ImportError:
    pyaudio = None  # pyaudio is optional (only needed for LocalAudioInput/Output)

from ccai.core.audio_interface.audio_input.audio_input_service import AudioInputService

logger = configure_logger(__name__)


class LocalAudioInput(AudioInputService):
    """
    An audio input service that captures audio from the local microphone using PyAudio.
    """

    duration: float = 0.02  # Duration of each audio chunk in seconds
    sample_width: int = 2  # Sample width in bytes (e.g., 2 bytes for 16-bit audio)

    def __init__(
            self, sample_rate: int = 8000, input_device_index: Optional[int] = None
    ):
        """
        Initialize the LocalAudioInput service.

        Args:
            sample_rate (int): The sampling rate in Hz.
            input_device_index (Optional[int]): The index of the input device to use.
        """
        if pyaudio is None:
            raise ImportError(
                "pyaudio is required for LocalAudioInput. "
                "Install it with: pip install pyaudio or pip install ccai[audio]"
            )

        self.sample_rate = sample_rate
        self.chunk_size = int(sample_rate * self.duration)
        self.audio_queue: asyncio.Queue = asyncio.Queue()
        self.running = False
        self.stream = None
        self.loop = asyncio.get_event_loop()
        self.input_device_index = input_device_index

        self.pyaudio_instance = pyaudio.PyAudio()
        logger.debug("PyAudio instance initialized.")

        self._list_input_devices()

    def _list_input_devices(self):
        """
        List available audio input devices for debugging purposes.
        """
        device_count = self.pyaudio_instance.get_device_count()
        for i in range(device_count):
            device_info = self.pyaudio_instance.get_device_info_by_index(i)
            logger.debug(f"Device {i}: {device_info}")

    async def start_client(self):
        """
        Start the audio input service and begin capturing audio.
        """
        self.running = True

        try:
            self.stream = self.pyaudio_instance.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.sample_rate,
                input=True,
                input_device_index=self.input_device_index,
                frames_per_buffer=self.chunk_size,
                stream_callback=self._pyaudio_callback,
            )
            logger.debug("Audio stream opened.")
        except Exception as e:
            logger.error(f"Failed to open audio stream: {e}")
            self.running = False
            return

        # Start the stream
        self.stream.start_stream()
        logger.info("Audio input service started.")

    def _pyaudio_callback(self, in_data, frame_count, time_info, status):
        """
        PyAudio callback function to read audio data.

        Args:
            in_data (bytes): The recorded audio data.
            frame_count (int): The number of frames.
            time_info (dict): Time information.
            status (int): Status flags.

        Returns:
            Tuple[None, int]: Return None and continue flag.
        """
        if self.running:
            asyncio.run_coroutine_threadsafe(self.audio_queue.put(in_data), self.loop)
        return (None, pyaudio.paContinue)

    async def get_audio_stream(self) -> AsyncGenerator[bytes, None]:
        """
        Asynchronously yield audio chunks from the microphone.

        Yields:
            bytes: Audio data chunks.
        """
        logger.info("Starting audio stream.")
        try:
            while self.running or not self.audio_queue.empty():
                chunk = await self.audio_queue.get()
                rms = audioop.rms(chunk, self.sample_width)
                if rms > 50:
                    # logger.debug(
                    #     f"Audio chunk with RMS {rms} passed silence threshold."
                    # )
                    yield chunk
                else:
                    silence = self._generate_silence()
                    yield silence
        except asyncio.CancelledError:
            logger.info("Audio stream was cancelled.")
            raise
        except Exception as e:
            logger.error(f"Error in audio stream: {e}")
            raise
        finally:
            await self.stop_client()

    def _generate_silence(self) -> bytes:
        """
        Generate a chunk of silence.

        Returns:
            bytes: Silence audio data.
        """
        num_samples = self.chunk_size
        silence_data = b"\x00" * (num_samples * self.sample_width)
        return silence_data

    async def stop_client(self):
        """
        Stop the audio input service and clean up resources.
        """
        if self.running:
            self.running = False
            if self.stream and self.stream.is_active():
                self.stream.stop_stream()
                self.stream.close()
                logger.debug("Audio stream stopped and closed.")
            self.pyaudio_instance.terminate()
            logger.debug("PyAudio instance terminated.")

            # Clear any remaining items in the queue
            while not self.audio_queue.empty():
                await self.audio_queue.get()
                self.audio_queue.task_done()

            logger.info("Audio input service stopped.")

    async def pause_audio_stream(self):
        """
        Pause the audio stream.
        """
        if self.stream and self.stream.is_active():
            self.stream.stop_stream()
            logger.info("Audio stream paused.")

    async def resume_audio_stream(self):
        """
        Resume the audio stream.
        """
        if self.stream and not self.stream.is_active():
            self.stream.start_stream()
            logger.info("Audio stream resumed.")
