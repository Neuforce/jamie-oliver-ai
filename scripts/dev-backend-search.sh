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
if [ ! -f ".deps-installed" ] || ! python -c "import uvicorn" 2>/dev/null || ! python -c "import ccai" 2>/dev/null; then
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
    # Install ccai package (required for chat agent)
    # Note: pyaudio is optional and may fail on macOS, but backend-search doesn't need it
    echo "   Installing ccai package..."
    cd ../../packages/ccai

    # Try to install portaudio first (required for pyaudio on macOS)
    # This helps pyaudio install successfully, but if it fails, that's OK
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! brew list portaudio &>/dev/null 2>&1; then
            echo "   Installing portaudio via Homebrew (helps with pyaudio, but optional)..."
            brew install portaudio 2>/dev/null || echo "   ⚠️  Could not install portaudio (this is OK)"
        fi
    fi

    # Install ccai - pyaudio is now optional, so installation should succeed even if pyaudio fails
    echo "   Installing ccai (pyaudio is optional and may fail on macOS)..."
    if pip install -e . 2>&1 | tee /tmp/ccai_install.log; then
        echo "   ✅ ccai installed successfully"
    else
        # Check if the error was due to pyaudio
        if grep -q "Failed to build pyaudio\|pyaudio.*error\|pyaudio.*failed" /tmp/ccai_install.log; then
            echo "   ⚠️  pyaudio installation failed (this is OK - backend-search doesn't need it)"
            echo "   Installing ccai without pyaudio..."
            # Install ccai package without dependencies first
            pip install -e . --no-deps 2>/dev/null || true
            # Then install dependencies manually, excluding pyaudio
            pip install "pydantic>=2.9.2" "docstring-parser>=0.16" "certifi>=2024.8.30" \
                "deepgram-sdk>=3.7.6" "mailjet-rest>=1.4.0" "langfuse>=3.3.0" 2>/dev/null || true
            echo "   ✅ ccai installed (pyaudio skipped - not needed for backend-search)"
        else
            echo "   ❌ Installation failed for unknown reason. Check the error above."
            cat /tmp/ccai_install.log
            exit 1
        fi
    fi
    rm -f /tmp/ccai_install.log

    cd ../../apps/backend-search
    touch .deps-installed
    echo "✅ Dependencies installed"
fi

# Verify ccai is installed before starting (pyaudio is optional)
if ! python -c "import ccai" 2>/dev/null; then
    echo "⚠️  ccai package not found. Installing..."
    cd ../../packages/ccai

    # Try to install portaudio first on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! brew list portaudio &>/dev/null 2>&1; then
            echo "   Installing portaudio via Homebrew..."
            brew install portaudio 2>/dev/null || true
        fi
    fi

    # Install ccai - try normal install first, fallback if pyaudio fails
    if pip install -e . 2>&1 | tee /tmp/ccai_install.log; then
        echo "   ✅ ccai installed"
    else
        if grep -q "Failed to build pyaudio\|pyaudio.*error\|pyaudio.*failed" /tmp/ccai_install.log; then
            echo "   ⚠️  pyaudio failed, installing ccai without it..."
            pip install -e . --no-deps 2>/dev/null || true
            pip install "pydantic>=2.9.2" "docstring-parser>=0.16" "certifi>=2024.8.30" \
                "deepgram-sdk>=3.7.6" "mailjet-rest>=1.4.0" "langfuse>=3.3.0" 2>/dev/null || true
        else
            echo "   ❌ Installation failed. Check the error above."
            cat /tmp/ccai_install.log
        fi
    fi
    rm -f /tmp/ccai_install.log

    cd ../../apps/backend-search
    echo "✅ ccai package installed"
fi

# Start the server
echo "🌐 Starting FastAPI server on http://localhost:8000"
python -m uvicorn recipe_search_agent.api:app --host 0.0.0.0 --port 8000 --reload
