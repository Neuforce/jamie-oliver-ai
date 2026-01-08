import asyncio
import os

from ccai.core.audio_interface.audio_input.local_audio_input import LocalAudioInput
from ccai.core.audio_interface.audio_output.local_audio_output import LocalAudioOutput
from ccai.core.llm.llm_gemini import GeminiLLM
from ccai.core.llm.llm_openai import OpenAILLM
from ccai.core.logger import set_trace_id, configure_logger
from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant
from ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService
from ccai.core.text_to_speech.tts_polly import AmazonTTSService
from ccai.core.brain.simple_brain import SimpleBrain
from ccai.core.memory.chat_memory import SimpleChatMemory
from aiodebug import log_slow_callbacks
from tests.tools.tools import function_manager
import cProfile
import pstats
import io
from pstats import SortKey

logger = configure_logger(__name__)

pr = cProfile.Profile()
pr.enable()

from dotenv import load_dotenv

load_dotenv(override=True)

chat_memory = SimpleChatMemory()

chat_memory.add_system_message(
    content="""Eres Banky, un asistente virtual de atención al cliente de Bankinter, diseñado para sonar completamente natural y humano.

Objetivo de la llamada:
Contactar por teléfono a potenciales clientes que han solicitado una hipoteca en Madrid, con ingresos mensuales inferiores a cuatro mil quinientos euros, para vivienda habitual.

Datos del usuario:
Nombre completo: Juan Pérez""",
)


async def main():
    set_trace_id()
    logger.debug("Running main")

    sample_rate = 8000

    audio_input_service = LocalAudioInput(
        input_device_index=2,
        sample_rate=sample_rate,
    )
    await audio_input_service.start_client()

    input_channel = audio_input_service.get_audio_stream()

    output_channel = LocalAudioOutput(
        output_device_index=3,
        sample_rate=sample_rate,
    )
    await output_channel.start_client()

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
            # llm=OpenAILLM(
            #     model="gpt-4o-mini",
            #     api_key=os.getenv("OPENAI_API_KEY"),
            #     temperature=0.0,
            # ),
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
        # tts=ElevenLabsTextToSpeech(
        #     api_key=os.getenv("ELEVENLABS_API_KEY"),
        #     voice_id=os.getenv("ELEVENLABS_VOICE_ID"),
        # ),A
        input_channel=input_channel,
        output_channel=output_channel,
    )

    await assistant.start()


async def pre_main():
    tasks = []
    for _ in range(4):
        tasks.append(main())

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    log_slow_callbacks.enable(0.1)
    asyncio.run(pre_main())

    pr.disable()
    s = io.StringIO()
    sortby = SortKey.CUMULATIVE
    ps = pstats.Stats(pr, stream=s).sort_stats(sortby)
    ps.print_stats()
    print(s.getvalue())
