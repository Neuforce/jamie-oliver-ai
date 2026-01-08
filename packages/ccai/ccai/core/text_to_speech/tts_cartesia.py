from cartesia import AsyncCartesia
from typing import AsyncGenerator
from .base import BaseTextToSpeech


class CartesiaTTSService(BaseTextToSpeech):
    def __init__(
        self,
        api_key: str,
        voice_id: str = "846d6cb0-2301-48b6-9683-48f5618ea2f6",
        model_id: str = "sonic-multilingual",
        sample_rate: int = 8000,
    ):
        self.api_key = api_key
        self.voice_id = voice_id
        self.model_id = model_id
        self.sample_rate = sample_rate
        self.client = None

    async def _initialize_client(self):
        if not self.client:
            self.client = AsyncCartesia(api_key=self.api_key)

    async def synthesize(self, text: str) -> AsyncGenerator[bytes, None]:
        await self._initialize_client()
        voice = self.client.voices.get(id=self.voice_id)

        output_format = {
            "container": "raw",
            "encoding": "pcm_mulaw",
            "sample_rate": self.sample_rate,
        }

        async for output in await self.client.tts.sse(
            model_id=self.model_id,
            transcript=text,
            voice_embedding=voice["embedding"],
            stream=True,
            output_format=output_format,
            _experimental_voice_controls={
                "speed": "fast",
                "emotion": ["positivity:high"],
            },
        ):
            yield output["audio"]

    async def close(self):
        if self.client:
            await self.client.close()
