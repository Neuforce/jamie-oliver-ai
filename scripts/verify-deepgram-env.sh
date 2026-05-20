#!/bin/bash
# Check DEEPGRAM_API_KEY configuration

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Checking DEEPGRAM_API_KEY...${NC}"
echo ""

ENV_FILE="$PROJECT_ROOT/apps/backend-voice/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Missing .env at: $ENV_FILE${NC}"
    echo ""
    echo -e "${YELLOW}💡 Fix:${NC}"
    echo "  1. Create it:"
    echo "     cp apps/backend-voice/.env.example apps/backend-voice/.env"
    echo ""
    echo "  2. Edit apps/backend-voice/.env and set:"
    echo "     DEEPGRAM_API_KEY=your-api-key"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Found .env: $ENV_FILE${NC}"
echo ""

if ! grep -q "^DEEPGRAM_API_KEY=" "$ENV_FILE"; then
    echo -e "${RED}❌ DEEPGRAM_API_KEY is not set in .env${NC}"
    echo ""
    echo -e "${YELLOW}💡 Fix:${NC}"
    echo "  Add to $ENV_FILE:"
    echo "  DEEPGRAM_API_KEY=your-api-key"
    echo ""
    echo "  Get a key: https://console.deepgram.com/"
    echo ""
    exit 1
fi

DEEPGRAM_KEY=$(grep "^DEEPGRAM_API_KEY=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)

if [ -z "$DEEPGRAM_KEY" ]; then
    echo -e "${RED}❌ DEEPGRAM_API_KEY is present but empty${NC}"
    echo ""
    echo -e "${YELLOW}💡 Fix:${NC}"
    echo "  Edit $ENV_FILE and set a non-empty DEEPGRAM_API_KEY"
    echo ""
    exit 1
fi

if ! echo "$DEEPGRAM_KEY" | grep -qE '^[a-zA-Z0-9]'; then
    echo -e "${YELLOW}⚠️  DEEPGRAM_API_KEY has an unusual format${NC}"
    echo "  Value prefix: ${DEEPGRAM_KEY:0:10}..."
    echo ""
fi

echo -e "${GREEN}✅ DEEPGRAM_API_KEY is set${NC}"
echo "  Length: ${#DEEPGRAM_KEY} characters"
echo "  Prefix: ${DEEPGRAM_KEY:0:10}..."
echo ""

echo -e "${BLUE}📋 Checking infrastructure/docker-compose.yml...${NC}"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/infrastructure/docker-compose.yml"
if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    if grep -q "env_file:" "$DOCKER_COMPOSE_FILE"; then
        echo -e "${GREEN}✅ docker-compose.yml references env_file${NC}"
    else
        echo -e "${YELLOW}⚠️  docker-compose.yml has no env_file block${NC}"
        echo "  You can still pass vars from the shell"
    fi
else
    echo -e "${YELLOW}⚠️  docker-compose.yml not found${NC}"
fi
echo ""

if docker ps | grep -q "jamie-backend-voice"; then
    echo -e "${BLUE}🐳 Checking container env...${NC}"
    CONTAINER_ENV=$(docker exec jamie-backend-voice env | grep DEEPGRAM_API_KEY || echo "")
    if [ -z "$CONTAINER_ENV" ]; then
        echo -e "${RED}❌ DEEPGRAM_API_KEY not visible in container${NC}"
        echo ""
        echo -e "${YELLOW}💡 Fix:${NC}"
        echo "  1. Stop:"
        echo "     cd infrastructure && docker-compose down"
        echo ""
        echo "  2. Start:"
        echo "     cd infrastructure && docker-compose up backend-voice"
        echo ""
        echo "  Or: ./scripts/dev-backend-voice.sh"
        echo ""
    else
        echo -e "${GREEN}✅ DEEPGRAM_API_KEY present in container${NC}"
        KEY_LENGTH=$(echo "$CONTAINER_ENV" | cut -d'=' -f2- | wc -c)
        echo "  Length in container: $((KEY_LENGTH - 1)) characters"
    fi
else
    echo -e "${YELLOW}⚠️  jamie-backend-voice container is not running${NC}"
    echo "  Start it to verify injected env"
fi
echo ""

echo -e "${BLUE}📝 Summary:${NC}"
echo "  ✅ .env exists"
echo "  ✅ DEEPGRAM_API_KEY is set"
echo ""
echo -e "${GREEN}✅ Looks good. If issues persist:${NC}"
echo "  1. Confirm the key in https://console.deepgram.com/"
echo "  2. Restart the container after editing .env"
echo "  3. Logs: ./scripts/logs.sh voice"
