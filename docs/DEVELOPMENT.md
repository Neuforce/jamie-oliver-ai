# Guía de Desarrollo Local - Jamie Oliver AI Monorepo

Esta guía explica cómo configurar y ejecutar el monorepo en tu máquina local.

## Prerrequisitos

- **Node.js** 18+ y npm
- **Python** 3.11+
- **Docker** y Docker Compose (para backend-voice)
- **Poetry** (opcional, para gestión de dependencias Python)
- **Ollama** (opcional, para ingestion de PDFs con LLM)

## Setup Inicial

### 1. Clonar y Configurar

```bash
cd jamie-oliver-ai
./scripts/setup.sh
```

Este script:
- Instala dependencias del frontend (npm)
- Crea virtual environments para backends
- Instala dependencias Python
- Configura el paquete ccai

### 2. Variables de Entorno

Crea archivos `.env` en cada app:

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

## Ejecutar Servicios

### Opción 1: Todos los Servicios (Recomendado)

```bash
./scripts/dev-all.sh
```

La primera vez, **backend-search** puede tardar varios minutos instalando dependencias (p. ej. **ccai** con build isolation). El script espera hasta **180 s** por defecto; si hace falta más: `BACKEND_SEARCH_WAIT_SECS=300 ./scripts/dev-all.sh`. Seguimiento: `tail -f logs/backend-search.log`.

Inicia:
- Frontend en `http://localhost:3000`
- Backend-Voice en `ws://localhost:8100/ws/voice`
- Backend-Search en `http://localhost:8000`

### Opción 2: Servicios Individuales

**Frontend:**
```bash
./scripts/dev-frontend.sh
# o
cd apps/frontend && npm run dev
```

**Backend-Voice (Docker):**
```bash
./scripts/dev-backend-voice.sh
# o
cd infrastructure && docker-compose up backend-voice
```

**Backend-Search:**
```bash
./scripts/dev-backend-search.sh
# o
cd apps/backend-search && python -m uvicorn recipe_search_agent.api:app --reload
```

## Estructura de Directorios

```
jamie-oliver-ai/
├── apps/
│   ├── frontend/          # React + Vite
│   ├── backend-voice/      # Python FastAPI (Voice)
│   └── backend-search/     # Python FastAPI (Search)
├── packages/
│   └── ccai/              # Voice assistant library
├── data/
│   ├── recipes/           # 55 recetas JSON (usado por todos)
│   ├── recipes_pdf_input/ # PDFs para ingestion
│   ├── error/             # JSONs con errores
│   └── processed_pdf/      # PDFs procesados
├── infrastructure/
│   └── docker-compose.yml # Docker Compose para desarrollo
└── scripts/
    ├── setup.sh           # Setup inicial
    ├── dev-all.sh         # Iniciar todos los servicios
    ├── dev-frontend.sh    # Solo frontend
    ├── dev-backend-voice.sh # Solo backend-voice
    └── dev-backend-search.sh # Solo backend-search
```

## Flujo de Trabajo

### 1. Desarrollo Frontend

```bash
cd apps/frontend
npm run dev
```

- Hot reload automático
- Recetas cargadas desde `data/recipes/`
- Conecta a backends locales

### 2. Desarrollo Backend-Voice

```bash
cd infrastructure
docker-compose up backend-voice
```

- Hot reload con `--reload` flag
- Recetas cargadas desde `data/recipes/`
- WebSocket en `ws://localhost:8100/ws/voice`

### 3. Desarrollo Backend-Search

```bash
cd apps/backend-search
source .venv/bin/activate
python -m uvicorn recipe_search_agent.api:app --reload
```

- Hot reload automático
- API en `http://localhost:8000`
- Documentación en `http://localhost:8000/docs`

### 4. Ingestion de PDFs

```bash
cd apps/backend-search

# Colocar PDFs en data/recipes_pdf_input/
cp /path/to/recipe.pdf ../../data/recipes_pdf_input/

# Procesar con Llama
python -m recipe_pdf_agent_llama.cli run ../../data/recipes_pdf_input

# Los JSONs resultantes estarán en data/recipes/
```

## Testing

### Frontend
```bash
cd apps/frontend
npm test  # Si hay tests configurados
```

### Backend-Voice
```bash
cd apps/backend-voice
pytest  # o poetry run pytest
```

### Backend-Search
Las dependencias de test (`pytest`) están en el extra **`dev`**. Instálalas una vez:

```bash
cd apps/backend-search
poetry install --extras dev
# alternativa sin Poetry: pip install -e ".[dev]"
```

Luego:

```bash
poetry run pytest tests/test_foundations_services.py -v
```

## Troubleshooting

### Frontend no encuentra recetas
- Verifica que `data/recipes/` tenga archivos JSON
- Verifica rutas en `apps/frontend/src/data/recipeLoader.ts` (debe ser `../../../data/recipes/`)

### Backend-Voice no carga recetas
- Verifica que Docker tenga acceso a `data/recipes/` (volumen montado)

### Backend-Search no encuentra recetas
- Verifica que `project_root` en `search.py` apunte a `data/recipes/`
- Verifica que las rutas relativas funcionen desde `apps/backend-search/`

### Backend-Search: `TypeError: Router.__init__() got an unexpected keyword argument 'on_startup'`
Ocurre si **Starlette 1.x** se instaló junto a **FastAPI** antiguo. El `pyproject.toml` fija `starlette<1.0.0`. Reinstalá dependencias en `apps/backend-search`:

```bash
cd apps/backend-search
pip install "starlette>=0.40,<0.51"
# o: pip install -e .  (respeta pyproject.toml)
```

### Docker Compose no inicia
- Verifica que Docker Desktop esté corriendo
- Verifica variables de entorno en `infrastructure/docker-compose.yml`
- Revisa logs: `docker-compose logs backend-voice`

## Comandos Útiles

```bash
# Ver logs de Docker Compose
cd infrastructure && docker-compose logs -f backend-voice

# Reconstruir imagen Docker
cd infrastructure && docker-compose build --no-cache backend-voice

# Limpiar y reinstalar dependencias frontend
cd apps/frontend && rm -rf node_modules && npm install

# Limpiar virtual environment backend-search
cd apps/backend-search && rm -rf .venv && python3 -m venv .venv && source .venv/bin/activate && pip install -e .
```

## Próximos Pasos

- Ver `docs/DEPLOYMENT.md` para despliegue en producción
- Ver `docs/INGESTION.md` para guía de ingestion de PDFs
- Ver `README.md` para overview del proyecto
