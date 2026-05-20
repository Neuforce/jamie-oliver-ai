# Local development guide — Jamie Oliver AI monorepo

This guide explains how to configure and run the monorepo on your machine.

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **Docker** and Docker Compose (for backend-voice)
- **Poetry** (optional, for Python dependency management)
- **Ollama** (optional, for PDF ingestion with LLM)

## Initial setup

### 1. Clone and configure

```bash
cd jamie-oliver-ai
./scripts/setup.sh
```

This script:

- Installs frontend dependencies (npm)
- Creates virtual environments for backends
- Installs Python dependencies
- Configures the `ccai` package

### 2. Environment variables

Create `.env` files for each app:

**`apps/frontend/.env`:**
```bash
VITE_WS_URL=ws://localhost:8100/ws/voice
VITE_API_BASE_URL=http://localhost:8000
VITE_AUDIO_CAPTURE_ENGINE=auto
VITE_VOICE_BARGE_IN_ENABLED=true
```

**`apps/backend-voice/.env`:**
```bash
OPENAI_API_KEY=your-key
DEEPGRAM_API_KEY=your-key
ELEVENLABS_API_KEY=your-key
ELEVENLABS_VOICE_ID=your-voice-id
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
STT_LANGUAGE=en-US
STT_INTERIM_RESULTS=true
STT_UTTERANCE_END_MS=1000
STT_ENDPOINTING_MS=200
HOST=0.0.0.0
PORT=8100
ENVIRONMENT=development
```

**`apps/backend-search/.env`:**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PYTHON_VERSION=3.11
DEEPGRAM_API_KEY=your-key
ELEVENLABS_API_KEY=your-key
ELEVENLABS_VOICE_ID=vinj1qyMFj0KgswzTjUi
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
STT_LANGUAGE=en-US
STT_INTERIM_RESULTS=true
STT_UTTERANCE_END_MS=1000
STT_ENDPOINTING_MS=250
```

## Running services

### Option 1: All services (recommended)

```bash
./scripts/dev-all.sh
```

The first time you run it, **backend-search** may take several minutes installing dependencies (e.g. **ccai** with build isolation). The script waits up to **180 s** by default; if you need longer: `BACKEND_SEARCH_WAIT_SECS=300 ./scripts/dev-all.sh`. Follow logs: `tail -f logs/backend-search.log`.

Starts:

- Frontend at `http://localhost:3000`
- Backend-Voice at `ws://localhost:8100/ws/voice`
- Backend-Search at `http://localhost:8000`

### Option 2: Individual services

**Frontend:**
```bash
./scripts/dev-frontend.sh
# or
cd apps/frontend && npm run dev
```

**Backend-Voice (Docker):**
```bash
./scripts/dev-backend-voice.sh
# or
cd infrastructure && docker-compose up backend-voice
```

**Backend-Search:**
```bash
./scripts/dev-backend-search.sh
# or
cd apps/backend-search && python -m uvicorn recipe_search_agent.api:app --reload
```

## Directory layout

```
jamie-oliver-ai/
├── apps/
│   ├── frontend/          # React + Vite
│   ├── backend-voice/      # Python FastAPI (Voice)
│   └── backend-search/     # Python FastAPI (Search)
├── packages/
│   └── ccai/              # Voice assistant library
├── data/
│   ├── recipes/           # 55 recipe JSON files (shared)
│   ├── recipes_pdf_input/ # PDFs for ingestion
│   ├── error/             # JSON files with errors
│   └── processed_pdf/      # Processed PDFs
├── infrastructure/
│   └── docker-compose.yml # Docker Compose for development
└── scripts/
    ├── setup.sh           # Initial setup
    ├── dev-all.sh         # Start all services
    ├── dev-frontend.sh    # Frontend only
    ├── dev-backend-voice.sh # backend-voice only
    └── dev-backend-search.sh # backend-search only
```

## Workflow

### 1. Frontend development

```bash
cd apps/frontend
npm run dev
```

- Hot reload enabled
- Recipes loaded from `data/recipes/`
- Connects to local backends

### 2. Backend-Voice development

```bash
cd infrastructure
docker-compose up backend-voice
```

- Hot reload with `--reload`
- Recipes loaded from `data/recipes/`
- WebSocket at `ws://localhost:8100/ws/voice`

### 3. Backend-Search development

```bash
cd apps/backend-search
source .venv/bin/activate
python -m uvicorn recipe_search_agent.api:app --reload
```

- Hot reload enabled
- API at `http://localhost:8000`
- Docs at `http://localhost:8000/docs`

### 4. PDF ingestion

```bash
cd apps/backend-search

# Place PDFs in data/recipes_pdf_input/
cp /path/to/recipe.pdf ../../data/recipes_pdf_input/

# Process with Llama
python -m recipe_pdf_agent_llama.cli run ../../data/recipes_pdf_input

# Result JSON files will be under data/recipes/
```

## Testing

### Frontend
```bash
cd apps/frontend
npm test  # If tests are configured
```

### Backend-Voice
```bash
cd apps/backend-voice
pytest  # or poetry run pytest
```

### Backend-Search

Test dependencies (`pytest`) are in the **`dev`** extra. Install once:

```bash
cd apps/backend-search
poetry install --extras dev
# Alternative without Poetry: pip install -e ".[dev]"
```

Then:

```bash
poetry run pytest tests/test_foundations_services.py -v
```

## Troubleshooting

### Frontend cannot find recipes

- Ensure `data/recipes/` contains JSON files
- Check paths in `apps/frontend/src/data/recipeLoader.ts` (should be `../../../data/recipes/`)

### Backend-Voice does not load recipes

- Ensure Docker can access `data/recipes/` (mounted volume)

### Backend-Search cannot find recipes

- Ensure `project_root` in `search.py` points to `data/recipes/`
- Check relative paths from `apps/backend-search/`

### Backend-Search: `TypeError: Router.__init__() got an unexpected keyword argument 'on_startup'`

This happens if **Starlette 1.x** was installed alongside an older **FastAPI**. `pyproject.toml` pins `starlette<1.0.0`. Reinstall dependencies in `apps/backend-search`:

```bash
cd apps/backend-search
pip install "starlette>=0.40,<0.51"
# or: pip install -e .  (respects pyproject.toml)
```

### Docker Compose does not start

- Ensure Docker Desktop is running
- Check environment variables in `infrastructure/docker-compose.yml`
- Inspect logs: `docker-compose logs backend-voice`

## Useful commands

```bash
# Docker Compose logs
cd infrastructure && docker-compose logs -f backend-voice

# Rebuild Docker image
cd infrastructure && docker-compose build --no-cache backend-voice

# Clean and reinstall frontend dependencies
cd apps/frontend && rm -rf node_modules && npm install

# Clean backend-search virtual environment
cd apps/backend-search && rm -rf .venv && python3 -m venv .venv && source .venv/bin/activate && pip install -e .
```

## Next steps

- See `docs/DEPLOYMENT.md` for production deployment
- See `docs/INGESTION.md` for PDF ingestion guidance
- See `README.md` for a project overview
