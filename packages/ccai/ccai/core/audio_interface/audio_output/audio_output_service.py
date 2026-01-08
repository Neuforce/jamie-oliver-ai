from abc import ABC, abstractmethod


class AudioOutputService(ABC):
    @abstractmethod
    async def start_client(self):
        pass

    @abstractmethod
    async def send_audio(self):
        pass
