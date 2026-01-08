"""Factory for creating voice assistant instances."""

from ccai.core.brain.simple_brain import SimpleBrain
from ccai.core.llm.llm_openai import OpenAILLM
from ccai.core.memory.chat_memory import SimpleChatMemory
from ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService
from ccai.core.text_to_speech.elevenlabs_tts import ElevenLabsTextToSpeech
from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant
from ccai.core.logger import configure_logger

from src.tools.recipe_tools import recipe_function_manager
from src.config import settings, JAMIE_OLIVER_SYSTEM_PROMPT

logger = configure_logger(__name__)


class AssistantFactory:
    """Factory for creating voice assistant instances."""
    
    @staticmethod
    def create_voice_assistant(
        input_channel,
        output_channel,
    ) -> SimpleVoiceAssistant:
        """
        Create a configured voice assistant instance.
        
        Args:
            input_channel: Audio input channel (generator)
            output_channel: Audio output service
            
        Returns:
            Configured SimpleVoiceAssistant instance
        """
        logger.info("Creating voice assistant")
        
        # Initialize chat memory with system prompt
        chat_memory = SimpleChatMemory()
        chat_memory.add_system_message(content=JAMIE_OLIVER_SYSTEM_PROMPT)
        
        # Create the voice assistant
        assistant = SimpleVoiceAssistant(
            stt=DeepgramSTTService(
                api_key=settings.DEEPGRAM_API_KEY,
                sample_rate=settings.SAMPLE_RATE,
                language=settings.STT_LANGUAGE,
                endpointing=settings.STT_ENDPOINTING_MS,
            ),
            brain=SimpleBrain(
                llm=OpenAILLM(
                    model=settings.LLM_MODEL,
                    api_key=settings.OPENAI_API_KEY,
                    temperature=settings.LLM_TEMPERATURE,
                ),
                chat_memory=chat_memory,
                function_manager=recipe_function_manager,
            ),
            tts=ElevenLabsTextToSpeech(
                api_key=settings.ELEVENLABS_API_KEY,
                voice_id=settings.ELEVENLABS_VOICE_ID,
                speed=settings.TTS_SPEED,
                output_format=settings.TTS_OUTPUT_FORMAT,
            ),
            input_channel=input_channel,
            output_channel=output_channel,
        )
        
        logger.info("Voice assistant created successfully")
        return assistant

