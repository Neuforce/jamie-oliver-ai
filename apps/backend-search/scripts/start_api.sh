#!/bin/bash
# Script para iniciar la API de búsqueda de recetas

set -e

echo "=================================================="
echo "Starting Recipe Search API"
echo "=================================================="

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  Virtual environment not activated. Activating..."
    source .venv/bin/activate
fi

# Check Supabase credentials
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "⚠️  Loading environment from .env..."
    if [ -f .env ]; then
        export $(grep -v '^#' .env | xargs)
    else
        echo "❌ No .env file found"
        exit 1
    fi
fi

echo "✅ Environment loaded"
echo ""
echo "Starting server on http://localhost:8000"
echo "Docs available at http://localhost:8000/docs"
echo ""
echo "=================================================="
echo ""

# Start API server
python3 -m uvicorn recipe_search_agent.api:app --host 0.0.0.0 --port 8000 --reload

