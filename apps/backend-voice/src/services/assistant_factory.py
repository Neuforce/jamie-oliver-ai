"""Factory for creating voice assistant instances."""

from typing import Optional

from ccai.core.brain.simple_brain import SimpleBrain
from ccai.core.llm.base import BaseLLM
from ccai.core.llm.llm_openai import OpenAILLM
from ccai.core.llm.llm_gemini import GeminiLLM
from ccai.core.llm.llm_groq import GroqLLM
from ccai.core.memory.chat_memory import SimpleChatMemory
from ccai.core.speech_to_text.stt_deepgram import DeepgramSTTService
from ccai.core.text_to_speech.elevenlabs_tts import ElevenLabsTextToSpeech
from ccai.core.voice_assistant.simple_voice_assistant import SimpleVoiceAssistant
from ccai.core.logger import configure_logger

from src.tools.recipe_tools import recipe_function_manager
from src.config import settings, JAMIE_OLIVER_SYSTEM_PROMPT

logger = configure_logger(__name__)


class LLMFactory:
    """Factory for creating LLM instances based on provider configuration."""
    
    # Default models for each provider
    DEFAULT_MODELS = {
        "openai": "gpt-4o",
        "gemini": "gemini-2.0-flash",
        "groq": "llama-3.1-70b-versatile",
    }
    
    @classmethod
    def create(
        cls,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
    ) -> BaseLLM:
        """
        Create an LLM instance based on provider configuration.
        
        Args:
            provider: LLM provider (openai, gemini, groq). Defaults to settings.
            model: Model name. Defaults to settings or provider default.
            temperature: Sampling temperature. Defaults to settings.
            
        Returns:
            Configured LLM instance
            
        Raises:
            ValueError: If provider is not supported or API key is missing
        """
        provider = provider or settings.LLM_PROVIDER
        temperature = temperature if temperature is not None else settings.LLM_TEMPERATURE
        
        logger.info(f"Creating LLM: provider={provider}, model={model or 'default'}, temp={temperature}")
        
        if provider == "openai":
            if not settings.OPENAI_API_KEY:
                raise ValueError("OPENAI_API_KEY is required for OpenAI provider")
            return OpenAILLM(
                api_key=settings.OPENAI_API_KEY,
                model=model or settings.LLM_MODEL or cls.DEFAULT_MODELS["openai"],
                temperature=temperature,
            )
        
        elif provider == "gemini":
            if not settings.GEMINI_API_KEY:
                raise ValueError("GEMINI_API_KEY is required for Gemini provider")
            return GeminiLLM(
                api_key=settings.GEMINI_API_KEY,
                model=model or settings.LLM_MODEL or cls.DEFAULT_MODELS["gemini"],
                temperature=temperature,
            )
        
        elif provider == "groq":
            if not settings.GROQ_API_KEY:
                raise ValueError("GROQ_API_KEY is required for Groq provider")
            return GroqLLM(
                api_key=settings.GROQ_API_KEY,
                model=model or settings.LLM_MODEL or cls.DEFAULT_MODELS["groq"],
                temperature=temperature,
            )
        
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}. Supported: openai, gemini, groq")


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
        
        # Validate required API keys
        if not settings.ELEVENLABS_API_KEY or not settings.ELEVENLABS_API_KEY.strip():
            raise ValueError(
                "ELEVENLABS_API_KEY is required but not set. "
                "Please set it in your environment variables or .env file."
            )
        if not settings.ELEVENLABS_VOICE_ID or not settings.ELEVENLABS_VOICE_ID.strip():
            raise ValueError(
                "ELEVENLABS_VOICE_ID is required but not set. "
                "Please set it in your environment variables or .env file."
            )
        if not settings.DEEPGRAM_API_KEY or not settings.DEEPGRAM_API_KEY.strip():
            raise ValueError(
                "DEEPGRAM_API_KEY is required but not set. "
                "Please set it in your environment variables or .env file."
            )
        if not settings.OPENAI_API_KEY or not settings.OPENAI_API_KEY.strip():
            raise ValueError(
                "OPENAI_API_KEY is required but not set. "
                "Please set it in your environment variables or .env file."
            )
        
        # Initialize chat memory with system prompt
        chat_memory = SimpleChatMemory()
        chat_memory.add_system_message(content=JAMIE_OLIVER_SYSTEM_PROMPT)
        
        # Create LLM using factory (configurable provider)
        llm = LLMFactory.create()
        logger.info(f"Using LLM provider: {settings.LLM_PROVIDER}, model: {settings.LLM_MODEL}")
        
        # Create the voice assistant
        assistant = SimpleVoiceAssistant(
            stt=DeepgramSTTService(
                api_key=settings.DEEPGRAM_API_KEY,
                sample_rate=settings.SAMPLE_RATE,
                language=settings.STT_LANGUAGE,
                endpointing=settings.STT_ENDPOINTING_MS,
            ),
            brain=SimpleBrain(
                llm=llm,
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

