import audioop
from typing import AsyncGenerator
from .base import BaseTextToSpeech


class AmazonTTSService(BaseTextToSpeech):
    def __init__(
        self,
        access_key: str,
        secret_key: str,
        region_name: str = "us-east-1",
        voice_id: str = "Lupe",
        sample_rate: int = 8000,
        engine: str = "neural",
    ):
        self.access_key = access_key
        self.secret_key = secret_key
        self.region_name = region_name
        self.voice_id = voice_id
        self.sample_rate = str(sample_rate)
        self.engine = engine
        self.session = None
        self.client = None

    async def _get_client(self):
        try:
            import aioboto3
            from aiobotocore.session import get_session
        except ImportError:
            raise ImportError(
                "aioboto3 is not installed. Please install it using 'pip install aioboto3'."
            )
        if self.client is None:
            self.session = aioboto3.Session(
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region_name,
            )
            self.client = await self.session.client("polly").__aenter__()
        return self.client

    async def synthesize(self, text: str) -> AsyncGenerator[bytes, None]:
        client = await self._get_client()

        try:
            response = await client.synthesize_speech(
                Text=text,
                OutputFormat="pcm",
                VoiceId=self.voice_id,
                SampleRate=self.sample_rate,
                Engine=self.engine,
            )

            async with response["AudioStream"] as stream:
                while True:
                    chunk = await stream.content.read(1024)
                    if not chunk:
                        break
                    ulaw_chunk = audioop.lin2ulaw(chunk, 2)  # Assuming 16-bit PCM
                    yield ulaw_chunk

        except Exception as e:
            print(f"Error in AmazonTTS: {e}")
            raise
        finally:
            if "response" in locals() and hasattr(response, "close"):
                await response.close()

    async def close(self):
        if self.client:
            await self.client.__aexit__(None, None, None)
        # if self.session:
        #     await self.session.close()
