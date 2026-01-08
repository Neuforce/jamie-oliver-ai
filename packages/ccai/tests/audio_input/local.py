import asyncio

from ccai.core.audio_interface.audio_input import LocalAudioInput


async def main():
    sample_rate = 16000

    audio_input_service = LocalAudioInput(
        input_device_index=2,
        sample_rate=sample_rate,
    )
    await audio_input_service.start_client()

    async for audio_chunk in audio_input_service.get_audio_stream():
        print(audio_chunk)


if __name__ == "__main__":
    asyncio.run(main())
