#!/bin/bash
# Script para verificar variables de entorno necesarias

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Verificando variables de entorno..."
echo ""

# Variables requeridas para backend-voice
REQUIRED_VARS=(
    "OPENAI_API_KEY"
    "DEEPGRAM_API_KEY"
    "ELEVENLABS_API_KEY"
    "ELEVENLABS_VOICE_ID"
)

# Variables requeridas para backend-search
SEARCH_VARS=(
    "SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
)

# Variables requeridas para frontend
FRONTEND_VARS=(
    "VITE_WS_URL"
    "VITE_API_BASE_URL"
)

# Verificar archivos .env
ENV_FILES=(
    "$PROJECT_ROOT/.env"
    "$PROJECT_ROOT/infrastructure/.env"
    "$PROJECT_ROOT/apps/backend-voice/.env"
    "$PROJECT_ROOT/apps/backend-search/.env"
    "$PROJECT_ROOT/apps/frontend/.env"
)

echo "📁 Archivos .env encontrados:"
for env_file in "${ENV_FILES[@]}"; do
    if [ -f "$env_file" ]; then
        echo "  ✅ $env_file"
    else
        echo "  ❌ $env_file (no existe)"
    fi
done
echo ""

# Verificar variables en el shell
echo "🔐 Variables en el shell actual:"
SHELL_MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "  ❌ $var (no configurada)"
        SHELL_MISSING_VARS+=("$var")
    else
        echo "  ✅ $var (configurada)"
    fi
done
echo ""

# Verificar variables en .env de la raíz (para docker-compose)
if [ -f "$PROJECT_ROOT/.env" ]; then
    echo "📄 Variables en $PROJECT_ROOT/.env:"
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" "$PROJECT_ROOT/.env" 2>/dev/null; then
            VALUE=$(grep "^${var}=" "$PROJECT_ROOT/.env" | cut -d'=' -f2- | xargs)
            if [ -n "$VALUE" ]; then
                echo "  ✅ $var (encontrada y tiene valor)"
            else
                echo "  ⚠️  $var (encontrada pero vacía)"
            fi
        else
            echo "  ❌ $var (no encontrada)"
        fi
    done
    echo ""
fi

# Verificar variables en apps/backend-voice/.env (importante para docker-compose)
BACKEND_VOICE_ENV="$PROJECT_ROOT/apps/backend-voice/.env"
if [ -f "$BACKEND_VOICE_ENV" ]; then
    echo "📄 Variables en apps/backend-voice/.env:"
    ENV_MISSING_VARS=()
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" "$BACKEND_VOICE_ENV" 2>/dev/null; then
            VALUE=$(grep "^${var}=" "$BACKEND_VOICE_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)
            if [ -n "$VALUE" ]; then
                echo "  ✅ $var (encontrada y tiene valor)"
            else
                echo "  ⚠️  $var (encontrada pero vacía)"
                ENV_MISSING_VARS+=("$var")
            fi
        else
            echo "  ❌ $var (no encontrada)"
            ENV_MISSING_VARS+=("$var")
        fi
    done
    echo ""
    
    # Si todas las variables están en backend-voice/.env, sugerir copiar a la raíz
    if [ ${#ENV_MISSING_VARS[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ Todas las variables están configuradas en apps/backend-voice/.env${NC}"
        if [ ! -f "$PROJECT_ROOT/.env" ]; then
            echo ""
            echo -e "${YELLOW}💡 Recomendación:${NC}"
            echo "  docker-compose puede leer desde apps/backend-voice/.env (ya configurado)"
            echo "  Pero también puedes crear un .env en la raíz para mayor compatibilidad:"
            echo "  cp apps/backend-voice/.env .env"
        fi
    else
        echo -e "${YELLOW}⚠️  Faltan algunas variables en apps/backend-voice/.env:${NC}"
        printf '  - %s\n' "${ENV_MISSING_VARS[@]}"
    fi
    echo ""
fi

# Combinar variables faltantes (shell o .env de raíz)
MISSING_VARS=("${SHELL_MISSING_VARS[@]}")
if [ -f "$PROJECT_ROOT/.env" ]; then
    for var in "${REQUIRED_VARS[@]}"; do
        if ! grep -q "^${var}=" "$PROJECT_ROOT/.env" 2>/dev/null; then
            # Solo agregar si no está ya en MISSING_VARS
            if [[ ! " ${MISSING_VARS[@]} " =~ " ${var} " ]]; then
                MISSING_VARS+=("$var")
            fi
        fi
    done
fi

# Resumen
if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ Todas las variables requeridas están configuradas${NC}"
    exit 0
else
    echo -e "${RED}❌ Faltan las siguientes variables:${NC}"
    printf '  - %s\n' "${MISSING_VARS[@]}"
    echo ""
    echo -e "${YELLOW}💡 Solución:${NC}"
    echo ""
    echo "1. Crea un archivo .env en la raíz del proyecto:"
    echo "   $PROJECT_ROOT/.env"
    echo ""
    echo "2. O exporta las variables en tu shell antes de ejecutar docker-compose:"
    echo "   export DEEPGRAM_API_KEY=your-key"
    echo "   export OPENAI_API_KEY=your-key"
    echo "   export ELEVENLABS_API_KEY=your-key"
    echo "   export ELEVENLABS_VOICE_ID=your-voice-id"
    echo ""
    echo "3. O copia el .env desde apps/backend-voice/ a la raíz:"
    echo "   cp apps/backend-voice/.env .env"
    echo ""
    exit 1
fi
