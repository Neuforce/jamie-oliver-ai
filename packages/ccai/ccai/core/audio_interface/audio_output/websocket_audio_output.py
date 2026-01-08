import base64
import logging
from fastapi import WebSocket
from fastapi.websockets import WebSocketState

from ccai.core.audio_interface.audio_output.audio_output_service import AudioOutputService


class WebSocketAudioOutput(AudioOutputService):
    """
    WebSocket-based audio output service for browser clients.
    Sends audio data to browser (PCM format) via WebSocket.
    """
    
    def __init__(self, websocket: WebSocket, sample_rate: int = 16000):
        self.websocket = websocket
        self.sample_rate = sample_rate
        self.session_id = None
        self.logger = logging.getLogger(__name__)

    async def start_client(self):
        """Initialize the audio output service."""
        pass

    async def send_audio(self, audio_data: bytes):
        """
        Send audio data to the client via WebSocket.
        Audio data should be in PCM format.
        
        Args:
            audio_data: Raw PCM audio bytes
        """
        if not self.is_connected:
            self.logger.debug("Cannot send audio: WebSocket not connected")
            return
            
        try:
            # Encode audio data to base64 for transmission
            base64_audio = base64.b64encode(audio_data).decode('utf-8')
            
            # Send to client
            await self.websocket.send_json({
                "event": "audio",
                "data": base64_audio,
                "sampleRate": self.sample_rate
            })
        except Exception as e:
            # Don't log as error if WebSocket is already closed (normal during shutdown)
            if self.is_connected:
                self.logger.error(f"Error sending audio: {e}", exc_info=True)
            else:
                self.logger.debug(f"Could not send audio, WebSocket closed: {e}")
            # Don't raise - just continue, as connection might be closed during cleanup

    async def clear(self):
        """Clear any buffered audio on the client side."""
        if self.is_connected:
            await self.websocket.send_json({
                "event": "control",
                "action": "clear"
            })

    async def send_event(self, event_type: str, data: dict):
        """
        Send a custom event to the client via WebSocket.
        This can be used for recipe state updates, system messages, etc.
        
        Args:
            event_type: Type of event (e.g., "recipe_state", "system_message", "timer_done")
            data: Event payload
        """
        if not self.is_connected:
            self.logger.debug(f"Cannot send event {event_type}: WebSocket not connected")
            return
            
        try:
            self.logger.info(f"📡 Sending WebSocket event: {event_type} with data keys: {list(data.keys())}")
            await self.websocket.send_json({
                "event": event_type,
                "data": data
            })
            self.logger.info(f"✅ WebSocket event sent successfully: {event_type}")
        except Exception as e:
            if self.is_connected:
                self.logger.error(f"Error sending event {event_type}: {e}")
            else:
                self.logger.debug(f"Could not send event {event_type}, WebSocket closed: {e}")

    @property
    def is_connected(self):
        """Check if WebSocket is still connected."""
        return (
            self.websocket.application_state == WebSocketState.CONNECTED
            and self.websocket.client_state == WebSocketState.CONNECTED
        )

