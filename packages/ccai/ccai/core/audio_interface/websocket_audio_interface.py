import logging
from fastapi import WebSocket

from ccai.core.audio_interface.base import AudioInterface
from ccai.core.audio_interface.audio_input.websocket_audio_input import WebSocketAudioInput
from ccai.core.audio_interface.audio_output.websocket_audio_output import WebSocketAudioOutput


class WebSocketAudioInterface(AudioInterface):
    """
    WebSocket-based audio interface for browser clients.
    Handles both audio input and output over a single WebSocket connection.
    """
    
    def __init__(self, websocket: WebSocket, sample_rate: int = 16000):
        """
        Initialize the WebSocket audio interface.
        
        Args:
            websocket: FastAPI WebSocket connection
            sample_rate: Audio sample rate (default: 16000 Hz)
        """
        self.websocket = websocket
        self.sample_rate = sample_rate
        self.logger = logging.getLogger(__name__)
        
        # Initialize input and output services
        self._input_service = WebSocketAudioInput(websocket, sample_rate)
        self._output_service = WebSocketAudioOutput(websocket, sample_rate)
        
        self.custom_parameters = {}

    async def start(self) -> None:
        """
        Start the audio interface by accepting the WebSocket connection
        and initializing input/output services.
        """
        self.logger.info("Starting WebSocket audio interface")
        
        # Start the input service (this accepts the WebSocket)
        await self._input_service.start_client()
        
        # Get custom parameters from input service after handshake
        self.custom_parameters = self._input_service.custom_parameters
        
        # Start the output service
        await self._output_service.start_client()
        
        # Sync session ID between input and output
        self._output_service.session_id = self._input_service.session_id
        
        self.logger.info(f"Audio interface started for session: {self._input_service.session_id}")

    async def stop(self) -> None:
        """Stop the audio interface and close the WebSocket connection."""
        self.logger.info("Stopping WebSocket audio interface")
        
        # Send a stop event to the client
        if self._output_service.is_connected:
            await self.websocket.send_json({"event": "stop"})
        
        # Close the WebSocket
        if self.websocket.client_state == self.websocket.client_state.CONNECTED:
            await self.websocket.close()

    def get_input_service(self):
        """Get the audio input stream generator."""
        return self._input_service.get_audio_stream()

    def get_output_service(self) -> WebSocketAudioOutput:
        """Get the audio output service."""
        return self._output_service

