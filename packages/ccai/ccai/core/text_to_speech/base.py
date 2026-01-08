from abc import ABC, abstractmethod
from typing import AsyncGenerator


class BaseTextToSpeech(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> AsyncGenerator[bytes, None]:
        pass

    @abstractmethod
    async def close(self):
        pass
