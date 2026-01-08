# Configuración del Backend Local (agent-v0)

Esta guía explica cómo ejecutar el backend de `jamie-oliver-agent-v0` localmente para que `jo-ai-v1` se conecte a él.

## Opción 1: Docker Compose (Recomendado)

Esta es la forma más sencilla de ejecutar el backend localmente.

### Prerrequisitos

- Docker y Docker Compose instalados
- Acceso a las API keys necesarias

### Pasos

1. **Navegar al directorio del proyecto agent-v0:**
   ```bash
   cd jamie-oliver-agent-v0
   ```

2. **Crear el archivo `.env` en `apps/backend/`:**
   ```bash
   cd apps/backend
   # Si existe .env.example, cópialo:
   # cp .env.example .env
   ```

3. **Configurar las variables de entorno en `apps/backend/.env`:**
   ```env
   # API Keys (REQUERIDAS)
   OPENAI_API_KEY=tu_openai_api_key
   DEEPGRAM_API_KEY=tu_deepgram_api_key
   ELEVENLABS_API_KEY=tu_elevenlabs_api_key
   ELEVENLABS_VOICE_ID=tu_elevenlabs_voice_id
   
   # Server Configuration
   HOST=0.0.0.0
   PORT=8000
   ENVIRONMENT=development
   
   # Langfuse Tracing (OPCIONAL - solo para monitoreo)
   # Si no las configuras, verás un warning pero el backend funcionará
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   LANGFUSE_HOST=https://cloud.langfuse.com
   ```

4. **Ejecutar con Docker Compose:**
   ```bash
   cd ../../  # Volver a la raíz del proyecto
   docker-compose -f infrastructure/docker-compose.yml up --build
   ```
   
   O si prefieres especificar un nombre de proyecto:
   ```bash
   docker-compose -f infrastructure/docker-compose.yml -p jamie-oliver-ai up --build
   ```
   
   (El flag `-p` es opcional y solo sirve para nombrar el proyecto. Puedes omitirlo o usar cualquier nombre)

5. **Verificar que el backend esté corriendo:**
   ```bash
   curl http://localhost:8000/health
   ```

El backend estará disponible en:
- **HTTP:** `http://localhost:8000`
- **WebSocket:** `ws://localhost:8000/ws/voice`

---

## Opción 2: Ejecución Directa con Poetry

Esta opción requiere más configuración pero te da más control.

### Prerrequisitos

- Python 3.11+
- Poetry instalado
- Dependencias del sistema (ver `Dockerfile.dev` para referencia)

### Pasos

1. **Navegar al directorio del backend:**
   ```bash
   cd jamie-oliver-agent-v0/apps/backend
   ```

2. **Instalar dependencias del sistema (macOS):**
   ```bash
   # Si usas Homebrew:
   brew install portaudio
   ```

3. **Instalar dependencias de Python con Poetry:**
   ```bash
   poetry install
   ```

4. **Instalar el paquete `ccai` en modo editable:**
   ```bash
   cd ../../packages/ccai
   poetry install
   cd ../../apps/backend
   ```

5. **Crear y configurar `.env`:**
   ```bash
   # Crear .env con las variables necesarias (ver Opción 1)
   ```

6. **Configurar PYTHONPATH:**
   ```bash
   export PYTHONPATH="/Users/mario.restrepo/www/neuForce/jamie-oliver-agent-v0/apps/backend/src:/Users/mario.restrepo/www/neuForce/jamie-oliver-agent-v0/packages"
   ```

7. **Ejecutar el servidor:**
   ```bash
   poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
   ```

---

## Configurar jo-ai-v1 para Conectarse al Backend Local

Una vez que el backend esté corriendo localmente, necesitas configurar `jo-ai-v1` para que use la URL local.

### Opción A: Variable de Entorno

1. **Crear o editar `.env.local` en `jo-ai-v1/`:**
   ```env
   VITE_WS_URL=ws://localhost:8000/ws/voice
   ```

2. **Reiniciar el servidor de desarrollo:**
   ```bash
   cd jo-ai-v1
   npm run dev
   ```

### Opción B: Modificar el Código Directamente

Si prefieres no usar variables de entorno, puedes modificar directamente el código donde se define la URL del WebSocket.

**Archivo:** `jo-ai-v1/src/hooks/useWebSocket.ts` (si existe) o donde se use la URL del WebSocket.

```typescript
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/voice';
```

---

## Verificar la Conexión

### 1. Usar el Script de Prueba

```bash
cd jo-ai-v1
npm run test:websocket ws://localhost:8000/ws/voice
```

O simplemente:
```bash
npm run test:websocket
```

Y luego escribir `connect` en el prompt.

### 2. Verificar desde el Navegador

1. Abre `jo-ai-v1` en el navegador
2. Abre las DevTools (F12)
3. Ve a la pestaña "Network" y filtra por "WS"
4. Inicia una sesión de cocina
5. Deberías ver la conexión WebSocket a `ws://localhost:8000/ws/voice`

---

## Solución de Problemas

### Error: "Connection refused" o "ECONNREFUSED"

- Verifica que el backend esté corriendo: `curl http://localhost:8000/health`
- Verifica que el puerto 8000 no esté ocupado: `lsof -i :8000`
- Si usas Docker, verifica que el contenedor esté corriendo: `docker ps`

### Error: "WebSocket closed, code: 1006"

- Verifica que el backend esté escuchando en `0.0.0.0:8000` (no solo `127.0.0.1`)
- Verifica que CORS esté configurado correctamente en el backend
- Revisa los logs del backend para ver errores

### Error: "Failed to start Deepgram connection" o "HTTP 401"

- **Verifica que `DEEPGRAM_API_KEY` esté correctamente configurada** en `apps/backend/.env`
- Asegúrate de que la API key sea válida y no haya expirado
- Verifica que no haya espacios extra o caracteres especiales en la variable de entorno
- Reinicia el contenedor después de cambiar las variables de entorno:
  ```bash
  docker-compose -f infrastructure/docker-compose.yml down
  docker-compose -f infrastructure/docker-compose.yml up --build
  ```

### Warning: "Langfuse client initialized without public_key"

- Este es solo un **warning**, no un error. El backend funcionará normalmente sin Langfuse
- Si quieres habilitar tracing con Langfuse, agrega estas variables a `apps/backend/.env`:
  ```env
  LANGFUSE_PUBLIC_KEY=pk-lf-...
  LANGFUSE_SECRET_KEY=sk-lf-...
  LANGFUSE_HOST=https://cloud.langfuse.com
  ```
- Si no necesitas tracing, puedes ignorar este warning

### Error: "Module not found" al ejecutar con Poetry

- Asegúrate de haber instalado `ccai` en modo editable
- Verifica que `PYTHONPATH` esté configurado correctamente
- Ejecuta `poetry install` en ambos directorios (`apps/backend` y `packages/ccai`)

### El backend no responde

- Revisa los logs del backend para ver errores
- Verifica que todas las API keys estén configuradas correctamente
- Verifica que el archivo `.env` esté en el lugar correcto (`apps/backend/.env`)

---

## Variables de Entorno Requeridas

El backend necesita las siguientes variables de entorno:

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `OPENAI_API_KEY` | API key de OpenAI (para GPT) | ✅ Sí |
| `DEEPGRAM_API_KEY` | API key de Deepgram (para STT) | ✅ Sí |
| `ELEVENLABS_API_KEY` | API key de ElevenLabs (para TTS) | ✅ Sí |
| `ELEVENLABS_VOICE_ID` | ID de la voz de ElevenLabs | ✅ Sí |
| `HOST` | Host del servidor (default: `0.0.0.0`) | ❌ No |
| `PORT` | Puerto del servidor (default: `8000`) | ❌ No |
| `ENVIRONMENT` | Entorno (default: `development`) | ❌ No |

---

## Comandos Útiles

### Docker Compose

```bash
# Iniciar el backend
docker-compose -f infrastructure/docker-compose.yml up --build

# Iniciar en segundo plano
docker-compose -f infrastructure/docker-compose.yml up -d --build

# Ver logs
docker-compose -f infrastructure/docker-compose.yml logs -f backend

# Detener el backend
docker-compose -f infrastructure/docker-compose.yml down

# Reconstruir sin caché
docker-compose -f infrastructure/docker-compose.yml build --no-cache
```

**Nota:** Si usaste el flag `-p` para nombrar el proyecto, agrégalo también a estos comandos. Por ejemplo:
```bash
docker-compose -f infrastructure/docker-compose.yml -p jamie-oliver-ai up --build
```

### Poetry

```bash
# Instalar dependencias
poetry install

# Ejecutar el servidor
poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

# Verificar configuración
poetry run python -c "from src.config.settings import settings; print(settings.validate())"
```

---

## Notas

- El backend por defecto escucha en el puerto **8000**
- El WebSocket endpoint está en `/ws/voice`
- El backend usa CORS, así que asegúrate de que tu frontend esté en los orígenes permitidos
- En desarrollo, el backend se recarga automáticamente cuando cambias el código (con `--reload`)
