#!/bin/bash
# Script para iniciar el backend-search en modo desarrollo

set -e

cd "$(dirname "$0")/../apps/backend-search"

echo "🚀 Starting backend-search development server..."
echo "📍 Directory: $(pwd)"
echo ""

# Check Python version
PYTHON_CMD="python3"
if command -v python3.12 &> /dev/null; then
    PYTHON_CMD="python3.12"
elif command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
PYTHON_MAJOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.major)" 2>/dev/null)
PYTHON_MINOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.minor)" 2>/dev/null)

if [ "$PYTHON_MAJOR" -eq 3 -a "$PYTHON_MINOR" -ge 14 ]; then
    echo "⚠️  Advertencia: Python 3.14+ no es compatible con onnxruntime"
    echo "   Por favor usa Python 3.11 o 3.12"
    echo "   Versión detectada: $PYTHON_VERSION"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d ".venv" ] && [ ! -d "venv" ]; then
    echo "⚠️  No virtual environment found. Creating one with $PYTHON_CMD..."
    $PYTHON_CMD -m venv .venv
fi

# Activate virtual environment
if [ -d ".venv" ]; then
    source .venv/bin/activate
    # Verificar versión en el venv
    VENV_PYTHON_VERSION=$(python --version 2>&1)
    VENV_PYTHON_MAJOR=$(python -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")
    VENV_PYTHON_MINOR=$(python -c "import sys; print(sys.version_info.minor)" 2>/dev/null || echo "0")
    
    # Si el venv usa Python incompatible, recrearlo
    if [ "$VENV_PYTHON_MAJOR" -eq 3 ] && ([ "$VENV_PYTHON_MINOR" -ge 14 ] || [ "$VENV_PYTHON_MINOR" -lt 10 ]); then
        echo "⚠️  Virtual environment usa Python incompatible ($VENV_PYTHON_VERSION). Recreando..."
        rm -rf .venv
        $PYTHON_CMD -m venv .venv
        source .venv/bin/activate
        echo "✅ Virtual environment recreado"
    fi
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

# Install dependencies if needed
if [ ! -f ".deps-installed" ] || ! python -c "import uvicorn" 2>/dev/null; then
    echo "📦 Installing dependencies..."
    pip install --upgrade pip
    # Install onnxruntime first (required by fastembed)
    echo "   Installing onnxruntime (required by fastembed)..."
    pip install "onnxruntime>=1.20.0" || pip install onnxruntime
    # Try installing with pyproject.toml first, fallback to requirements.txt
    if [ -f "pyproject.toml" ]; then
        pip install -e . || pip install -r requirements.txt
    else
        pip install -r requirements.txt
    fi
    touch .deps-installed
    echo "✅ Dependencies installed"
fi

# Start the server
echo "🌐 Starting FastAPI server on http://localhost:8000"
python -m uvicorn recipe_search_agent.api:app --host 0.0.0.0 --port 8000 --reload
