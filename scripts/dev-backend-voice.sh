#!/bin/bash
# Start backend-voice via Docker Compose

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT/infrastructure"

echo "🚀 Starting backend-voice with Docker Compose..."
echo "📍 Directory: $(pwd)"
echo ""

if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null; then
    echo "❌ Error: docker-compose or docker compose not found"
    echo "Please install Docker and Docker Compose"
    exit 1
fi

# Check if docker-compose or docker compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# Start only backend-voice service
$DOCKER_COMPOSE up backend-voice
