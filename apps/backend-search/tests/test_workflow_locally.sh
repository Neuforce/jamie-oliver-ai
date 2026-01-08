#!/bin/bash
# Test script to simulate GitHub Actions workflow locally

set -e

echo "=================================================="
echo "Testing Recipe Ingestion Workflow Locally"
echo "=================================================="

# Check if Ollama is running
echo ""
echo "1️⃣  Checking Ollama..."
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "❌ Ollama is not running. Starting it..."
    pkill -f "ollama" || true
    ollama serve > /tmp/ollama.log 2>&1 &
    sleep 3
    echo "✅ Ollama started"
else
    echo "✅ Ollama is already running"
fi

# Check if llama3.1 is available
echo ""
echo "2️⃣  Checking llama3.1 model..."
if ! ollama list | grep -q "llama3.1"; then
    echo "❌ llama3.1 not found. Pulling it..."
    ollama pull llama3.1
    echo "✅ llama3.1 downloaded"
else
    echo "✅ llama3.1 is available"
fi

# Check Supabase credentials
echo ""
echo "3️⃣  Checking Supabase credentials..."
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "⚠️  Loading from .env file..."
    if [ -f .env ]; then
        export $(grep -v '^#' .env | xargs)
    else
        echo "❌ No .env file found and env vars not set"
        exit 1
    fi
fi

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found"
    exit 1
fi
echo "✅ Supabase credentials found"

# Create directories
echo ""
echo "4️⃣  Creating data directories..."
mkdir -p data/recipes
mkdir -p data/recipes_json
mkdir -p data/processed_pdfs
mkdir -p data/errors
echo "✅ Directories created"

# Run the pipeline
echo ""
echo "5️⃣  Running pipeline..."
echo "=================================================="
python -m recipe_pdf_agent_llama.cli run data/recipes

# Show summary
echo ""
echo "=================================================="
echo "✅ Processing Complete!"
echo "=================================================="
echo "JSONs generated:    $(ls -1 data/recipes_json/*.json 2>/dev/null | wc -l | tr -d ' ')"
echo "PDFs processed:     $(ls -1 data/processed_pdfs/*.pdf 2>/dev/null | wc -l | tr -d ' ')"
echo "Errors:             $(ls -1 data/errors/*.pdf 2>/dev/null | wc -l | tr -d ' ')"
echo "=================================================="


