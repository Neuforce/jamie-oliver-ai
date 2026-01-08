# Voice Assistant Project

## Overview

This project implements a modular and extensible voice assistant system capable of processing audio input, converting
speech to text, generating responses using language models, and converting text back to speech.

## Core Components

### 1. Voice Assistant

The main entry point of the system is the `SimpleVoiceAssistant` class.

**Path:** `ccai/core/voice_assistant/simple_voice_assistant.py`

This class orchestrates the interaction between various components:

- Speech-to-Text (STT)
- Brain (for processing and generating responses)
- Text-to-Speech (TTS)
- Audio Input
- Audio Output

### 2. Speech-to-Text (STT)

The STT component converts audio input into text.

**Base Class:** `ccai/core/speech_to_text/base.py`
**Implementation:** `ccai/core/speech_to_text/stt_deepgram.py`

### 3. Brain

The Brain component processes user input and generates responses.

**Base Class:** `ccai/core/brain/base.py`
**Implementation:** `ccai/core/brain/simple_brain.py`

### 4. Text-to-Speech (TTS)

The TTS component converts text responses back into speech.

**Base Class:** `ccai/core/text_to_speech/base.py`
**Implementations:**

- Amazon Polly: `ccai/core/text_to_speech/tts_polly.py`
- Azure TTS: `ccai/core/text_to_speech/tts_azure.py`
- ElevenLabs TTS: `ccai/core/text_to_speech/elevenlabs_tts.py`
- Cartesia TTS: `ccai/core/text_to_speech/tts_cartesia.py`

### 5. Audio Input

The audio input component captures audio from the user.

**Base Class:** `ccai/core/audio_input/audio_input_service.py`
**Implementation:** `ccai/core/audio_input/local_audio_input.py`

### 6. Audio Output

The audio output component plays synthesized speech.

**Base Class:** `ccai/core/audio_output/audio_output_service.py`
**Implementation:** `ccai/core/audio_output/local_audio_output.py`

## Additional Components

### Language Models (LLMs)

The system supports multiple language models.

**Base Class:** `ccai/core/llm/base.py`
**Implementations:**

- OpenAI GPT: `ccai/core/llm/llm_openai.py`
- Groq LLM: `ccai/core/llm/llm_groq.py`

### Function Management

The function management system allows the voice assistant to execute predefined functions.

**Base Class:** `ccai/core/function_manager/base.py`
**Implementation:** `ccai/core/function_manager/function_manager.py`

### Chat Memory

The chat memory component stores conversation history.

**Base Class:** `ccai/core/memory/base.py`
**Implementation:** `ccai/core/memory/chat_memory.py`

## System Interaction Flow

1. The `SimpleVoiceAssistant` initializes all components.
2. Audio input is captured using the `LocalAudioInput` service.
3. The audio is sent to the `DeepgramSTTService` for transcription.
4. The transcribed text is processed by the `SimpleBrain`.
5. The generated response is sent to the TTS service.
6. The synthesized speech is played using the `LocalAudioOutput` service.

## Extensibility

The system is designed to be easily extensible:

- New STT, TTS, or LLM services can be added by implementing the respective base classes.
- Additional functions can be registered with the `FunctionManager` using the `@register_function` decorator.
- Different audio input or output methods can be implemented by extending the respective base classes.

## Configuration and Environment

The project uses environment variables for configuration, loaded using `dotenv`. Ensure that a `.env` file is present
with the necessary API keys and configuration options.

## Testing

Test files are provided for various components, allowing for isolated testing of each part of the system. For example:

**Path:** `tests/voice_assistant/simple_voice_assistant.py`

This test file demonstrates how to set up and run the voice assistant with specific configurations.

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```
   poetry install
   ```
3. Set up your `.env` file with necessary API keys and configurations
4. Run the voice assistant:
   ```
   python tests/voice_assistant/simple_voice_assistant.py
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Specify your license here]