import base64
from fastapi import WebSocket
from fastapi.websockets import WebSocketState

from ccai.core.audio_interface.audio_output.audio_output_service import AudioOutputService


class TwilioCallOutput(AudioOutputService):
    duration = 0.02

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.stream_sid = None
        self.call_sid = None
        self.silence_counter = 0
        self.websocket.state_holder = True

    async def start_client(self):
        pass

    async def send_audio(self, audio_data):
        if self.is_connected:
            base64_chunk = base64.b64encode(audio_data).decode()
            await self.websocket.send_json(
                {
                    "event": "media",
                    "streamSid": self.stream_sid,
                    "media": {"payload": base64_chunk},
                }
            )

    @property
    def is_connected(self):
        return (
                self.websocket.application_state == WebSocketState.CONNECTED
                and self.websocket.client_state == WebSocketState.CONNECTED
        )

    async def clear(self):
        if self.is_connected:
            await self.websocket.send_json(
                {
                    "event": "clear",
                    "streamSid": self.stream_sid,
                }
            )
