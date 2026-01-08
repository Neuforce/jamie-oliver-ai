"""Application settings and configuration."""

import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Load environment variables from multiple possible locations
# Priority order:
# 1. Variables already in environment (from docker-compose env_file or shell) - highest priority
# 2. Variables from apps/backend-voice/.env (for local development and Docker)
# 3. Variables from .env in project root (fallback)
# 4. Variables from .env in current directory (last resort)

# Get the project root (assuming we're in apps/backend-voice/src/config/)
# From src/config/ -> src/ -> apps/backend-voice/ -> apps/ -> project root
_current_file = Path(__file__).resolve()
_project_root = _current_file.parent.parent.parent.parent.parent
_backend_voice_dir = _current_file.parent.parent.parent

# List of possible .env file locations (in priority order)
env_files = [
    _backend_voice_dir / ".env",  # apps/backend-voice/.env (preferred)
    _project_root / ".env",        # Root .env (fallback)
    Path.cwd() / ".env",           # Current directory .env (last resort)
]

# Load .env files in order, but don't override existing environment variables
# This ensures that variables passed by docker-compose take precedence
loaded_from = None
for env_file in env_files:
    if env_file.exists():
        load_dotenv(env_file, override=False)
        loaded_from = str(env_file)
        break  # Stop after finding the first .env file

# Debug: Log where we loaded from (only in development)
if os.getenv("ENVIRONMENT", "").lower() == "development" and loaded_from:
    import logging
    logger = logging.getLogger(__name__)
    logger.debug(f"Loaded .env from: {loaded_from}")


class Settings:
    """Application settings container."""
    
    # API Configuration
    # Try to get from environment, with fallback to empty string
    # The load_dotenv() above should have loaded these from .env files
    # Use .strip() to remove any whitespace that might cause issues
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    DEEPGRAM_API_KEY: str = os.getenv("DEEPGRAM_API_KEY", "").strip()
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "").strip()
    ELEVENLABS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
    
    # Server Configuration
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8100"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # CORS Configuration
    _default_cors = ",".join(
        [
            "http://localhost:3100",
            "https://localhost:3100",
            "http://127.0.0.1:3100",
            "https://jamie-oliver-agent-v0.vercel.app",
            "https://jamie-frontend.vercel.app",
            "https://jamie.neuforce.ai",
        ]
    )
    CORS_ORIGINS: List[str] = os.getenv("CORS_ORIGINS", _default_cors).split(",")
    
    # Audio Configuration
    SAMPLE_RATE: int = 16000  # 16kHz - standard for speech recognition
    
    # STT Configuration (Deepgram)
    STT_LANGUAGE: str = "en-US"
    STT_ENDPOINTING_MS: int = 200  # milliseconds of silence before considering speech complete
    
    # LLM Configuration (OpenAI)
    LLM_MODEL: str = "gpt-4.1"
    LLM_TEMPERATURE: float = 0.0  # Deterministic for consistent cooking instructions
    
    # TTS Configuration (ElevenLabs)
    TTS_SPEED: float = 1.1  # Slightly faster for natural flow
    TTS_OUTPUT_FORMAT: str = "pcm_16000"  # PCM at 16kHz - matches input sample rate
    
    # App Metadata
    APP_TITLE: str = "Jamie Oliver AI Cooking Assistant"
    APP_DESCRIPTION: str = "Voice-powered cooking assistant backend"
    APP_VERSION: str = "0.1.0"

    # Recipe configuration
    RECIPES_SOURCE: str = os.getenv("RECIPES_SOURCE", "local").lower()
    RECIPES_DIR: str = os.getenv(
        "RECIPES_DIR",
        str(Path(__file__).resolve().parent.parent.parent.parent / "data" / "recipes")
    )
    RECIPES_MANIFEST_URL: str = os.getenv("RECIPES_MANIFEST_URL", "")
    RECIPES_DEFAULT_ID: str = os.getenv("RECIPES_DEFAULT_ID", "")
    
    def validate(self) -> bool:
        """Validate that required settings are present."""
        required = [
            self.OPENAI_API_KEY,
            self.DEEPGRAM_API_KEY,
            self.ELEVENLABS_API_KEY,
            self.ELEVENLABS_VOICE_ID,
        ]
        return all(required)


# Global settings instance
settings = Settings()

