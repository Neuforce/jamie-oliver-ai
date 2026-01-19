import time

import aiohttp

from .base import BaseTextToSpeech

from ccai.core.logger import configure_logger
from ccai.core.tracing import observe_speech_processing

logger = configure_logger(__name__)


class ElevenLabsTextToSpeech(BaseTextToSpeech):

    def __init__(
        self,
        api_key: str,
        voice_id: str,
        similarity_boost: int = 0.5,
        stability: int = 0.5,
        speed: float = 1.0,
        speaker_boost: bool = True,
        output_format: str = "ulaw_8000",
    ):
        if not api_key or not api_key.strip():
            raise ValueError("ELEVENLABS_API_KEY is required but not provided or is empty")
        if not voice_id or not voice_id.strip():
            raise ValueError("ELEVENLABS_VOICE_ID is required but not provided or is empty")

        self.api_key = api_key
        self.voice_id = voice_id
        self.similarity_boost = similarity_boost
        self.stability = stability
        self.speaker_boost = speaker_boost
        self.output_format = output_format
        self.speed = speed

    @observe_speech_processing("synthesis", "elevenlabs")
    async def synthesize(self, text: str):
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream"
        querystring = {
            "optimize_streaming_latency": "4",
            "output_format": self.output_format,
        }

        payload = {
            "model_id": "eleven_flash_v2_5",
            "text": text,
            "voice_settings": {
                "similarity_boost": self.similarity_boost,
                "stability": self.stability,
                "use_speaker_boost": self.speaker_boost,
                "speed": self.speed,
                # "style": 0.3,
            },
        }
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        start = time.perf_counter()
        first_chunk = True

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, json=payload, headers=headers, params=querystring
                ) as response:
                    response.raise_for_status()
                    if response.status == 200:
                        async for chunk in response.content.iter_any():
                            if first_chunk:
                                logger.info(
                                    f"Time to first chunk: {time.perf_counter() - start:.2f}s - Text: {text}"
                                )
                                first_chunk = False

                            yield chunk

        except aiohttp.ClientResponseError as e:
            if e.status == 401:
                logger.error(
                    f"ElevenLabs API authentication failed (401 Unauthorized). "
                    f"Please check that ELEVENLABS_API_KEY is correctly set in your environment variables. "
                    f"Error: {e.message}"
                )
                raise ValueError(
                    "ElevenLabs API authentication failed. Please verify ELEVENLABS_API_KEY is set correctly."
                ) from e
            else:
                logger.error(f"ElevenLabs API error ({e.status}): {e.message}")
                raise
        except Exception as e:
            logger.error(f"Error in ElevenLabsTTS: {e}")
            raise

    async def close(self):
        pass
