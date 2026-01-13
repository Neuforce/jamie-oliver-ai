# Jamie Oliver AI 🍳

A voice-powered AI cooking assistant that guides you through recipes step-by-step, powered by OpenAI, Deepgram, and ElevenLabs.

## Overview

Jamie Oliver AI is a full-stack application that provides an interactive cooking experience through voice and text. Users can discover recipes, get ingredient lists, and receive real-time cooking guidance with voice instructions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│                      http://localhost:3000                       │
└─────────────────────┬───────────────────────┬───────────────────┘
                      │                       │
                      │ WebSocket             │ REST API
                      │ (Voice)               │ (Search + Recipes)
                      ▼                       ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│     Backend-Voice           │   │     Backend-Search          │
│     (FastAPI + WebSocket)   │   │     (FastAPI + REST)        │
│     ws://localhost:8100     │   │     http://localhost:8000   │
│                             │   │                             │
│  ┌─────────────────────┐    │   │  ┌─────────────────────┐    │
│  │ Deepgram (STT)      │    │   │  │ Supabase (Source)   │    │
│  │ OpenAI GPT-4        │    │   │  │ - recipes table     │    │
│  │ ElevenLabs (TTS)    │    │   │  │ - recipe_index      │    │
│  │ Recipe Engine       │    │   │  │ - recipe_chunks     │    │
│  └─────────────────────┘    │   │  └─────────────────────┘    │
└─────────────────────────────┘   └─────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │         Supabase (PostgreSQL)        │
                    │     Single Source of Truth           │
                    │                                      │
                    │  recipes          - Full recipe JSON │
                    │  recipe_versions  - Version history  │
                    │  recipe_index     - Search metadata  │
                    │  recipe_chunks    - Embeddings       │
                    └─────────────────────────────────────┘
```

### Data Flow

1. **Recipe Management**: Recipes are stored in Supabase `recipes` table with full JSON
2. **Recipe Enhancement**: LLM pipeline enriches recipes with semantic step IDs, timer detection, conversational messages
3. **Search**: `recipe_index` and `recipe_chunks` tables enable semantic search via pgvector
4. **Frontend**: Fetches recipes from Backend-Search API, streams voice through Backend-Voice WebSocket
5. **Voice Agent**: Recipe Engine manages step progression, timers, and state

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, Tailwind CSS, Radix UI |
| **Backend-Voice** | Python 3.11, FastAPI, WebSockets |
| **Backend-Search** | Python 3.11, FastAPI, Supabase, pgvector |
| **AI Services** | OpenAI GPT-4, Deepgram STT, ElevenLabs TTS |
| **Infrastructure** | Docker, Docker Compose |
| **Shared Packages** | ccai (voice assistant library) |

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Python 3.11+ (optional, for running without Docker)

### 1. Clone and Configure

```bash
git clone https://github.com/Neuforce/jamie-oliver-ai.git
cd jamie-oliver-ai
```

### 2. Set Up Environment Variables

Create `.env` files for each service:

**`apps/frontend/.env`**
```bash
VITE_WS_URL=ws://localhost:8100/ws/voice
VITE_API_BASE_URL=http://localhost:8000
```

**`apps/backend-voice/.env`**
```bash
OPENAI_API_KEY=your-openai-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_VOICE_ID=your-voice-id
HOST=0.0.0.0
PORT=8100
ENVIRONMENT=development
```

**`apps/backend-search/.env`**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PYTHON_VERSION=3.11
```

### 3. Start Services

**Option A: All services with Docker (Recommended)**
```bash
# Install frontend dependencies
cd apps/frontend && npm install && cd ../..

# Start backend services
cd infrastructure && docker-compose up -d

# Start frontend
cd ../apps/frontend && npm run dev
```

**Option B: Use the dev script**
```bash
./scripts/dev-all.sh
```

### 4. Access the Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend-Voice Health | http://localhost:8100/health |
| Backend-Search API Docs | http://localhost:8000/docs |

## Project Structure

```
jamie-oliver-ai/
├── apps/
│   ├── frontend/           # React + Vite application
│   ├── backend-voice/      # Voice AI service (WebSocket)
│   └── backend-search/     # Recipe search API (REST)
├── packages/
│   └── ccai/               # Shared voice assistant library
├── data/
│   └── recipes/            # Recipe JSON files
├── docs/                   # Project documentation
├── infrastructure/         # Docker Compose configuration
└── scripts/                # Development utilities
```

## Documentation

| Document | Description |
|----------|-------------|
| [Development Guide](docs/DEVELOPMENT.md) | Local setup and development workflow |
| [Environment Variables](docs/ENVIRONMENT_VARIABLES.md) | All required environment variables |
| [Backend-Search Docs](apps/backend-search/docs/README.md) | Search API documentation |
| [Backend-Voice Docs](apps/backend-voice/README.md) | Voice service documentation |
| [Frontend Docs](apps/frontend/README.md) | Frontend application guide |

## Development

### Running Tests

```bash
# Backend-Voice
cd apps/backend-voice && pytest

# Backend-Search
cd apps/backend-search && pytest

# Frontend (if configured)
cd apps/frontend && npm test
```

### Useful Commands

```bash
# View Docker logs
docker-compose logs -f backend-voice
docker-compose logs -f backend-search

# Restart a service
docker-compose restart backend-voice

# Rebuild after code changes
docker-compose build --no-cache backend-voice
```

## Recipe Data Management

### Enhancement Pipeline

Recipes go through an LLM-powered enhancement pipeline that:
- Converts generic step IDs (`step_1`) to semantic IDs (`preheat_oven`)
- Detects timer steps and extracts durations
- Adds `requires_confirm: true` for active cooking steps
- Generates conversational `on_enter.say` messages in Jamie Oliver's style

```bash
# Enhance and upload recipes to Supabase
cd apps/backend-search
python -m recipe_pipeline.migrate --source-dir ../../data/recipes --enhance

# Publish all draft recipes
curl -X POST http://localhost:8000/api/v1/recipes/publish-all
```

### Recipe Quality Scoring

| Score | Quality Level |
|-------|---------------|
| 90-100 | Excellent - Ready for production |
| 70-89 | Good - May need minor improvements |
| < 70 | Needs enhancement |

## API Endpoints

### Backend-Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/recipes/search` | Semantic recipe search |
| `GET` | `/api/v1/recipes/{id}` | Get recipe by ID |
| `GET` | `/api/v1/recipes` | List recipes with filters |
| `POST` | `/api/v1/recipes/publish-all` | Publish all draft recipes |
| `GET` | `/health` | Health check |

### Backend-Voice

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:8100/ws/voice` | WebSocket for voice interaction |
| `GET /health` | Health check |

## Contributing

Please read our [Contributing Guide](CONTRIBUTING.md) for details on:
- Branch naming conventions
- Commit message format
- Pull request process
- Code standards

## License

Proprietary - Neuforce AI

## Team

- **Project Lead:** Aníbal Abarca Gil
- **Linear Project:** [Supertab - JamieOliverAI](https://linear.app/neuforce/project/supertab-jamieoliverai-41f9c9877729)
