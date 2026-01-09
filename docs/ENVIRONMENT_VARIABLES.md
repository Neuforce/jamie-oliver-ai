# Variables de Entorno - Jamie Oliver AI Monorepo

Este documento lista todas las variables de entorno necesarias para cada aplicación del monorepo.

## 📋 Resumen Rápido

| App | Variables Requeridas | Variables Opcionales |
|-----|---------------------|---------------------|
| **Frontend** | `VITE_WS_URL`, `VITE_API_BASE_URL` | - |
| **Backend-Voice** | `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | `HOST`, `PORT`, `ENVIRONMENT`, `CORS_ORIGINS`, `RECIPES_SOURCE`, `RECIPES_DIR` |
| **Backend-Search** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `PYTHON_VERSION`, `RECIPE_*` (varias) |

---

## 🎨 Frontend (`apps/frontend/`)

### Variables Requeridas

```bash
# WebSocket URL para backend-voice
VITE_WS_URL=ws://localhost:8100/ws/voice
# Producción: wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice

# API Base URL para backend-search
VITE_API_BASE_URL=http://localhost:8000
# Producción: https://your-backend-search-url.vercel.app
```

### Descripción

- **`VITE_WS_URL`**: URL del WebSocket del backend-voice para comunicación de voz durante el modo de cocción.
- **`VITE_API_BASE_URL`**: URL base del backend-search para búsqueda semántica de recetas.

### Archivo
- `.env.example`: `apps/frontend/.env.example`

---

## 🎤 Backend-Voice (`apps/backend-voice/`)

### Variables Requeridas

```bash
# OpenAI API Key (para LLM)
OPENAI_API_KEY=sk-your-openai-api-key

# Deepgram API Key (para Speech-to-Text)
DEEPGRAM_API_KEY=your-deepgram-api-key

# ElevenLabs API Key (para Text-to-Speech)
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# ElevenLabs Voice ID (para selección de voz)
ELEVENLABS_VOICE_ID=your-elevenlabs-voice-id
```

### Variables Opcionales

```bash
# Configuración del servidor
HOST=0.0.0.0                    # Default: 0.0.0.0
PORT=8100                       # Default: 8100
ENVIRONMENT=development         # development, staging, production

# CORS Origins (lista separada por comas)
CORS_ORIGINS=http://localhost:3000,http://localhost:3100,https://your-frontend.vercel.app

# Configuración de recetas
RECIPES_SOURCE=local            # "local" o "remote" (default: local)
RECIPES_DIR=../../data/recipes  # Ruta a recetas (default: resuelto automáticamente)
RECIPES_MANIFEST_URL=           # URL del manifest remoto (si RECIPES_SOURCE=remote)
```

### Descripción

- **`OPENAI_API_KEY`**: Clave API de OpenAI para el modelo de lenguaje (GPT-4).
- **`DEEPGRAM_API_KEY`**: Clave API de Deepgram para convertir audio a texto.
- **`ELEVENLABS_API_KEY`**: Clave API de ElevenLabs para convertir texto a audio.
- **`ELEVENLABS_VOICE_ID`**: ID de la voz en ElevenLabs. Encuéntralo en [ElevenLabs Voice Library](https://elevenlabs.io/app/voice-library).

### Archivo
- `.env.example`: `apps/backend-voice/.env.example`

---

## 🔍 Backend-Search (`apps/backend-search/`)

### Variables Requeridas

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Python Version (para Vercel)
PYTHON_VERSION=3.11
```

### Variables Opcionales - Recipe PDF Agent

```bash
# Logging
RECIPE_PDF_LOG_LEVEL=INFO       # DEBUG, INFO, WARNING, ERROR

# Supabase Table
RECIPE_PDF_SUPABASE_TABLE=recipe_index
```

### Variables Opcionales - Recipe PDF Agent Llama

```bash
# Ollama Configuration (para procesamiento de PDFs con LLM)
RECIPE_LLAMA_OLLAMA_URL=http://localhost:11434
RECIPE_LLAMA_MODEL=llama3.1

# Supabase Table para chunks inteligentes
RECIPE_LLAMA_SUPABASE_TABLE=intelligent_recipe_chunks

# LangChain Parser (opcional)
RECIPE_LLAMA_USE_LANGCHAIN=false
RECIPE_LLAMA_LANGCHAIN_MODEL=llama3.1
RECIPE_LLAMA_LANGCHAIN_NUM_CTX=4096
RECIPE_LLAMA_LANGCHAIN_TEMPERATURE=0.0

# Chunking Optimization (opcional)
RECIPE_LLAMA_ENABLE_DENSITY=false
RECIPE_LLAMA_DENSITY_THRESHOLD=0.85

# LLM Enrichment (opcional)
RECIPE_LLAMA_ENABLE_LLM_ENRICHMENT=false
RECIPE_LLAMA_ENRICHMENT_MODEL=llama3.1
RECIPE_LLAMA_ENRICHMENT_TIMEOUT=10

# Logging
RECIPE_LLAMA_LOG_LEVEL=INFO
```

### Descripción

- **`SUPABASE_URL`**: URL de tu proyecto Supabase.
- **`SUPABASE_SERVICE_ROLE_KEY`**: Service Role Key de Supabase (⚠️ mantener secreto, nunca commitear a Git).
- **`PYTHON_VERSION`**: Versión de Python para Vercel (3.11 recomendado).

Las variables `RECIPE_LLAMA_*` son opcionales y solo necesarias si usas el agente de PDFs con Ollama para procesar recetas.

### Archivo
- `.env.example`: `apps/backend-search/.env.example`

---

## 🚀 Configuración por Ambiente

### Desarrollo Local

**Frontend:**
```bash
VITE_WS_URL=ws://localhost:8100/ws/voice
VITE_API_BASE_URL=http://localhost:8000
```

**Backend-Voice:**
```bash
ENVIRONMENT=development
HOST=0.0.0.0
PORT=8100
RECIPES_SOURCE=local
RECIPES_DIR=../../data/recipes
```

**Backend-Search:**
```bash
RECIPE_LLAMA_OLLAMA_URL=http://localhost:11434
RECIPE_LLAMA_MODEL=llama3.1
```

### Producción

**Frontend (Vercel):**
```bash
VITE_WS_URL=wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice
VITE_API_BASE_URL=https://your-backend-search.vercel.app
```

**Backend-Voice (AWS ECS):**
```bash
ENVIRONMENT=production
HOST=0.0.0.0
PORT=8100
RECIPES_SOURCE=local
RECIPES_DIR=/app/data/recipes
```

**Backend-Search (Vercel):**
```bash
PYTHON_VERSION=3.11
# Las demás variables se configuran en Vercel Dashboard
```

---

## 📝 Cómo Configurar

### 1. Copiar archivos .env.example

```bash
# Frontend
cd apps/frontend
cp .env.example .env

# Backend-Voice
cd ../backend-voice
cp .env.example .env

# Backend-Search
cd ../backend-search
cp .env.example .env
```

### 2. Llenar valores

Edita cada archivo `.env` y completa los valores requeridos.

### 3. Verificar

```bash
# Frontend - verifica que las variables se carguen
cd apps/frontend
npm run dev
# Revisa la consola del navegador

# Backend-Voice - verifica configuración
cd ../backend-voice
python -c "from src.config.settings import settings; print(settings.validate())"
# Debe imprimir True si todas las keys están configuradas

# Backend-Search - verifica Supabase
cd ../backend-search
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('SUPABASE_URL:', os.getenv('SUPABASE_URL')[:20] + '...' if os.getenv('SUPABASE_URL') else 'NOT SET')"
```

---

## 🔒 Seguridad

### ⚠️ Nunca commitees archivos `.env` a Git

Asegúrate de que `.env` esté en `.gitignore`:

```bash
# .gitignore
.env
.env.local
.env.*.local
```

### ✅ Usa `.env.example` como template

Los archivos `.env.example` son seguros para commitear porque no contienen valores reales.

### 🔐 Variables Sensibles

Las siguientes variables **NUNCA** deben ser commitadas:
- `OPENAI_API_KEY`
- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Cualquier otra clave API o token

---

## 📚 Referencias

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Python-dotenv](https://pypi.org/project/python-dotenv/)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [AWS ECS Environment Variables](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/taskdef-env-vars.html)
