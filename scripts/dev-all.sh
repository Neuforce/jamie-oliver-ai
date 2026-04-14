#!/bin/bash
# Script para iniciar todos los servicios en modo desarrollo
# Se detiene inmediatamente si algún servicio falla

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para mostrar errores y salir
error_exit() {
    echo -e "${RED}❌ ERROR: $1${NC}" >&2
    echo ""
    echo "🛑 Deteniendo servicios iniciados..."
    cleanup
    exit 1
}

# Función de limpieza
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

# Trap para limpieza en caso de error o interrupción
trap cleanup EXIT INT TERM

echo "🚀 Starting all services in development mode..."
echo "📍 Project root: $PROJECT_ROOT"
echo ""

# Verificar versión de Python para backend-search
echo "🔍 Verificando versión de Python..."
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
    error_exit "Python 3.14+ no es compatible con onnxruntime (requerido por fastembed).

Versión detectada: $PYTHON_VERSION

Solución: Usa Python 3.11 o 3.12

Con pyenv:
  pyenv install 3.11.9
  pyenv local 3.11.9
  cd apps/backend-search
  python3.11 -m venv .venv
  source .venv/bin/activate
  pip install -e .

O instala Python 3.11/3.12 del sistema y úsalo directamente."
fi

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    error_exit "Python 3.10, 3.11 o 3.12 es requerido. Versión detectada: $PYTHON_VERSION

Solución: Instala Python 3.11 o 3.12

Con Homebrew (macOS):
  brew install python@3.11
  # Luego usa: python3.11

Con pyenv:
  pyenv install 3.11.9
  pyenv local 3.11.9

Luego recrea el virtual environment:
  cd apps/backend-search
  rm -rf .venv
  python3.11 -m venv .venv
  source .venv/bin/activate
  pip install -e ."
fi

echo "   ✅ Python version: $PYTHON_VERSION"
echo ""

# Verificar Docker
if ! command -v docker &> /dev/null; then
    error_exit "Docker no está instalado o no está en el PATH"
fi

# Detectar docker-compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    error_exit "docker-compose no está disponible"
fi

# ============================================
# 1. Backend-Voice (Docker)
# ============================================
echo "🐳 Starting backend-voice (Docker)..."
cd "$PROJECT_ROOT/infrastructure"

if ! $DOCKER_COMPOSE up -d backend-voice; then
    error_exit "No se pudo iniciar backend-voice con Docker Compose"
fi

# Esperar y verificar que el contenedor esté corriendo
echo "   ⏳ Esperando que el contenedor esté listo..."
for i in {1..30}; do
    if $DOCKER_COMPOSE ps backend-voice | grep -q "Up"; then
        # Verificar que el servicio responda
        if curl -s http://localhost:8100/health > /dev/null 2>&1 || \
           $DOCKER_COMPOSE logs --tail=5 backend-voice | grep -q "Uvicorn running" 2>/dev/null; then
            echo -e "   ${GREEN}✅ Backend-voice está corriendo${NC}"
            break
        fi
    fi
    if [ $i -eq 30 ]; then
        echo ""
        echo "   Últimos logs del contenedor:"
        $DOCKER_COMPOSE logs --tail=20 backend-voice
        error_exit "Backend-voice no respondió después de 30 segundos"
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
    echo "   📦 Virtual environment no encontrado. Creando uno..."
    # Usar Python 3.12 o 3.11 si están disponibles
    PYTHON_VENV_CMD="python3"
    if command -v python3.12 &> /dev/null; then
        PYTHON_VENV_CMD="python3.12"
    elif command -v python3.11 &> /dev/null; then
        PYTHON_VENV_CMD="python3.11"
    fi
    
    $PYTHON_VENV_CMD -m venv .venv
    echo "   ✅ Virtual environment creado con $($PYTHON_VENV_CMD --version)"
fi

# Activar virtual environment
if [ -d ".venv" ]; then
    source .venv/bin/activate
    # Verificar versión de Python en el venv
    VENV_PYTHON_VERSION=$(python --version 2>&1)
    VENV_PYTHON_MAJOR=$(python -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")
    VENV_PYTHON_MINOR=$(python -c "import sys; print(sys.version_info.minor)" 2>/dev/null || echo "0")
    
    if [ "$VENV_PYTHON_MAJOR" -eq 3 ] && [ "$VENV_PYTHON_MINOR" -ge 14 ]; then
        echo "   ⚠️  Virtual environment usa Python 3.14+ (no compatible). Recreando..."
        rm -rf .venv
        PYTHON_VENV_CMD="python3.12"
        if command -v python3.12 &> /dev/null; then
            PYTHON_VENV_CMD="python3.12"
        elif command -v python3.11 &> /dev/null; then
            PYTHON_VENV_CMD="python3.11"
        else
            error_exit "Python 3.11 o 3.12 no encontrado. Instala uno de ellos."
        fi
        $PYTHON_VENV_CMD -m venv .venv
        source .venv/bin/activate
        echo "   ✅ Virtual environment recreado con $($PYTHON_VENV_CMD --version)"
    elif [ "$VENV_PYTHON_MAJOR" -lt 3 ] || ([ "$VENV_PYTHON_MAJOR" -eq 3 ] && [ "$VENV_PYTHON_MINOR" -lt 10 ]); then
        echo "   ⚠️  Virtual environment usa Python < 3.10 (no compatible). Recreando..."
        rm -rf .venv
        PYTHON_VENV_CMD="python3.12"
        if command -v python3.12 &> /dev/null; then
            PYTHON_VENV_CMD="python3.12"
        elif command -v python3.11 &> /dev/null; then
            PYTHON_VENV_CMD="python3.11"
        else
            error_exit "Python 3.11 o 3.12 no encontrado. Instala uno de ellos."
        fi
        $PYTHON_VENV_CMD -m venv .venv
        source .venv/bin/activate
        echo "   ✅ Virtual environment recreado con $($PYTHON_VENV_CMD --version)"
    fi
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

# Verificar que uvicorn esté instalado
if ! python -c "import uvicorn" 2>/dev/null; then
    echo "   ⚠️  uvicorn no está instalado. Instalando dependencias..."
    echo "   📦 Actualizando pip..."
    pip install --upgrade pip > /dev/null 2>&1
    
    # Instalar onnxruntime primero (requerido por fastembed) - puede tardar
    echo "   📦 Instalando onnxruntime (esto puede tardar varios minutos)..."
    if pip install "onnxruntime>=1.20.0" 2>&1 | grep -v "Requirement already satisfied" | grep -v "WARNING" | head -5; then
        echo "   ✅ onnxruntime instalado"
    else
        # Si falla con versión específica, intentar sin versión
        echo "   📦 Intentando instalar onnxruntime sin versión específica..."
        pip install onnxruntime 2>&1 | grep -v "Requirement already satisfied" | grep -v "WARNING" | head -5 || true
    fi
    
    # Instalar dependencias
    echo "   📦 Instalando resto de dependencias..."
    if [ -f "pyproject.toml" ]; then
        pip install -e . 2>&1 | tail -10 || pip install -r requirements.txt 2>&1 | tail -10
    else
        pip install -r requirements.txt 2>&1 | tail -10
    fi
    
    # Verificar nuevamente
    if ! python -c "import uvicorn" 2>/dev/null; then
        error_exit "No se pudo instalar uvicorn. Ejecuta manualmente: ./scripts/fix-backend-search.sh"
    fi
    echo "   ✅ Dependencias instaladas correctamente"
fi

# Iniciar en background con log
LOG_FILE="$PROJECT_ROOT/logs/backend-search.log"
mkdir -p "$PROJECT_ROOT/logs"
"$SCRIPT_DIR/dev-backend-search.sh" > "$LOG_FILE" 2>&1 &
BACKEND_SEARCH_PID=$!

# Esperar y verificar que el servicio responda
# La primera ejecución puede tardar varios minutos (onnxruntime, pip install -e ., ccai con build deps).
BACKEND_SEARCH_WAIT_SECS="${BACKEND_SEARCH_WAIT_SECS:-180}"
echo "   ⏳ Esperando que backend-search esté listo (hasta ${BACKEND_SEARCH_WAIT_SECS}s; la 1ª vez suele tardar más)..."
echo "   📋 Log: tail -f $LOG_FILE"
for i in $(seq 1 "$BACKEND_SEARCH_WAIT_SECS"); do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Backend-search está corriendo${NC}"
        break
    fi
    # Verificar que el proceso aún esté corriendo
    if ! kill -0 $BACKEND_SEARCH_PID 2>/dev/null; then
        echo ""
        echo "   Últimos logs:"
        tail -20 "$LOG_FILE" 2>/dev/null || echo "   (no hay logs disponibles)"
        error_exit "Backend-search se detuvo inesperadamente"
    fi
    if [ "$i" -eq "$BACKEND_SEARCH_WAIT_SECS" ]; then
        echo ""
        echo "   Últimos logs:"
        tail -40 "$LOG_FILE" 2>/dev/null || echo "   (no hay logs disponibles)"
        error_exit "Backend-search no respondió después de ${BACKEND_SEARCH_WAIT_SECS}s (¿ccai u onnxruntime aún instalando? Ver log arriba o: tail -f $LOG_FILE)"
    fi
    if [ $((i % 45)) -eq 0 ]; then
        echo "   ... sigue arrancando (${i}/${BACKEND_SEARCH_WAIT_SECS}s)"
    fi
    sleep 1
done

# ============================================
# 3. Frontend
# ============================================
echo ""
echo "⚛️  Starting frontend..."
cd "$PROJECT_ROOT/apps/frontend"

# Verificar que node_modules existe
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
    echo "   ⚠️  node_modules no encontrado. Instalando dependencias..."
    npm install
    echo "   ✅ Dependencias instaladas"
fi

# Verificar que vite realmente funciona (detecta problemas con type: module)
if ! node node_modules/.bin/vite --version > /dev/null 2>&1; then
    echo "   ⚠️  vite no se puede ejecutar. Detectado problema con 'type: module'."
    echo "   🧹 Limpiando e reinstalando dependencias..."
    rm -rf node_modules package-lock.json .vite
    npm install
    # Verificar nuevamente
    if ! node node_modules/.bin/vite --version > /dev/null 2>&1; then
        error_exit "vite sigue sin funcionar después de reinstalar. Ejecuta manualmente: ./scripts/fix-frontend.sh"
    fi
    echo "   ✅ Dependencias reinstaladas y verificadas"
fi

# Iniciar en background con log
FRONTEND_LOG_FILE="$PROJECT_ROOT/logs/frontend.log"
"$SCRIPT_DIR/dev-frontend.sh" > "$FRONTEND_LOG_FILE" 2>&1 &
FRONTEND_PID=$!

# Esperar y verificar que el servicio responda
echo "   ⏳ Esperando que frontend esté listo..."
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Frontend está corriendo${NC}"
        break
    fi
    # Verificar que el proceso aún esté corriendo
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo ""
        echo "   Últimos logs:"
        tail -20 "$FRONTEND_LOG_FILE" 2>/dev/null || echo "   (no hay logs disponibles)"
        error_exit "Frontend se detuvo inesperadamente"
    fi
    if [ $i -eq 30 ]; then
        echo ""
        echo "   Últimos logs:"
        tail -20 "$FRONTEND_LOG_FILE" 2>/dev/null || echo "   (no hay logs disponibles)"
        error_exit "Frontend no respondió después de 30 segundos"
    fi
    sleep 1
done

# ============================================
# Resumen final
# ============================================
echo ""
echo -e "${GREEN}✅ Todos los servicios están corriendo correctamente${NC}"
echo ""
echo "📍 Services:"
echo "  - Frontend:        http://localhost:3000"
echo "  - Backend-Voice:   ws://localhost:8100/ws/voice"
echo "  - Backend-Search:  http://localhost:8000"
echo ""
echo "📋 Logs:"
echo "  - Backend-Voice:   docker-compose logs -f backend-voice"
echo "  - Backend-Search:  tail -f logs/backend-search.log"
echo "  - Frontend:        tail -f logs/frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"

# Esperar interrupción del usuario
wait
