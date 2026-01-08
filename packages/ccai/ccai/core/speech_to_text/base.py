from abc import ABC
from typing import AsyncGenerator


class BaseSpeechToText(ABC):

    async def transcribe(
        self, audio_stream: AsyncGenerator[bytes, None]
    ) -> AsyncGenerator[str, None]:
        pass
