from abc import ABC, abstractmethod


class AudioInputService(ABC):
    @abstractmethod
    async def start_client(self):
        pass

    @abstractmethod
    async def get_audio_stream(self):
        pass

    @abstractmethod
    async def pause_audio_stream(self):
        pass

    @abstractmethod
    async def resume_audio_stream(self):
        pass
