#!/bin/bash
# Verify required environment variables

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Checking environment variables..."
echo ""

# Required for backend-voice
REQUIRED_VARS=(
    "OPENAI_API_KEY"
    "DEEPGRAM_API_KEY"
    "ELEVENLABS_API_KEY"
    "ELEVENLABS_VOICE_ID"
)

# Required for backend-search
SEARCH_VARS=(
    "SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
)

# Required for frontend
FRONTEND_VARS=(
    "VITE_WS_URL"
    "VITE_API_BASE_URL"
)

# Check .env files
ENV_FILES=(
    "$PROJECT_ROOT/.env"
    "$PROJECT_ROOT/infrastructure/.env"
    "$PROJECT_ROOT/apps/backend-voice/.env"
    "$PROJECT_ROOT/apps/backend-search/.env"
    "$PROJECT_ROOT/apps/frontend/.env"
)

echo "📁 .env files:"
for env_file in "${ENV_FILES[@]}"; do
    if [ -f "$env_file" ]; then
        echo "  ✅ $env_file"
    else
        echo "  ❌ $env_file (missing)"
    fi
done
echo ""

# Check variables in the shell
echo "🔐 Variables in current shell:"
SHELL_MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "  ❌ $var (not set)"
        SHELL_MISSING_VARS+=("$var")
    else
        echo "  ✅ $var (set)"
    fi
done
echo ""

# Check variables from root .env (for docker-compose)
if [ -f "$PROJECT_ROOT/.env" ]; then
    echo "📄 Variables in $PROJECT_ROOT/.env:"
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" "$PROJECT_ROOT/.env" 2>/dev/null; then
            VALUE=$(grep "^${var}=" "$PROJECT_ROOT/.env" | cut -d'=' -f2- | xargs)
            if [ -n "$VALUE" ]; then
                echo "  ✅ $var (present, non-empty)"
            else
                echo "  ⚠️  $var (present but empty)"
            fi
        else
            echo "  ❌ $var (missing)"
        fi
    done
    echo ""
fi

# Check apps/backend-voice/.env (needed for docker-compose)
BACKEND_VOICE_ENV="$PROJECT_ROOT/apps/backend-voice/.env"
if [ -f "$BACKEND_VOICE_ENV" ]; then
    echo "📄 Variables in apps/backend-voice/.env:"
    ENV_MISSING_VARS=()
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" "$BACKEND_VOICE_ENV" 2>/dev/null; then
            VALUE=$(grep "^${var}=" "$BACKEND_VOICE_ENV" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)
            if [ -n "$VALUE" ]; then
                echo "  ✅ $var (present, non-empty)"
            else
                echo "  ⚠️  $var (present but empty)"
                ENV_MISSING_VARS+=("$var")
            fi
        else
            echo "  ❌ $var (missing)"
            ENV_MISSING_VARS+=("$var")
        fi
    done
    echo ""
    
    # If everything is in backend-voice/.env, optionally copy to repo root
    if [ ${#ENV_MISSING_VARS[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ All required keys are set in apps/backend-voice/.env${NC}"
        if [ ! -f "$PROJECT_ROOT/.env" ]; then
            echo ""
            echo -e "${YELLOW}💡 Tip:${NC}"
            echo "  docker-compose can read apps/backend-voice/.env"
            echo "  You may also copy it to the repo root for convenience:"
            echo "  cp apps/backend-voice/.env .env"
        fi
    else
        echo -e "${YELLOW}⚠️  Some keys are missing in apps/backend-voice/.env:${NC}"
        printf '  - %s\n' "${ENV_MISSING_VARS[@]}"
    fi
    echo ""
fi

# Merge missing vars (shell vs root .env)
MISSING_VARS=("${SHELL_MISSING_VARS[@]}")
if [ -f "$PROJECT_ROOT/.env" ]; then
    for var in "${REQUIRED_VARS[@]}"; do
        if ! grep -q "^${var}=" "$PROJECT_ROOT/.env" 2>/dev/null; then
            # Add only if not already listed
            if [[ ! " ${MISSING_VARS[@]} " =~ " ${var} " ]]; then
                MISSING_VARS+=("$var")
            fi
        fi
    done
fi

# Summary
if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All required variables are set${NC}"
    exit 0
else
    echo -e "${RED}❌ Missing variables:${NC}"
    printf '  - %s\n' "${MISSING_VARS[@]}"
    echo ""
    echo -e "${YELLOW}💡 How to fix:${NC}"
    echo ""
    echo "1. Create a .env at the repo root:"
    echo "   $PROJECT_ROOT/.env"
    echo ""
    echo "2. Or export variables in your shell before docker-compose:"
    echo "   export DEEPGRAM_API_KEY=your-key"
    echo "   export OPENAI_API_KEY=your-key"
    echo "   export ELEVENLABS_API_KEY=your-key"
    echo "   export ELEVENLABS_VOICE_ID=your-voice-id"
    echo ""
    echo "3. Or copy .env from apps/backend-voice/ to the repo root:"
    echo "   cp apps/backend-voice/.env .env"
    echo ""
    exit 1
fi
