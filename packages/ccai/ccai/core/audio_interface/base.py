from abc import ABC, abstractmethod
from ccai.core.audio_interface.audio_input.audio_input_service import AudioInputService
from ccai.core.audio_interface.audio_output.audio_output_service import AudioOutputService


class AudioInterface(ABC):
    """Abstract base class for audio interfaces that handle both input and output."""

    @abstractmethod
    async def start(self) -> None:
        """Initialize and start the audio interface."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop and cleanup the audio interface."""
        pass

    @abstractmethod
    def get_input_service(self) -> 'AudioInputService':
        """Get the audio input service."""
        pass

    @abstractmethod
    def get_output_service(self) -> 'AudioOutputService':
        """Get the audio output service."""
        pass
