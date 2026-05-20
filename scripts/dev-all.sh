#!/bin/bash
# Start all services in local development
# Stops immediately if any service fails to come up

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print error and exit
error_exit() {
    echo -e "${RED}❌ ERROR: $1${NC}" >&2
    echo ""
    echo "🛑 Shutting down started services..."
    cleanup
    exit 1
}

# Cleanup handler
cleanup() {
    cd "$PROJECT_ROOT/infrastructure" 2>/dev/null || true
    if command -v docker-compose &> /dev/null; then
        docker-compose down backend-voice 2>/dev/null || true
    elif command -v docker &> /dev/null; then
        docker compose down backend-voice 2>/dev/null || true
    fi
    pkill -f 'uvicorn.*recipe_search_agent' 2>/dev/null || true
    pkill -f 'vite' 2>/dev/null || true
}

# Trap cleanup on error or interrupt
trap cleanup EXIT INT TERM

echo "🚀 Starting all services in development mode..."
echo "📍 Project root: $PROJECT_ROOT"
echo ""

# Check Python version for backend-search
echo "🔍 Checking Python version..."
PYTHON_CMD="python3"
if command -v python3.12 &> /dev/null; then
    PYTHON_CMD="python3.12"
elif command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
PYTHON_MAJOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")
PYTHON_MINOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.minor)" 2>/dev/null || echo "0")

if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 14 ]; then
    error_exit "Python 3.14+ is not compatible with onnxruntime (required by fastembed).

Detected: $PYTHON_VERSION

Fix: use Python 3.11 or 3.12

With pyenv:
  pyenv install 3.11.9
  pyenv local 3.11.9
  cd apps/backend-search
  python3.11 -m venv .venv
  source .venv/bin/activate
  pip install -e .

Or install Python 3.11/3.12 from your OS and use it directly."
fi

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    error_exit "Python 3.10, 3.11, or 3.12 is required. Detected: $PYTHON_VERSION

Fix: install Python 3.11 or 3.12

With Homebrew (macOS):
  brew install python@3.11
  # then use: python3.11

With pyenv:
  pyenv install 3.11.9
  pyenv local 3.11.9

Then recreate the virtual environment:
  cd apps/backend-search
  rm -rf .venv
  python3.11 -m venv .venv
  source .venv/bin/activate
  pip install -e ."
fi

echo "   ✅ Python version: $PYTHON_VERSION"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    error_exit "Docker is not installed or not on PATH"
fi

# Detectar docker-compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    error_exit "docker-compose is not available"
fi

# ============================================
# 1. Backend-Voice (Docker)
# ============================================
echo "🐳 Starting backend-voice (Docker)..."
cd "$PROJECT_ROOT/infrastructure"

if ! $DOCKER_COMPOSE up -d backend-voice; then
    error_exit "Could not start backend-voice with Docker Compose"
fi

# Wait until the container is running
echo "   ⏳ Waiting for backend-voice container..."
for i in {1..30}; do
    if $DOCKER_COMPOSE ps backend-voice | grep -q "Up"; then
        # Ensure the service responds
        if curl -s http://localhost:8100/health > /dev/null 2>&1 || \
           $DOCKER_COMPOSE logs --tail=5 backend-voice | grep -q "Uvicorn running" 2>/dev/null; then
            echo -e "   ${GREEN}✅ Backend-voice is running${NC}"
            break
        fi
    fi
    if [ $i -eq 30 ]; then
        echo ""
        echo "   Recent container logs:"
        $DOCKER_COMPOSE logs --tail=20 backend-voice
        error_exit "Backend-voice did not become healthy within 30 seconds"
    fi
    sleep 1
done

# ============================================
# 2. Backend-Search
# ============================================
echo ""
echo "🔍 Starting backend-search..."
cd "$PROJECT_ROOT/apps/backend-search"

# Crear o verificar virtual environment
if [ ! -d ".venv" ] && [ ! -d "venv" ]; then
    echo "   📦 No virtual environment found. Creating one..."
    # Prefer Python 3.12 or 3.11 when available
    PYTHON_VENV_CMD="python3"
    if command -v python3.12 &> /dev/null; then
        PYTHON_VENV_CMD="python3.12"
    elif command -v python3.11 &> /dev/null; then
        PYTHON_VENV_CMD="python3.11"
    fi
    
    $PYTHON_VENV_CMD -m venv .venv
    echo "   ✅ Virtual environment created with $($PYTHON_VENV_CMD --version)"
fi

# Activar virtual environment
if [ -d ".venv" ]; then
    source .venv/bin/activate
    # Check Python version inside the venv
    VENV_PYTHON_VERSION=$(python --version 2>&1)
    VENV_PYTHON_MAJOR=$(python -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")
    VENV_PYTHON_MINOR=$(python -c "import sys; print(sys.version_info.minor)" 2>/dev/null || echo "0")
    
    if [ "$VENV_PYTHON_MAJOR" -eq 3 ] && [ "$VENV_PYTHON_MINOR" -ge 14 ]; then
        echo "   ⚠️  Virtual environment uses Python 3.14+ (unsupported). Recreating..."
        rm -rf .venv
        PYTHON_VENV_CMD="python3.12"
        if command -v python3.12 &> /dev/null; then
            PYTHON_VENV_CMD="python3.12"
        elif command -v python3.11 &> /dev/null; then
            PYTHON_VENV_CMD="python3.11"
        else
            error_exit "Python 3.11 or 3.12 not found. Install one of them."
        fi
        $PYTHON_VENV_CMD -m venv .venv
        source .venv/bin/activate
        echo "   ✅ Virtual environment recreated with $($PYTHON_VENV_CMD --version)"
    elif [ "$VENV_PYTHON_MAJOR" -lt 3 ] || ([ "$VENV_PYTHON_MAJOR" -eq 3 ] && [ "$VENV_PYTHON_MINOR" -lt 10 ]); then
        echo "   ⚠️  Virtual environment uses Python < 3.10 (unsupported). Recreating..."
        rm -rf .venv
        PYTHON_VENV_CMD="python3.12"
        if command -v python3.12 &> /dev/null; then
            PYTHON_VENV_CMD="python3.12"
        elif command -v python3.11 &> /dev/null; then
            PYTHON_VENV_CMD="python3.11"
        else
            error_exit "Python 3.11 or 3.12 not found. Install one of them."
        fi
        $PYTHON_VENV_CMD -m venv .venv
        source .venv/bin/activate
        echo "   ✅ Virtual environment recreated with $($PYTHON_VENV_CMD --version)"
    fi
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

# Ensure uvicorn is installed
if ! python -c "import uvicorn" 2>/dev/null; then
    echo "   ⚠️  uvicorn not installed. Installing dependencies..."
    echo "   📦 Updating pip..."
    pip install --upgrade pip > /dev/null 2>&1
    
    # Install onnxruntime first (required by fastembed) — can take a while
    echo "   📦 Installing onnxruntime (may take several minutes)..."
    if pip install "onnxruntime>=1.20.0" 2>&1 | grep -v "Requirement already satisfied" | grep -v "WARNING" | head -5; then
        echo "   ✅ onnxruntime installed"
    else
        # If pinned version fails, try unpinned
        echo "   📦 Trying onnxruntime without a pinned version..."
        pip install onnxruntime 2>&1 | grep -v "Requirement already satisfied" | grep -v "WARNING" | head -5 || true
    fi
    
    # Install dependencies
    echo "   📦 Installing remaining dependencies..."
    if [ -f "pyproject.toml" ]; then
        pip install -e . 2>&1 | tail -10 || pip install -r requirements.txt 2>&1 | tail -10
    else
        pip install -r requirements.txt 2>&1 | tail -10
    fi
    
    # Re-check
    if ! python -c "import uvicorn" 2>/dev/null; then
        error_exit "Could not install uvicorn. Run manually: ./scripts/fix-backend-search.sh"
    fi
    echo "   ✅ Dependencies installed"
fi

# Iniciar en background con log
LOG_FILE="$PROJECT_ROOT/logs/backend-search.log"
mkdir -p "$PROJECT_ROOT/logs"
"$SCRIPT_DIR/dev-backend-search.sh" > "$LOG_FILE" 2>&1 &
BACKEND_SEARCH_PID=$!

echo "   💡 Backend-search runs on your Mac (Python/uvicorn). You will not see it as a container in Docker Desktop:"
echo "      only \"jamie-backend-voice\" is part of this repo's Docker stack."

# Esperar y verificar que el servicio responda
# First run can take several minutes (onnxruntime, pip install -e ., ccai build deps).
BACKEND_SEARCH_WAIT_SECS="${BACKEND_SEARCH_WAIT_SECS:-180}"
echo "   ⏳ Waiting for backend-search (up to ${BACKEND_SEARCH_WAIT_SECS}s; first run is often slower)..."
echo "   📋 Log: tail -f $LOG_FILE"
for i in $(seq 1 "$BACKEND_SEARCH_WAIT_SECS"); do
    RESP=$(curl -sS --max-time 3 "http://localhost:8000/health" 2>/dev/null || true)
    # /health devuelve HTTP 200 incluso con {"status":"unhealthy"}; exigimos status exacto.
    ST=$($PYTHON_CMD -c "import json,sys; \
d=json.loads(sys.stdin.read() or '{}'); \
print(d.get('status',''))" <<< "$RESP" 2>/dev/null || echo "")
    if [ "$ST" = "healthy" ]; then
        echo -e "   ${GREEN}✅ Backend-search is healthy${NC}"
        break
    fi
    # Ensure the process is still running
    if ! kill -0 $BACKEND_SEARCH_PID 2>/dev/null; then
        echo ""
        echo "   Recent logs:"
        tail -20 "$LOG_FILE" 2>/dev/null || echo "   (no hay logs disponibles)"
        error_exit "Backend-search exited unexpectedly"
    fi
    if [ "$i" -eq "$BACKEND_SEARCH_WAIT_SECS" ]; then
        echo ""
        echo "   Recent logs:"
        tail -40 "$LOG_FILE" 2>/dev/null || echo "   (no hay logs disponibles)"
        error_exit "Backend-search timed out after ${BACKEND_SEARCH_WAIT_SECS}s (ccai or onnxruntime still installing? See log above or: tail -f $LOG_FILE)"
    fi
    if [ $((i % 45)) -eq 0 ]; then
        echo "   ... still starting (${i}/${BACKEND_SEARCH_WAIT_SECS}s)"
    fi
    sleep 1
done

# ============================================
# 3. Frontend
# ============================================
echo ""
echo "⚛️  Starting frontend..."
cd "$PROJECT_ROOT/apps/frontend"

# Ensure node_modules exists
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
    echo "   ⚠️  node_modules missing. Installing npm dependencies..."
    npm install
    echo "   ✅ npm dependencies installed"
fi

# Ensure Vite runs (catches type: module issues)
if ! node node_modules/.bin/vite --version > /dev/null 2>&1; then
    echo "   ⚠️  vite no se puede ejecutar. Detectado problema con 'type: module'."
    echo "   🧹 Cleaning and reinstalling dependencies..."
    rm -rf node_modules package-lock.json .vite
    npm install
    # Re-check
    if ! node node_modules/.bin/vite --version > /dev/null 2>&1; then
        error_exit "vite still fails after reinstall. Run manually: ./scripts/fix-frontend.sh"
    fi
    echo "   ✅ Dependencies reinstalled and verified"
fi

# Iniciar en background con log
FRONTEND_LOG_FILE="$PROJECT_ROOT/logs/frontend.log"
"$SCRIPT_DIR/dev-frontend.sh" > "$FRONTEND_LOG_FILE" 2>&1 &
FRONTEND_PID=$!

# Esperar y verificar que el servicio responda
echo "   ⏳ Waiting for frontend..."
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Frontend is running${NC}"
        break
    fi
    # Ensure the process is still running
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo ""
        echo "   Recent logs:"
        tail -20 "$FRONTEND_LOG_FILE" 2>/dev/null || echo "   (no hay logs disponibles)"
        error_exit "Frontend exited unexpectedly"
    fi
    if [ $i -eq 30 ]; then
        echo ""
        echo "   Recent logs:"
        tail -20 "$FRONTEND_LOG_FILE" 2>/dev/null || echo "   (no hay logs disponibles)"
        error_exit "Frontend did not respond within 30 seconds"
    fi
    sleep 1
done

# ============================================
# Resumen final
# ============================================
echo ""
echo -e "${GREEN}✅ All services are running${NC}"
echo ""
echo "📍 Services:"
echo "  - Frontend:        http://localhost:3000"
echo "  - Backend-Voice:   ws://localhost:8100/ws/voice"
echo "  - Backend-Search:  http://localhost:8000  (uvicorn on the host — not a Docker container)"
echo ""
echo "📋 Logs:"
echo "  - Backend-Voice:   docker-compose logs -f backend-voice"
echo "  - Backend-Search:  tail -f logs/backend-search.log"
echo "  - Frontend:        tail -f logs/frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait until the user interrupts
wait
