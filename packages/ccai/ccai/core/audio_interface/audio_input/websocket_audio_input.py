import base64
import audioop
import asyncio
import logging
from typing import AsyncGenerator
from fastapi import WebSocket
from fastapi.websockets import WebSocketState
from starlette.websockets import WebSocketDisconnect

from ccai.core.audio_interface.audio_input.audio_input_service import AudioInputService


class WebSocketAudioInput(AudioInputService):
    """
    WebSocket-based audio input service for browser clients.
    Receives audio data from browser (PCM format) via WebSocket.
    """
    
    def __init__(self, websocket: WebSocket, sample_rate: int = 16000):
        self.websocket = websocket
        self.sample_rate = sample_rate
        self.session_id = None
        self.custom_parameters = {}
        self.is_paused = False
        self.running = False
        self.logger = logging.getLogger(__name__)

    async def start_client(self):
        """Accept WebSocket connection and wait for initial handshake."""
        await self.websocket.accept()
        self.running = True
        
        # Wait for the first message which should be a 'start' event
        try:
            message = await self.websocket.receive_json()
            if message.get("event") == "start":
                self.session_id = message.get("sessionId", "unknown")
                self.sample_rate = message.get("sampleRate", 16000)
                self.custom_parameters = message.get("customParameters", {})
                self.logger.info(f"Session started: {self.session_id}, sample_rate: {self.sample_rate}")
        except Exception as e:
            self.logger.error(f"Error during WebSocket handshake: {e}")
            self.running = False

    async def get_audio_stream(self) -> AsyncGenerator[bytes, None]:
        """
        Generator that yields audio chunks from the WebSocket connection.
        Expects messages in format:
        - {"event": "audio", "data": "base64_encoded_pcm_data"}
        - {"event": "stop"}
        
        Yields:
            bytes: Audio data chunks in PCM format
        """
        try:
            while self.running:
                if not self.is_connected:
                    self.logger.warning("WebSocket client disconnected")
                    break
                    
                # Receive message from client
                message = await self.websocket.receive_json()
                
                # Handle different event types
                event_type = message.get("event")
                    
                if event_type == "audio" and not self.is_paused:
                    # Decode base64 audio data
                    audio_data = message.get("data")
                    if audio_data:
                        try:
                            # Decode from base64
                            audio_bytes = base64.b64decode(audio_data)
                            yield audio_bytes
                        except Exception as e:
                            self.logger.error(f"Error decoding audio data: {e}")
                            
                elif event_type == "stop":
                    self.logger.info(f"Stop event received for session {self.session_id}")
                    self.running = False
                    break

        except WebSocketDisconnect:
            self.logger.warning("WebSocket disconnected")
            self.running = False
        except asyncio.CancelledError:
            self.logger.info("Audio stream was cancelled")
            self.running = False
            raise
        except Exception as e:
            self.logger.error(f"Error in WebSocket audio stream: {e}")
            self.running = False
            raise

    async def pause_audio_stream(self):
        """Pause receiving audio from the client."""
        self.is_paused = True
        if self.is_connected:
            await self.websocket.send_json({
                "event": "control",
                "action": "pause"
            })

    async def resume_audio_stream(self):
        """Resume receiving audio from the client."""
        self.is_paused = False
        if self.is_connected:
            await self.websocket.send_json({
                "event": "control",
                "action": "resume"
            })

    async def clear(self):
        """Clear any buffered audio."""
        if self.is_connected:
            await self.websocket.send_json({
                "event": "control",
                "action": "clear"
            })

    @property
    def is_connected(self):
        """Check if WebSocket is still connected."""
        return (
            self.websocket.application_state == WebSocketState.CONNECTED
            and self.websocket.client_state == WebSocketState.CONNECTED
        )

