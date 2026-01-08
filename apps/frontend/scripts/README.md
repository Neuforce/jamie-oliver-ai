# Scripts de Prueba

## test-websocket.js

Script de prueba para verificar la conexión WebSocket con el backend de `jamie-oliver-agent-v0`.

### Instalación

Primero, instala la dependencia necesaria:

```bash
npm install
```

### Uso

#### Opción 1: Usando npm script

```bash
npm run test:websocket
```

#### Opción 2: Ejecutar directamente

```bash
node scripts/test-websocket.js
```

#### Opción 3: Con URL personalizada

```bash
node scripts/test-websocket.js wss://tu-servidor.com/ws/voice
```

### Comandos Disponibles

Una vez iniciado el script, puedes usar los siguientes comandos:

#### 🔌 Conexión
- `connect` o `c` - Conectar al WebSocket
- `reconnect` o `r` - Reconectar al WebSocket
- `disconnect` o `d` - Desconectar del WebSocket
- `status` o `s` - Mostrar estado de la conexión
- `session` - Mostrar Session ID actual
- `newsession` - Generar un nuevo Session ID

#### 💬 Mensajes
- `send <json>` - Enviar un mensaje JSON al servidor
- `text <mensaje>` - Enviar un mensaje de texto
- `test` - Enviar mensaje de prueba

#### 🍳 Workflow de Recetas
- `recipe start [recipe_id]` - Iniciar una receta (ej: `recipe start squash_risotto_2`)
- `recipe next` - Solicitar siguiente paso
- `recipe done` - Marcar paso actual como completado
- `recipe repeat` - Repetir paso actual
- `recipe status` - Consultar estado de la receta
- `recipe list` - Listar recetas disponibles

#### 🎤 Audio/Voz
- `voice start` - Iniciar captura de audio del micrófono
- `voice stop` - Detener captura de audio

#### 📖 Ayuda
- `examples` - Mostrar ejemplos de uso
- `help` o `h` - Mostrar ayuda
- `exit` / `quit` / `q` - Salir del script

### Ejemplo de Uso

#### Workflow de Recetas por Texto

```bash
$ npm run test:websocket

> connect
✅ WebSocket conectado exitosamente

> recipe list
📤 Enviando mensaje de texto: "What recipes are available?"

> recipe start squash_risotto_2
📤 Iniciando receta: squash_risotto_2
📤 Enviando mensaje de texto: "Start recipe squash_risotto_2"

> recipe next
📤 Solicitando siguiente paso
📤 Enviando mensaje de texto: "What is the next step?"

> recipe done
📤 Marcando paso como completado
📤 Enviando mensaje de texto: "This step is done"
```

#### Captura de Audio

```bash
> connect
✅ WebSocket conectado exitosamente

> voice start
✅ Iniciando captura de audio...
ℹ️  Habla ahora. Presiona Ctrl+C o escribe "stopvoice" para detener.

[Hablas al micrófono...]

> voice stop
✅ Captura de audio detenida
```

#### Mensajes de Texto Directos

```bash
> text What recipes do you have?
📤 Enviando mensaje de texto: "What recipes do you have?"

> text The oven is ready
📤 Enviando mensaje de texto: "The oven is ready"
```

### Características

- ✅ Conexión automática al iniciar (opcional)
- ✅ Manejo de errores con códigos descriptivos
- ✅ Colores en la consola para mejor legibilidad
- ✅ Análisis automático de tipos de mensajes
- ✅ Soporte para mensajes JSON y binarios
- ✅ Reconexión automática
- ✅ Logging detallado con timestamps
- ✅ **Comandos de workflow de recetas** (start, next, done, etc.)
- ✅ **Captura de audio del micrófono** (requiere sox)

### Requisitos para Audio

Para usar la funcionalidad de captura de audio, necesitas instalar `sox`:

**macOS:**
```bash
brew install sox
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install sox
```

**Linux (Fedora/RHEL):**
```bash
sudo dnf install sox
```

Sin `sox`, puedes usar los comandos de texto para probar el workflow de recetas.

### Notas

- El script usa el puerto y URL por defecto del backend de producción
- Se genera automáticamente un Session ID único para cada sesión
- Los mensajes se formatean y muestran con colores para facilitar la lectura
- El script maneja correctamente los códigos de cierre WebSocket (especialmente 1006)
