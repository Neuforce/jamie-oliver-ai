from ccai.core.audio_interface.base import AudioInterface
from ccai.core.audio_interface.audio_input.twilio_audio_input import TwilioCallInput
from ccai.core.audio_interface.audio_output.twilio_audio_output import TwilioCallOutput
from fastapi import WebSocket


class TwilioAudioInterface(AudioInterface):
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self._input_service = None
        self._output_service = None
        self.custom_parameters = None

    async def start(self):
        self._input_service = TwilioCallInput(self.websocket)
        self._output_service = TwilioCallOutput(self.websocket)

        await self._input_service.start_client()
        await self._output_service.start_client()

        self._output_service.stream_sid = self._input_service.stream_sid
        self.custom_parameters = self._input_service.custom_parameters

    async def stop(self):
        # Handle cleanup
        pass

    def get_input_service(self):
        return self._input_service.get_audio_stream()

    def get_output_service(self):
        return self._output_service
