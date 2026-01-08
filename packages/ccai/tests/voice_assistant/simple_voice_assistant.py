import asyncio
import os

from ccai.core.llm.llm_gemini import GeminiLLM
from ccai.core.llm.llm_openai import OpenAILLM
from ccai.core.text_to_speech.tts_polly import AmazonTTSService
from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant
from ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService
from ccai.core.brain.simple_brain import SimpleBrain
from ccai.core.memory.chat_memory import SimpleChatMemory
from ccai.core.audio_interface.local_audio_interface import LocalAudioInterface
from aiodebug import log_slow_callbacks
from tests.tools.tools import function_manager
import cProfile
import pstats
import io
from pstats import SortKey

pr = cProfile.Profile()
pr.enable()

from dotenv import load_dotenv

load_dotenv(override=True)

chat_memory = SimpleChatMemory()

chat_memory.add_system_message(
    content="""Eres un asistente virtual para charlar amigablemente con gente.""",
)


async def main():
    sample_rate = 8000

    audio_interface = LocalAudioInterface(
        sample_rate=sample_rate,
        input_device_index=2,
        output_device_index=3,
    )
    await audio_interface.start()

    input_channel = audio_interface.get_input_service()
    output_channel = audio_interface.get_output_service()

    assistant = SimpleVoiceAssistant(
        stt=DeepgramSTTService(
            api_key=os.getenv("DEEPGRAM_API_KEY"),
            model="nova-2",
            sample_rate=sample_rate,
            language="es-US",
            endpointing=150,
        ),
        brain=SimpleBrain(
            llm=GeminiLLM(
                model="gemini-2.0-flash",
                api_key=os.getenv("GEMINI_API_KEY"),
                temperature=0.0,
            ),
            chat_memory=chat_memory,
            function_manager=function_manager,
        ),
        tts=AmazonTTSService(
            access_key=os.getenv("AWS_ACCESS_KEY_ID"),
            secret_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION"),
            voice_id="Lupe",
            sample_rate=sample_rate,
        ),
        input_channel=input_channel,
        output_channel=output_channel,
    )

    await assistant.start()


if __name__ == "__main__":
    log_slow_callbacks.enable(0.1)
    asyncio.run(main())

    pr.disable()
    s = io.StringIO()
    sortby = SortKey.CUMULATIVE
    ps = pstats.Stats(pr, stream=s).sort_stats(sortby)
    ps.print_stats()
    print(s.getvalue())
