#!/bin/bash
# Start the frontend dev server

set -e

cd "$(dirname "$0")/../apps/frontend"

echo "🚀 Starting frontend development server..."
echo "📍 Directory: $(pwd)"
echo ""

# Ensure node_modules exists
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
    echo "⚠️  node_modules missing or invalid. Running npm install..."
    npm install
    echo ""
fi

# Ensure package.json declares type: module
if ! grep -q '"type": "module"' package.json 2>/dev/null; then
    echo "⚠️  package.json should include '\"type\": \"module\"'. Run ./scripts/fix-frontend.sh"
    echo ""
fi

# Defaults for local dev when unset
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:8000}"
export VITE_WS_URL="${VITE_WS_URL:-ws://localhost:8100/ws/voice}"

echo "🔧 Using VITE_API_BASE_URL=${VITE_API_BASE_URL}"
echo "🔧 Using VITE_WS_URL=${VITE_WS_URL}"
echo "🔧 Using VITE_RECIPE_ACCESS_STRICT=${VITE_RECIPE_ACCESS_STRICT:-(unset → dev bypass stays on)}"

npm run dev
