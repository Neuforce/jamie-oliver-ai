# Jamie Oliver AI - Backend

FastAPI backend for the Jamie Oliver AI Cooking Assistant.

## Features

- WebSocket-based voice communication
- Real-time speech-to-text (Deepgram)
- AI-powered conversation (Google Gemini)
- Text-to-speech (ElevenLabs)
- Recipe management tools
- Timer functionality

## Setup

1. Install dependencies:
```bash
poetry install
```

2. Copy `.env.example` to `.env` and fill in your API keys:
```bash
cp .env.example .env
```

3. Run the server:
```bash
poetry run uvicorn src.main:app --reload
```

## API Endpoints

- `GET /` - Health check
- `GET /health` - Detailed health status
- `WS /ws/voice` - WebSocket endpoint for voice conversations

## WebSocket Protocol

The voice WebSocket expects messages in the following format:

### Client → Server

```json
// Start session
{
  "event": "start",
  "sessionId": "unique-session-id",
  "sampleRate": 16000,
  "customParameters": {}
}

// Send audio data
{
  "event": "audio",
  "data": "base64_encoded_pcm_audio"
}

// Stop session
{
  "event": "stop"
}
```

### Server → Client

```json
// Audio response
{
  "event": "audio",
  "data": "base64_encoded_pcm_audio",
  "sampleRate": 16000
}

// Control messages
{
  "event": "control",
  "action": "pause|resume|clear"
}

// Stop signal
{
  "event": "stop"
}
```

