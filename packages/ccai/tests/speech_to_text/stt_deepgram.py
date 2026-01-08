import asyncio
import os

from ccai.core.audio_interface.audio_input import LocalAudioInput
from packages.ccai.ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService

from dotenv import load_dotenv

load_dotenv(override=True)


async def main():
    sample_rate = 16000

    audio_input_service = LocalAudioInput(
        input_device_index=2,
        sample_rate=sample_rate,
    )
    await audio_input_service.start_client()

    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))

    input_audio = audio_input_service.get_audio_stream()

    transcription_generator = stt.transcribe(input_audio)

    async for transcription in transcription_generator:
        print(transcription)


if __name__ == "__main__":
    asyncio.run(main())
