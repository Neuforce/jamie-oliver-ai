#!/bin/bash
# Script para iniciar el frontend en modo desarrollo

set -e

cd "$(dirname "$0")/../apps/frontend"

echo "🚀 Starting frontend development server..."
echo "📍 Directory: $(pwd)"
echo ""

# Verificar que node_modules existe y está actualizado
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
    echo "⚠️  node_modules no encontrado o corrupto. Instalando dependencias..."
    npm install
    echo ""
fi

# Verificar que package.json tiene type: module
if ! grep -q '"type": "module"' package.json 2>/dev/null; then
    echo "⚠️  package.json no tiene 'type': 'module'. Esto puede causar problemas."
    echo "   Ejecuta: ./scripts/fix-frontend.sh"
    echo ""
fi

# Valores por defecto para desarrollo local si no están definidos
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:8000}"
export VITE_WS_URL="${VITE_WS_URL:-ws://localhost:8100/ws/voice}"

echo "🔧 Using VITE_API_BASE_URL=${VITE_API_BASE_URL}"
echo "🔧 Using VITE_WS_URL=${VITE_WS_URL}"

npm run dev
