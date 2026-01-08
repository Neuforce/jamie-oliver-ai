from typing import Optional

from ccai.core.audio_interface.base import AudioInterface
from ccai.core.audio_interface.audio_input.local_audio_input import LocalAudioInput
from ccai.core.audio_interface.audio_output.local_audio_output import LocalAudioOutput


class LocalAudioInterface(AudioInterface):
    def __init__(self, sample_rate: int = 8000,
                 input_device_index: Optional[int] = None,
                 output_device_index: Optional[int] = None):
        self.sample_rate = sample_rate
        self.input_device_index = input_device_index
        self.output_device_index = output_device_index
        self.pyaudio_instance = None
        self._input_service = None
        self._output_service = None

    async def start(self):
        self._input_service = LocalAudioInput(
            sample_rate=self.sample_rate,
            input_device_index=self.input_device_index
        )

        self._output_service = LocalAudioOutput(
            sample_rate=self.sample_rate,
            output_device_index=self.output_device_index
        )
        await self._input_service.start_client()
        await self._output_service.start_client()

    async def stop(self):
        if self._input_service:
            await self._input_service.stop_client()
        if self._output_service:
            await self._output_service.stop_client()
        if self.pyaudio_instance:
            self.pyaudio_instance.terminate()

    def get_input_service(self):
        return self._input_service.get_audio_stream()

    def get_output_service(self):
        return self._output_service
