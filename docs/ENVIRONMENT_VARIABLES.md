# Environment variables — Jamie Oliver AI monorepo

This document lists all environment variables required for each application in the monorepo.

## 📋 Quick reference

| App | Required variables | Optional variables |
|-----|---------------------|---------------------|
| **Frontend** | `VITE_WS_URL`, `VITE_API_BASE_URL` | `VITE_AUDIO_CAPTURE_ENGINE`, `VITE_VOICE_BARGE_IN_ENABLED` |
| **Backend-Voice** | `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | `ELEVENLABS_MODEL_ID`, `HOST`, `PORT`, `ENVIRONMENT`, `CORS_ORIGINS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Backend-Search** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `PYTHON_VERSION`, `SUPERTAB_*`, `RECIPE_*` (several), `DEEPGRAM_API_KEY`, `ELEVENLABS_*` (Voice Chat) |

---

## 🎨 Frontend (`apps/frontend/`)

### Required variables

```bash
# WebSocket URL for backend-voice
VITE_WS_URL=ws://localhost:8100/ws/voice
# Production: wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice

# Base API URL for backend-search
VITE_API_BASE_URL=http://localhost:8000
# Production: https://your-backend-search-url.vercel.app

# Microphone capture strategy on the frontend
# auto = AudioWorklet when available, with automatic fallback
# worklet = force AudioWorklet and fall back to legacy if the browser does not support it
# legacy = use ScriptProcessorNode temporarily
VITE_AUDIO_CAPTURE_ENGINE=auto

# Voice barge-in rollout
VITE_VOICE_BARGE_IN_ENABLED=true
```

### Description

- **`VITE_WS_URL`**: WebSocket URL for backend-voice for voice communication during cooking mode.
- **`VITE_API_BASE_URL`**: Base URL for backend-search for semantic recipe search.
- **`VITE_AUDIO_CAPTURE_ENGINE`**: Controls microphone capture engine rollout on the frontend. `auto` tries `AudioWorklet` and falls back to `ScriptProcessorNode`.
- **`VITE_VOICE_BARGE_IN_ENABLED`**: Enables the new barge-in flow with continuous capture and voice interruption. If disabled, the app falls back to the conservative behavior of not sending audio while Jamie is busy.

In **`vite dev`**, paywalled recipes can be opened for cooking without Supertab: the client normalizes `locked` → `free` (see Backend-Search / local development section). Production builds need no extra variables for this.

### File

- `.env.example`: `apps/frontend/.env.example`

---

## 🎤 Backend-Voice (`apps/backend-voice/`)

### Required variables

```bash
# OpenAI API Key (LLM)
OPENAI_API_KEY=sk-your-openai-api-key

# Deepgram API Key (Speech-to-Text)
DEEPGRAM_API_KEY=your-deepgram-api-key

# ElevenLabs API Key (Text-to-Speech)
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# ElevenLabs Voice ID (voice selection)
ELEVENLABS_VOICE_ID=vinj1qyMFj0KgswzTjUi

# ElevenLabs model ID (synthesis model selection)
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

### Optional variables

```bash
# Server configuration
HOST=0.0.0.0                    # Default: 0.0.0.0
PORT=8100                       # Default: 8100
ENVIRONMENT=development         # development, staging, production

# CORS origins (comma-separated list)
CORS_ORIGINS=http://localhost:3000,http://localhost:3100,https://your-frontend.vercel.app

# Cooking session persistence (optional, but needed for durable sessions)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Deepgram turn-taking (optional; recommended for voice tuning)
STT_LANGUAGE=en-US
STT_INTERIM_RESULTS=true
STT_UTTERANCE_END_MS=1000
STT_ENDPOINTING_MS=200
```

### Description

- **`OPENAI_API_KEY`**: OpenAI API key for the language model (GPT-4).
- **`DEEPGRAM_API_KEY`**: Deepgram API key for speech-to-text.
- **`STT_LANGUAGE`**: Language Deepgram uses for real-time recognition.
- **`STT_INTERIM_RESULTS`**: Enables partial results to improve turn-taking and interruption detection.
- **`STT_UTTERANCE_END_MS`**: Time after which Deepgram emits `UtteranceEnd` and ends a user turn.
- **`STT_ENDPOINTING_MS`**: Milliseconds of silence before finalizing an utterance. Directly affects how aggressive or patient turn-taking is.
- **`ELEVENLABS_API_KEY`**: ElevenLabs API key for text-to-speech.
- **`ELEVENLABS_VOICE_ID`**: Voice ID in ElevenLabs. The expected value today is `vinj1qyMFj0KgswzTjUi`.
- **`ELEVENLABS_MODEL_ID`**: ElevenLabs TTS model. The expected value today is `eleven_multilingual_v2`.
- **`SUPABASE_URL`**: Supabase URL used to persist cooking session snapshots.
- **`SUPABASE_SERVICE_ROLE_KEY`**: Backend key to create and retrieve persisted sessions.

### File

- `.env.example`: `apps/backend-voice/.env.example`

---

## 🔍 Backend-Search (`apps/backend-search/`)

### Required variables

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Python Version (Vercel)
PYTHON_VERSION=3.11
```

### Local development: paywall bypass (Supertab)

Nothing extra required in production:

- **Frontend (`vite dev`)**: if the API still returns `accessState: locked`, the client treats the recipe as `free` only when `import.meta.env.DEV` is true (does not apply to production builds).
- **Backend-search**: with `ENVIRONMENT=development` (or `dev` / `local`) or `VERCEL_ENV=development`, the `/api/v1/recipes/{id}/access` endpoint maps `locked` responses to `free` so you can test cooking mode. With `ENVIRONMENT=production` or `VERCEL_ENV=production`, this bypass is **never** applied.

```bash
# Local machine or development preview only (optional)
ENVIRONMENT=development
```

### Optional variables — Recipe PDF Agent

```bash
# Logging
RECIPE_PDF_LOG_LEVEL=INFO       # DEBUG, INFO, WARNING, ERROR

# Supabase Table
RECIPE_PDF_SUPABASE_TABLE=recipe_index
```

### Optional variables — Supertab Foundations

```bash
# Supertab IDs/config for recipe monetization
SUPERTAB_CLIENT_ID=test_client.your-client-id
SUPERTAB_PAYWALL_EXPERIENCE_ID=experience.your-paywall-id
SUPERTAB_PURCHASE_BUTTON_EXPERIENCE_ID=experience.your-button-id
```

### Optional variables — Voice Chat (WebSocket)

```bash
# Deepgram (Speech-to-Text)
DEEPGRAM_API_KEY=your-deepgram-api-key

# ElevenLabs (Text-to-Speech)
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_VOICE_ID=your-elevenlabs-voice-id

# Optional: pin model for consistent TTS behavior
ELEVENLABS_MODEL_ID=eleven_multilingual_v2

# Optional: tune Deepgram turn-taking for voice chat
STT_LANGUAGE=en-US
STT_INTERIM_RESULTS=true
STT_UTTERANCE_END_MS=1000
STT_ENDPOINTING_MS=250
```

### Optional variables — Recipe PDF Agent Llama

```bash
# Ollama Configuration (PDF processing with LLM)
RECIPE_LLAMA_OLLAMA_URL=http://localhost:11434
RECIPE_LLAMA_MODEL=llama3.1

# Supabase table for intelligent chunks
RECIPE_LLAMA_SUPABASE_TABLE=intelligent_recipe_chunks

# LangChain Parser (optional)
RECIPE_LLAMA_USE_LANGCHAIN=false
RECIPE_LLAMA_LANGCHAIN_MODEL=llama3.1
RECIPE_LLAMA_LANGCHAIN_NUM_CTX=4096
RECIPE_LLAMA_LANGCHAIN_TEMPERATURE=0.0

# Chunking Optimization (optional)
RECIPE_LLAMA_ENABLE_DENSITY=false
RECIPE_LLAMA_DENSITY_THRESHOLD=0.85

# LLM Enrichment (optional)
RECIPE_LLAMA_ENABLE_LLM_ENRICHMENT=false
RECIPE_LLAMA_ENRICHMENT_MODEL=llama3.1
RECIPE_LLAMA_ENRICHMENT_TIMEOUT=10

# Logging
RECIPE_LLAMA_LOG_LEVEL=INFO
```

### Description

- **`SUPABASE_URL`**: Your Supabase project URL.
- **`SUPABASE_SERVICE_ROLE_KEY`**: Supabase service role key (⚠️ keep secret; never commit to Git).
- **`PYTHON_VERSION`**: Python version for Vercel (3.11 recommended).

The `RECIPE_LLAMA_*` variables are optional and only needed if you use the PDF agent with Ollama to process recipes.

### File

- `.env.example`: `apps/backend-search/.env.example`

---

## 🚀 Environment-specific configuration

### Local development

**Frontend:**
```bash
VITE_WS_URL=ws://localhost:8100/ws/voice
VITE_API_BASE_URL=http://localhost:8000
```

**Backend-Voice:**
```bash
ENVIRONMENT=development
HOST=0.0.0.0
PORT=8100
```

**Backend-Search:**
```bash
RECIPE_LLAMA_OLLAMA_URL=http://localhost:11434
RECIPE_LLAMA_MODEL=llama3.1
```

### Production

**Frontend (Vercel):**
```bash
VITE_WS_URL=wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice
VITE_API_BASE_URL=https://your-backend-search.vercel.app
```

**Backend-Voice (AWS ECS):**
```bash
ENVIRONMENT=production
HOST=0.0.0.0
PORT=8100
```

**Backend-Search (Vercel):**
```bash
PYTHON_VERSION=3.11
# Remaining variables are configured in the Vercel Dashboard
```

---

## 📝 How to configure

### 1. Copy `.env.example` files

```bash
# Frontend
cd apps/frontend
cp .env.example .env

# Backend-Voice
cd ../backend-voice
cp .env.example .env

# Backend-Search
cd ../backend-search
cp .env.example .env
```

### 2. Fill in values

Edit each `.env` file and complete the required values.

### 3. Verify

```bash
# Frontend — confirm variables load
cd apps/frontend
npm run dev
# Check the browser console

# Backend-Voice — verify configuration
cd ../backend-voice
python -c "from src.config.settings import settings; print(settings.validate())"
# Should print True if all keys are set

# Backend-Search — verify Supabase
cd ../backend-search
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('SUPABASE_URL:', os.getenv('SUPABASE_URL')[:20] + '...' if os.getenv('SUPABASE_URL') else 'NOT SET')"
```

---

## 🔒 Security

### ⚠️ Never commit `.env` files to Git

Ensure `.env` is listed in `.gitignore`:

```bash
# .gitignore
.env
.env.local
.env.*.local
```

### ✅ Use `.env.example` as a template

`.env.example` files are safe to commit because they do not contain real secrets.

### 🔐 Sensitive variables

The following variables must **never** be committed:

- `OPENAI_API_KEY`
- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Any other API keys or tokens

---

## 📚 References

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Python-dotenv](https://pypi.org/project/python-dotenv/)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [AWS ECS Environment Variables](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/taskdef-env-vars.html)
