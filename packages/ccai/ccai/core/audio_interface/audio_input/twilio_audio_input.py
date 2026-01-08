import base64
import audioop
import logging
import time
from fastapi import WebSocket
from fastapi.websockets import WebSocketState
from starlette.websockets import WebSocketDisconnect

from ccai.core.audio_interface.audio_input.audio_input_service import AudioInputService


class TwilioCallInput(AudioInputService):
    duration = 0.02

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.stream_sid = None
        self.switch = None
        self.silence_counter = 0
        self.call_sid = None
        self.custom_parameters = None

    async def start_client(self):
        await self.websocket.accept()
        async for _ in self.get_audio_stream():
            if self.stream_sid:
                break

    async def get_audio_stream(self):
        try:
            while True:
                data = await self.websocket.receive_json()
                chunk = await self.handle_event(data)
                if chunk:
                    yield chunk

        except WebSocketDisconnect:
            logging.getLogger("uvicorn").warning("WebSocket disconnected")
            raise WebSocketDisconnect

        except Exception as e:
            logging.getLogger("uvicorn").error(
                f"Error in WebSocket stream processing: {e}"
            )
            raise e

    async def handle_event(self, data):
        if data["event"] == "start":
            self.custom_parameters = data["start"]["customParameters"]
            self.stream_sid = data["streamSid"]
            self.call_sid = data["start"]["callSid"]

        elif data["event"] == "media":
            return await self.process_media_event(data)

        elif data["event"] == "mark":
            self.switch = data["mark"]["name"]

    async def process_media_event(self, data):
        audio_payload = data["media"]["payload"]
        audio_content = base64.b64decode(audio_payload)
        raw_audio_data = audioop.ulaw2lin(audio_content, 2)
        rms = audioop.rms(raw_audio_data, 2)

        if rms > 150 and (self.switch == "listening" or self.switch is None):
            self.silence_counter = time.perf_counter()
            return raw_audio_data
        else:
            raw_audio_data = await self.generate_silence()
            return raw_audio_data

    async def generate_silence(self, sample_width=2, sample_rate=8000):
        num_samples = int(self.duration * sample_rate)
        silence_data = b"\x00" * (num_samples * sample_width)
        return audioop.lin2ulaw(silence_data, sample_width)

    async def send_mark(self, mark):
        if self.is_connected:
            await self.websocket.send_json(
                {
                    "event": "mark",
                    "streamSid": self.stream_sid,
                    "mark": {"name": mark},
                }
            )

    async def pause_audio_stream(self):
        if self.is_connected:
            await self.send_mark("not_listening")

    async def resume_audio_stream(self):
        if self.is_connected:
            await self.send_mark("listening")

    async def clear(self):
        if self.is_connected:
            await self.websocket.send_json(
                {
                    "event": "clear",
                    "streamSid": self.stream_sid,
                }
            )

    @property
    def is_connected(self):
        return (
            self.websocket.application_state == WebSocketState.CONNECTED
            and self.websocket.client_state == WebSocketState.CONNECTED
        )
