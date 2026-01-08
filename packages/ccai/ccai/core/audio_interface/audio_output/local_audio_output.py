import asyncio
import audioop
import time

import pyaudio
import threading
from ccai.core.audio_interface.audio_output.audio_output_service import AudioOutputService


class LocalAudioOutput(AudioOutputService):
    def __init__(self, sample_rate: int = 8000, output_device_index=None):
        self.sample_rate = sample_rate
        self.chunk_size = 1024  # Adjust as needed
        self.audio_queue = asyncio.Queue()
        self.running = False
        self.stream = None
        self.loop = asyncio.get_running_loop()
        self.output_device_index = output_device_index
        self.pyaudio_instance = pyaudio.PyAudio()
        self._talking = False

    async def start_client(self):
        self.running = True
        self.stream = self.pyaudio_instance.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=self.sample_rate,
            output=True,
            frames_per_buffer=self.chunk_size,
            output_device_index=self.output_device_index,
        )
        # Instead of using a callback, start a separate thread for audio playback
        threading.Thread(target=self.playback_loop, daemon=True).start()

    def playback_loop(self):
        """Continuously checks the queue and plays audio chunks."""
        try:
            while self.running:
                if not self.audio_queue.empty():
                    data = self.audio_queue.get_nowait()
                    self.stream.write(data)
                else:
                    time.sleep(0.001)

        except Exception as e:
            print(f"Playback error: {e}")
        finally:
            self.cleanup()

    async def send_audio(self, audio_data):
        """Adds audio data to the queue."""
        pcm_data = audioop.ulaw2lin(audio_data, 2)
        await self.audio_queue.put(pcm_data)

    @property
    def talking(self):
        return not self.audio_queue.empty()

    async def stop_client(self):
        """Signals the playback loop to stop."""
        self.running = False
        await asyncio.sleep(0.1)  # Give time for the playback loop to exit
        self.cleanup()

    def cleanup(self):
        """Stops the stream and cleans up PyAudio resources."""
        if self.stream.is_active():
            self.stream.stop_stream()
        self.stream.close()
        self.pyaudio_instance.terminate()

    async def clear(self):
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
