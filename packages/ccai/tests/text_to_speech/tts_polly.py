import asyncio
import os
import time

from packages.ccai.ccai.core.text_to_speech.tts_polly import AmazonTTSService

from dotenv import load_dotenv

load_dotenv()


async def main():
    tts_service = AmazonTTSService(
        access_key=os.getenv("AWS_ACCESS_KEY_ID"),
        secret_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION"),
    )

    text = """The zoo is tough terrain; hilly.
I wheel as fast as I can —
then Mum shouts ‘Keep up!’
I stop. ‘Hand me my crutches.’
I shakily get up; tear off my splints’
velcro straps, and put them on her.
I sit her in the chair. ‘You have a go.’

At first, she spins in circles.
‘No,’ I say. ‘Use both arms in unison.’
She still veers away, zigzagging, sweating now.
People start to stare. She blushes,
keeps her head down. After ten minutes
she’s heaving, shirt drenched.
I swing over to her."""

    # calculate first chunk time and total time
    start = time.perf_counter()
    count = 0
    async for audio_chunk in tts_service.synthesize(text):
        if count == 0:
            end = time.perf_counter()
            print(f"First chunk time: {end - start}")
            count += 1
        # Here you would typically send the audio_chunk to your audio output
        # For example, you might send it over a websocket, or write it to a file
        # print(f"Received chunk of size: {len(audio_chunk)} bytes")

    print(f"Total time: {time.perf_counter() - start}")

    await tts_service.close()


asyncio.run(main())
