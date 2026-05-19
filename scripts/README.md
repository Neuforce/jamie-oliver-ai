# Development scripts

Helper scripts for local development in the monorepo.

## Available scripts

### `setup.sh`

Initial monorepo setup. Installs all dependencies.

```bash
./scripts/setup.sh
```

**What it does:**

- Installs frontend npm dependencies
- Creates Python virtual environments for backends
- Installs Python dependencies (Poetry or pip)
- Configures the `ccai` package
- Makes shell scripts executable

---

### `logs.sh`

View development service logs.

```bash
# All services
./scripts/logs.sh all

# Single service
./scripts/logs.sh voice        # Backend-voice (Docker)
./scripts/logs.sh search       # Backend-search
./scripts/logs.sh frontend     # Frontend

# Follow logs in real time
./scripts/logs.sh voice -f     # Backend-voice with follow
./scripts/logs.sh search -f    # Backend-search with follow
./scripts/logs.sh frontend -f   # Frontend with follow

# Help
./scripts/logs.sh help
```

**Notes:**

- `backend-search` and `frontend` logs go to `logs/backend-search.log` and `logs/frontend.log`
- `backend-voice` logs come from Docker Compose directly
- Use `-f` or `--follow` to tail logs live

---

### `dev-all.sh`

Starts every service in development mode.

```bash
./scripts/dev-all.sh
```

**What it starts:**

- Frontend at `http://localhost:3000`
- Backend-Voice (Docker) at `ws://localhost:8100/ws/voice`
- Backend-Search at `http://localhost:8000`

**Note:** Press `Ctrl+C` to stop all services.

---

### `dev-frontend.sh`

Starts the frontend only.

```bash
./scripts/dev-frontend.sh
```

Equivalent to:

```bash
cd apps/frontend && npm run dev
```

---

### `dev-backend-voice.sh`

Starts backend-voice only via Docker Compose.

```bash
./scripts/dev-backend-voice.sh
```

Equivalent to:

```bash
cd infrastructure && docker-compose up backend-voice
```

**Requirements:**

- Docker Desktop running
- Environment variables configured in `infrastructure/docker-compose.yml`

---

### `dev-backend-search.sh`

Starts backend-search only.

```bash
./scripts/dev-backend-search.sh
```

**What it does:**

- Creates a virtual environment if missing
- Installs dependencies if needed
- Starts the FastAPI server with hot reload

Equivalent to:

```bash
cd apps/backend-search
source .venv/bin/activate
python -m uvicorn recipe_search_agent.api:app --reload
```

---

### `publish_now.py`

Publishes all recipes from draft to published status.

```bash
python scripts/publish_now.py
```

**What it does:**

- Connects to Supabase using credentials from `apps/backend-search/.env`
- Updates every recipe with `status != 'published'` to `published`
- Prints a summary by status

**Alternative via API:**

```bash
curl -X POST http://localhost:8000/api/v1/recipes/publish-all
```

---

### `linear.sh`

Linear integration: list issues by state, create issues, and get issue details.

**Setup:** copy `scripts/.env.example` to `scripts/.env` and add your Linear API key (Settings → API). Do not use a `Bearer ` prefix.

```bash
# List issues (all non-completed/non-canceled)
./scripts/linear.sh list

# List by state
./scripts/linear.sh list Backlog
./scripts/linear.sh list "In Progress"

# Create an issue
./scripts/linear.sh create "Issue title" "Optional description"

# Get issue details
./scripts/linear.sh get NEU-470
```

---

### `session_cleanup.sh`

Script to commit session changes with appropriate messages.

```bash
./scripts/session_cleanup.sh
```

**What it does:**

- Groups changes into logical commits
- Uses conventional commits format
- Shows a summary of commits created

---

## Recommended usage

### First-time setup

```bash
# 1. Initial setup
./scripts/setup.sh

# 2. Configure environment variables
# Edit apps/frontend/.env
# Edit apps/backend-voice/.env
# Edit apps/backend-search/.env

# 3. Start all services
./scripts/dev-all.sh
```

### Daily development

```bash
# Option A: All services
./scripts/dev-all.sh

# Option B: Only what you need
./scripts/dev-frontend.sh
# or
./scripts/dev-backend-voice.sh
# or
./scripts/dev-backend-search.sh
```

---

## Troubleshooting

### Scripts not executable

```bash
chmod +x scripts/*.sh
```

### Docker not running

```bash
# macOS: open Docker Desktop
# Linux: sudo systemctl start docker
```

### Virtual environment not created

```bash
# Ensure Python 3.11+ is installed
python3 --version

# Create manually
cd apps/backend-search
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### Dependencies fail to install

```bash
# Frontend
cd apps/frontend && rm -rf node_modules && npm install

# Backend-Search
cd apps/backend-search
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

---

## Notes

- Scripts assume you run them from the monorepo root
- Scripts use relative paths — run from the correct directory
- `dev-all.sh` may need permission to spawn multiple background processes
