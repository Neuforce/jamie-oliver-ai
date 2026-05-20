# Local backend setup (agent-v0)

How to run the `jamie-oliver-agent-v0` backend locally so `jo-ai-v1` can connect to it.

## Option 1: Docker Compose (recommended)

Simplest way to run the backend locally.

### Prerequisites

- Docker and Docker Compose
- Required API keys

### Steps

1. **Go to the agent-v0 project directory:**
   ```bash
   cd jamie-oliver-agent-v0
   ```

2. **Create `apps/backend/.env`:**
   ```bash
   cd apps/backend
   # If .env.example exists, copy it:
   # cp .env.example .env
   ```

3. **Set variables in `apps/backend/.env`:**
   ```env
   # API keys (REQUIRED)
   OPENAI_API_KEY=your_openai_api_key
   DEEPGRAM_API_KEY=your_deepgram_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id
   
   # Server
   HOST=0.0.0.0
   PORT=8000
   ENVIRONMENT=development
   
   # Langfuse (OPTIONAL — monitoring only)
   # If omitted you may see a warning; the backend still runs
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   LANGFUSE_HOST=https://cloud.langfuse.com
   ```

4. **Run Docker Compose:**
   ```bash
   cd ../../  # back to project root
   docker-compose -f infrastructure/docker-compose.yml up --build
   ```
   
   Optional project name:
   ```bash
   docker-compose -f infrastructure/docker-compose.yml -p jamie-oliver-ai up --build
   ```
   
   (`-p` is optional; it only names the Docker project.)

5. **Check the backend:**
   ```bash
   curl http://localhost:8000/health
   ```

Endpoints:
- **HTTP:** `http://localhost:8000`
- **WebSocket:** `ws://localhost:8000/ws/voice`

---

## Option 2: Poetry (direct)

More setup, more control.

### Prerequisites

- Python 3.11+
- Poetry
- System libraries (see `Dockerfile.dev`)

### Steps

1. **Go to the backend app:**
   ```bash
   cd jamie-oliver-agent-v0/apps/backend
   ```

2. **System deps (macOS):**
   ```bash
   brew install portaudio
   ```

3. **Python deps:**
   ```bash
   poetry install
   ```

4. **Install `ccai` editable:**
   ```bash
   cd ../../packages/ccai
   poetry install
   cd ../../apps/backend
   ```

5. **Create `.env`** (same variables as Option 1).

6. **PYTHONPATH:**
   ```bash
   export PYTHONPATH="/Users/mario.restrepo/www/neuForce/jamie-oliver-agent-v0/apps/backend/src:/Users/mario.restrepo/www/neuForce/jamie-oliver-agent-v0/packages"
   ```

7. **Run:**
   ```bash
   poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
   ```

---

## Point jo-ai-v1 at the local backend

### Option A: Environment variable

1. **Create or edit `jo-ai-v1/.env.local`:**
   ```env
   VITE_WS_URL=ws://localhost:8000/ws/voice
   ```

2. **Restart dev server:**
   ```bash
   cd jo-ai-v1
   npm run dev
   ```

### Option B: Hard-code fallback

In `jo-ai-v1/src/hooks/useWebSocket.ts` (or wherever the WS URL is built):

```typescript
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/voice';
```

---

## Verify connectivity

### 1. WebSocket test script

```bash
cd jo-ai-v1
npm run test:websocket ws://localhost:8000/ws/voice
```

Or:
```bash
npm run test:websocket
```

Then type `connect` at the prompt.

### 2. Browser

1. Open jo-ai-v1
2. DevTools (F12) → Network → WS
3. Start a cooking session
4. You should see `ws://localhost:8000/ws/voice`

---

## Troubleshooting

### "Connection refused" / `ECONNREFUSED`

- Backend running? `curl http://localhost:8000/health`
- Port 8000 free? `lsof -i :8000`
- Docker: `docker ps`

### WebSocket closed, code 1006

- Backend should listen on `0.0.0.0:8000`, not only `127.0.0.1`
- Check backend CORS
- Read backend logs

### "Failed to start Deepgram connection" / HTTP 401**

- Valid `DEEPGRAM_API_KEY` in `apps/backend/.env`
- No stray spaces in the value
- Restart containers after changing `.env`:
  ```bash
  docker-compose -f infrastructure/docker-compose.yml down
  docker-compose -f infrastructure/docker-compose.yml up --build
  ```

### Warning: Langfuse without `public_key`

- Harmless if you do not use Langfuse
- To enable tracing, set `LANGFUSE_*` in `apps/backend/.env`
- Otherwise ignore

### "Module not found" with Poetry

- `ccai` installed editable
- `PYTHONPATH` correct
- `poetry install` in both `apps/backend` and `packages/ccai`

### Backend hangs / no response

- Read logs
- Confirm all API keys
- `.env` path: `apps/backend/.env`

---

## Required environment variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `OPENAI_API_KEY` | GPT | Yes |
| `DEEPGRAM_API_KEY` | STT | Yes |
| `ELEVENLABS_API_KEY` | TTS | Yes |
| `ELEVENLABS_VOICE_ID` | Voice | Yes |
| `HOST` | Bind address (default `0.0.0.0`) | No |
| `PORT` | Port (default `8000`) | No |
| `ENVIRONMENT` | e.g. `development` | No |

---

## Useful commands

### Docker Compose

```bash
docker-compose -f infrastructure/docker-compose.yml up --build
docker-compose -f infrastructure/docker-compose.yml up -d --build
docker-compose -f infrastructure/docker-compose.yml logs -f backend
docker-compose -f infrastructure/docker-compose.yml down
docker-compose -f infrastructure/docker-compose.yml build --no-cache
```

If you used `-p jamie-oliver-ai`, add it to these commands too.

### Poetry

```bash
poetry install
poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
poetry run python -c "from src.config.settings import settings; print(settings.validate())"
```

---

## Notes

- Default port **8000**
- WebSocket path `/ws/voice`
- CORS must allow your frontend origin
- With `--reload`, code changes restart the server
