#!/bin/bash
# Script para verificar y diagnosticar problemas con DEEPGRAM_API_KEY

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Verificando configuración de DEEPGRAM_API_KEY...${NC}"
echo ""

# Verificar archivo .env en apps/backend-voice/
ENV_FILE="$PROJECT_ROOT/apps/backend-voice/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Archivo .env no encontrado en: $ENV_FILE${NC}"
    echo ""
    echo -e "${YELLOW}💡 Solución:${NC}"
    echo "  1. Crea el archivo .env:"
    echo "     cp apps/backend-voice/.env.example apps/backend-voice/.env"
    echo ""
    echo "  2. Edita apps/backend-voice/.env y agrega:"
    echo "     DEEPGRAM_API_KEY=tu-api-key-aqui"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Archivo .env encontrado: $ENV_FILE${NC}"
echo ""

# Verificar si DEEPGRAM_API_KEY está definida
if ! grep -q "^DEEPGRAM_API_KEY=" "$ENV_FILE"; then
    echo -e "${RED}❌ DEEPGRAM_API_KEY no está definida en el archivo .env${NC}"
    echo ""
    echo -e "${YELLOW}💡 Solución:${NC}"
    echo "  Agrega esta línea a $ENV_FILE:"
    echo "  DEEPGRAM_API_KEY=tu-api-key-aqui"
    echo ""
    echo "  Puedes obtener una API key en: https://console.deepgram.com/"
    echo ""
    exit 1
fi

# Verificar si DEEPGRAM_API_KEY tiene un valor
DEEPGRAM_KEY=$(grep "^DEEPGRAM_API_KEY=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)

if [ -z "$DEEPGRAM_KEY" ]; then
    echo -e "${RED}❌ DEEPGRAM_API_KEY está definida pero está vacía${NC}"
    echo ""
    echo -e "${YELLOW}💡 Solución:${NC}"
    echo "  Edita $ENV_FILE y asigna un valor a DEEPGRAM_API_KEY:"
    echo "  DEEPGRAM_API_KEY=tu-api-key-aqui"
    echo ""
    exit 1
fi

# Verificar formato básico (debería empezar con letras/números)
if ! echo "$DEEPGRAM_KEY" | grep -qE '^[a-zA-Z0-9]'; then
    echo -e "${YELLOW}⚠️  DEEPGRAM_API_KEY tiene un formato inusual${NC}"
    echo "  Valor encontrado: ${DEEPGRAM_KEY:0:10}..."
    echo ""
fi

echo -e "${GREEN}✅ DEEPGRAM_API_KEY está configurada${NC}"
echo "  Longitud: ${#DEEPGRAM_KEY} caracteres"
echo "  Primeros caracteres: ${DEEPGRAM_KEY:0:10}..."
echo ""

# Verificar que docker-compose pueda leerla
echo -e "${BLUE}📋 Verificando docker-compose.yml...${NC}"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/infrastructure/docker-compose.yml"
if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    if grep -q "env_file:" "$DOCKER_COMPOSE_FILE"; then
        echo -e "${GREEN}✅ docker-compose.yml está configurado para leer .env${NC}"
    else
        echo -e "${YELLOW}⚠️  docker-compose.yml no tiene env_file configurado${NC}"
        echo "  Aunque las variables se pueden pasar desde el shell"
    fi
else
    echo -e "${YELLOW}⚠️  docker-compose.yml no encontrado${NC}"
fi
echo ""

# Verificar si el contenedor está corriendo
if docker ps | grep -q "jamie-backend-voice"; then
    echo -e "${BLUE}🐳 Verificando variables en el contenedor...${NC}"
    CONTAINER_ENV=$(docker exec jamie-backend-voice env | grep DEEPGRAM_API_KEY || echo "")
    if [ -z "$CONTAINER_ENV" ]; then
        echo -e "${RED}❌ DEEPGRAM_API_KEY no está en el contenedor${NC}"
        echo ""
        echo -e "${YELLOW}💡 Solución:${NC}"
        echo "  1. Detén el contenedor:"
        echo "     cd infrastructure && docker-compose down"
        echo ""
        echo "  2. Reinicia el contenedor:"
        echo "     cd infrastructure && docker-compose up backend-voice"
        echo ""
        echo "  O usa el script:"
        echo "     ./scripts/dev-backend-voice.sh"
        echo ""
    else
        echo -e "${GREEN}✅ DEEPGRAM_API_KEY está en el contenedor${NC}"
        KEY_LENGTH=$(echo "$CONTAINER_ENV" | cut -d'=' -f2- | wc -c)
        echo "  Longitud en contenedor: $((KEY_LENGTH - 1)) caracteres"
    fi
else
    echo -e "${YELLOW}⚠️  Contenedor jamie-backend-voice no está corriendo${NC}"
    echo "  Inicia el contenedor para verificar las variables"
fi
echo ""

echo -e "${BLUE}📝 Resumen:${NC}"
echo "  ✅ Archivo .env existe"
echo "  ✅ DEEPGRAM_API_KEY está configurada"
echo ""
echo -e "${GREEN}✅ Configuración correcta. Si el error persiste:${NC}"
echo "  1. Verifica que la API key sea válida en https://console.deepgram.com/"
echo "  2. Reinicia el contenedor después de cambiar el .env"
echo "  3. Revisa los logs: ./scripts/logs.sh voice"
