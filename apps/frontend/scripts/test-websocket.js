#!/usr/bin/env node

/**
 * Script de prueba para conexión WebSocket con el backend de agent-v0
 * 
 * Uso:
 *   node scripts/test-websocket.js [ws_url]
 * 
 * Ejemplo:
 *   node scripts/test-websocket.js wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice
 */

const WebSocket = require('ws');
const readline = require('readline');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// URL del WebSocket (por defecto producción)
const WS_URL = process.argv[2] || 'ws://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice';

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logMessage(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'sent' ? '📤' : type === 'received' ? '📥' : '💬';
  log(`${prefix} [${timestamp}] ${message}`, type === 'sent' ? 'cyan' : type === 'received' ? 'magenta' : 'blue');
}

// Generar un sessionId único
function generateSessionId() {
  return `test_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Interfaz de línea de comandos
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\n> ',
});

let ws = null;
let sessionId = generateSessionId();
let isConnected = false;
let isRecording = false;
let audioProcess = null;
let currentRecipeId = null;

function connect() {
  logInfo(`Conectando a: ${WS_URL}`);
  logInfo(`Session ID: ${sessionId}`);
  
  try {
    ws = new WebSocket(WS_URL, {
      headers: {
        'User-Agent': 'jo-ai-v1-test-script/1.0',
      },
    });

    ws.on('open', () => {
      isConnected = true;
      logSuccess('WebSocket conectado exitosamente');
      
      // Enviar mensaje inicial
      const startMessage = {
        event: 'start',
        sessionId: sessionId,
        sampleRate: 16000,
        customParameters: currentRecipeId ? { recipeId: currentRecipeId } : {},
      };
      
      logMessage(`Enviando mensaje inicial: ${JSON.stringify(startMessage, null, 2)}`, 'sent');
      ws.send(JSON.stringify(startMessage));
      
      logInfo('Esperando mensajes del servidor...');
      logInfo('Escribe "help" para ver comandos disponibles');
      rl.prompt();
    });

    ws.on('message', (data) => {
      try {
        // Intentar parsear como JSON
        let message;
        try {
          message = JSON.parse(data.toString());
          logMessage(`Mensaje recibido (JSON):\n${JSON.stringify(message, null, 2)}`, 'received');
        } catch (e) {
          // Si no es JSON, mostrar como texto/binario
          const preview = data.toString().substring(0, 100);
          logMessage(`Mensaje recibido (texto/binario, primeros 100 chars):\n${preview}${data.length > 100 ? '...' : ''}`, 'received');
          logWarning(`Tamaño total: ${data.length} bytes`);
        }
        
        // Analizar tipo de mensaje
        if (message && message.event) {
          switch (message.event) {
            case 'recipe_state':
              logInfo('📋 Estado de receta actualizado');
              break;
            case 'recipe_message':
              logInfo(`💬 Mensaje: ${message.data?.message || 'N/A'}`);
              break;
            case 'recipe_error':
              logError(`Error en receta: ${message.data?.error || 'N/A'}`);
              break;
            case 'manager_system':
              logInfo(`🔧 Sistema: ${message.data?.message || 'N/A'}`);
              break;
            case 'audio':
              logInfo(`🔊 Audio recibido (${message.data?.length || 0} bytes)`);
              break;
            case 'control':
              logInfo(`🎮 Control: ${JSON.stringify(message.data)}`);
              break;
            case 'stop':
              logWarning('🛑 Señal de detención recibida');
              break;
            default:
              logInfo(`📨 Evento desconocido: ${message.event}`);
          }
        }
      } catch (error) {
        logError(`Error procesando mensaje: ${error.message}`);
      }
      
      rl.prompt();
    });

    ws.on('error', (error) => {
      logError(`Error de WebSocket: ${error.message}`);
      if (error.code) {
        logError(`Código de error: ${error.code}`);
      }
      if (error.code === 'ECONNREFUSED') {
        logError('No se pudo conectar. Verifica que el servidor esté corriendo.');
      } else if (error.code === 'ENOTFOUND') {
        logError('No se pudo resolver el hostname. Verifica la URL.');
      }
      rl.prompt();
    });

    ws.on('close', (code, reason) => {
      isConnected = false;
      logWarning(`WebSocket cerrado. Código: ${code}, Razón: ${reason || 'N/A'}`);
      
      if (code === 1006) {
        logError('Conexión cerrada anormalmente (1006). Posibles causas:');
        logError('  - El servidor no está disponible');
        logError('  - Problemas de red/firewall');
        logError('  - El servidor rechazó la conexión');
      }
      
      logInfo('Presiona Ctrl+C para salir o escribe "reconnect" para reconectar');
      rl.prompt();
    });

    ws.on('ping', () => {
      logInfo('Ping recibido del servidor');
      if (ws.isAlive === false) {
        ws.isAlive = true;
      }
    });

    ws.on('pong', () => {
      logInfo('Pong recibido del servidor');
    });

  } catch (error) {
    logError(`Error al crear WebSocket: ${error.message}`);
    rl.prompt();
  }
}

function sendMessage(message) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    logError('No hay conexión activa. Usa "connect" o "reconnect" primero.');
    return;
  }
  
  try {
    let payload;
    if (typeof message === 'string') {
      // Intentar parsear como JSON
      try {
        payload = JSON.parse(message);
      } catch (e) {
        // Si no es JSON válido, enviar como texto plano
        payload = { message: message };
      }
    } else {
      payload = message;
    }
    
    logMessage(`Enviando: ${JSON.stringify(payload, null, 2)}`, 'sent');
    ws.send(JSON.stringify(payload));
  } catch (error) {
    logError(`Error enviando mensaje: ${error.message}`);
  }
}

function sendTextMessage(text) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    logError('No hay conexión activa. Usa "connect" o "reconnect" primero.');
    return;
  }
  
  if (!text || !text.trim()) {
    logError('Por favor proporciona un mensaje de texto.');
    return;
  }
  
  try {
    // El backend procesa texto a través del asistente de voz
    // Simulamos enviar el texto como si fuera una transcripción de audio
    // En la práctica, el backend espera audio, pero podemos probar con texto
    const payload = {
      event: 'text',
      message: text.trim(),
      timestamp: new Date().toISOString(),
    };
    
    logMessage(`Enviando mensaje de texto: "${text.trim()}"`, 'sent');
    logInfo('Nota: El backend procesa esto a través del asistente de voz');
    ws.send(JSON.stringify(payload));
  } catch (error) {
    logError(`Error enviando mensaje de texto: ${error.message}`);
  }
}

function sendRecipeCommand(command, args = {}) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    logError('No hay conexión activa. Usa "connect" o "reconnect" primero.');
    return;
  }
  
  const commands = {
    start: () => {
      const recipeId = args.recipeId || currentRecipeId || 'squash_risotto_2';
      logInfo(`Iniciando receta: ${recipeId}`);
      sendTextMessage(`Start recipe ${recipeId}`);
      currentRecipeId = recipeId;
    },
    next: () => {
      logInfo('Solicitando siguiente paso');
      sendTextMessage('What is the next step?');
    },
    done: () => {
      logInfo('Marcando paso como completado');
      sendTextMessage('This step is done');
    },
    repeat: () => {
      logInfo('Repitiendo paso actual');
      sendTextMessage('Can you repeat the current step?');
    },
    status: () => {
      logInfo('Consultando estado de la receta');
      sendTextMessage('What is the current status of the recipe?');
    },
    list: () => {
      logInfo('Listando recetas disponibles');
      sendTextMessage('What recipes are available?');
    },
  };
  
  if (commands[command]) {
    commands[command]();
  } else {
    logError(`Comando de receta desconocido: ${command}`);
    logInfo('Comandos disponibles: start, next, done, repeat, status, list');
  }
}

function startAudioCapture() {
  if (isRecording) {
    logWarning('Ya estás grabando audio. Usa "stopvoice" para detener.');
    return;
  }
  
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    logError('No hay conexión activa. Usa "connect" primero.');
    return;
  }
  
  // Verificar si sox está disponible (para macOS/Linux)
  const checkSox = spawn('which', ['sox']);
  checkSox.on('close', (code) => {
    if (code !== 0) {
      logError('Sox no está instalado. Instálalo con: brew install sox (macOS) o apt-get install sox (Linux)');
      logInfo('Alternativamente, puedes usar "text <mensaje>" para enviar texto directamente');
      return;
    }
    
    isRecording = true;
    logSuccess('Iniciando captura de audio...');
    logInfo('Habla ahora. Presiona Ctrl+C o escribe "stopvoice" para detener.');
    
    // Capturar audio usando sox (formato PCM 16-bit, 16kHz, mono)
    audioProcess = spawn('sox', [
      '-d',                    // Dispositivo de entrada por defecto
      '-t', 'raw',             // Formato raw
      '-r', '16000',           // Sample rate 16kHz
      '-c', '1',               // Mono
      '-b', '16',              // 16-bit
      '-e', 'signed-integer',  // Signed integer
      '-L',                    // Little-endian
      '-'                      // Salida a stdout
    ]);
    
    let audioBuffer = Buffer.alloc(0);
    const chunkSize = 3200; // ~200ms de audio a 16kHz, 16-bit, mono
    
    audioProcess.stdout.on('data', (chunk) => {
      audioBuffer = Buffer.concat([audioBuffer, chunk]);
      
      // Enviar chunks de audio cuando tengamos suficiente
      if (audioBuffer.length >= chunkSize) {
        const chunkToSend = audioBuffer.slice(0, chunkSize);
        audioBuffer = audioBuffer.slice(chunkSize);
        
        // Codificar a base64
        const base64Audio = chunkToSend.toString('base64');
        
        // Enviar al WebSocket
        try {
          ws.send(JSON.stringify({
            event: 'audio',
            data: base64Audio
          }));
        } catch (error) {
          logError(`Error enviando audio: ${error.message}`);
        }
      }
    });
    
    audioProcess.stderr.on('data', (data) => {
      // Ignorar mensajes de sox (suelen ser warnings)
    });
    
    audioProcess.on('close', (code) => {
      isRecording = false;
      if (code === 0) {
        logInfo('Captura de audio finalizada');
      } else {
        logWarning(`Proceso de audio terminó con código: ${code}`);
      }
    });
    
    audioProcess.on('error', (error) => {
      isRecording = false;
      logError(`Error en captura de audio: ${error.message}`);
    });
  });
}

function stopAudioCapture() {
  if (!isRecording) {
    logWarning('No hay grabación activa.');
    return;
  }
  
  if (audioProcess) {
    audioProcess.kill();
    audioProcess = null;
  }
  
  isRecording = false;
  logSuccess('Captura de audio detenida');
}

function showHelp() {
  log('\n📚 Comandos disponibles:', 'bright');
  log('\n🔌 Conexión:');
  log('  connect          - Conectar al WebSocket');
  log('  reconnect        - Reconectar al WebSocket');
  log('  disconnect       - Desconectar del WebSocket');
  log('  status           - Mostrar estado de la conexión');
  log('  session          - Mostrar Session ID actual');
  log('  newsession       - Generar un nuevo Session ID');
  
  log('\n💬 Mensajes:');
  log('  send <json>      - Enviar un mensaje JSON al servidor');
  log('  text <mensaje>   - Enviar un mensaje de texto');
  log('  test             - Enviar mensaje de prueba');
  
  log('\n🍳 Workflow de Recetas:');
  log('  recipe start [id] - Iniciar una receta (ej: recipe start squash_risotto_2)');
  log('  recipe next       - Solicitar siguiente paso');
  log('  recipe done       - Marcar paso actual como completado');
  log('  recipe repeat     - Repetir paso actual');
  log('  recipe status     - Consultar estado de la receta');
  log('  recipe list       - Listar recetas disponibles');
  
  log('\n🎤 Audio/Voz:');
  log('  voice start      - Iniciar captura de audio del micrófono');
  log('  voice stop       - Detener captura de audio');
  
  log('\n📖 Ayuda:');
  log('  examples         - Mostrar ejemplos de mensajes');
  log('  help             - Mostrar esta ayuda');
  log('  exit / quit      - Salir del script\n');
}

function showExamples() {
  log('\n📝 Ejemplos de uso:', 'bright');
  
  log('\n🍳 Workflow de Recetas:');
  log('   recipe start squash_risotto_2  - Iniciar receta específica', 'cyan');
  log('   recipe start                   - Iniciar receta por defecto', 'cyan');
  log('   recipe next                    - Pedir siguiente paso', 'cyan');
  log('   recipe done                    - Marcar paso como completado', 'cyan');
  log('   recipe repeat                  - Repetir paso actual', 'cyan');
  log('   recipe status                  - Ver estado de la receta', 'cyan');
  log('   recipe list                    - Ver recetas disponibles', 'cyan');
  
  log('\n💬 Mensajes de Texto:');
  log('   text What recipes do you have?', 'cyan');
  log('   text Start the squash risotto recipe', 'cyan');
  log('   text The oven is ready', 'cyan');
  log('   text I finished this step', 'cyan');
  
  log('\n🎤 Audio/Voz:');
  log('   voice start                    - Iniciar grabación (requiere sox)', 'cyan');
  log('   voice stop                     - Detener grabación', 'cyan');
  
  log('\n📋 Mensajes JSON:');
  log('   send {"event":"text","message":"Hello"}', 'cyan');
  
  log('\n💡 Tips:');
  log('   - Los comandos de receta envían texto que el asistente interpreta', 'yellow');
  log('   - Para voz, necesitas instalar sox: brew install sox (macOS)', 'yellow');
  log('   - El audio se envía en tiempo real al WebSocket\n', 'yellow');
}

function showStatus() {
  log('\n📊 Estado de la conexión:', 'bright');
  log(`  URL: ${WS_URL}`);
  log(`  Session ID: ${sessionId}`);
  log(`  Conectado: ${isConnected ? '✅ Sí' : '❌ No'}`);
  if (ws) {
    const states = {
      [WebSocket.CONNECTING]: '🔄 Conectando',
      [WebSocket.OPEN]: '✅ Abierto',
      [WebSocket.CLOSING]: '🔄 Cerrando',
      [WebSocket.CLOSED]: '❌ Cerrado',
    };
    log(`  Estado WebSocket: ${states[ws.readyState] || 'Desconocido'}`);
  }
  log('');
}

function disconnect() {
  // Detener grabación de audio si está activa
  if (isRecording) {
    stopAudioCapture();
  }
  
  if (ws) {
    logInfo('Cerrando conexión...');
    ws.close();
    ws = null;
    isConnected = false;
  } else {
    logWarning('No hay conexión activa.');
  }
}

// Manejar comandos de línea
rl.on('line', (input) => {
  const command = input.trim().toLowerCase();
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  if (!command) {
    rl.prompt();
    return;
  }

  switch (cmd) {
    case 'connect':
    case 'c':
      if (isConnected) {
        logWarning('Ya hay una conexión activa. Usa "disconnect" primero.');
      } else {
        connect();
      }
      break;

    case 'reconnect':
    case 'r':
      disconnect();
      setTimeout(() => {
        sessionId = generateSessionId();
        connect();
      }, 1000);
      break;

    case 'disconnect':
    case 'd':
      disconnect();
      break;

    case 'status':
    case 's':
      showStatus();
      break;

    case 'session':
      logInfo(`Session ID actual: ${sessionId}`);
      break;

    case 'newsession':
      sessionId = generateSessionId();
      logSuccess(`Nuevo Session ID: ${sessionId}`);
      break;

    case 'send':
      if (!args) {
        logError('Uso: send <json_string>');
        logInfo('Ejemplo: send {"event":"text","message":"Hola"}');
      } else {
        sendMessage(args);
      }
      break;

    case 'text':
    case 't':
      if (!args) {
        logError('Uso: text <mensaje>');
        logInfo('Ejemplo: text Hola, ¿qué recetas tienes?');
      } else {
        sendTextMessage(args);
      }
      break;

    case 'recipe':
    case 'r':
      if (!args) {
        logError('Uso: recipe <comando> [argumentos]');
        logInfo('Comandos: start [recipe_id], next, done, repeat, status, list');
      } else {
        const recipeParts = args.split(/\s+/);
        const recipeCmd = recipeParts[0];
        const recipeArgs = recipeParts.slice(1);
        
        if (recipeCmd === 'start') {
          sendRecipeCommand('start', { recipeId: recipeArgs[0] });
        } else {
          sendRecipeCommand(recipeCmd);
        }
      }
      break;

    case 'voice':
    case 'v':
      if (!args || args === 'start') {
        startAudioCapture();
      } else if (args === 'stop') {
        stopAudioCapture();
      } else {
        logError('Uso: voice start | voice stop');
      }
      break;

    case 'stopvoice':
      stopAudioCapture();
      break;

    case 'test':
      sendMessage({
        event: 'test',
        message: 'Mensaje de prueba desde script',
        timestamp: new Date().toISOString(),
      });
      break;

    case 'examples':
    case 'ex':
      showExamples();
      break;

    case 'help':
    case 'h':
      showHelp();
      break;

    case 'exit':
    case 'quit':
    case 'q':
      logInfo('Cerrando conexión y saliendo...');
      disconnect();
      rl.close();
      process.exit(0);
      break;

    default:
      logWarning(`Comando desconocido: ${command}`);
      logInfo('Escribe "help" para ver comandos disponibles');
  }

  rl.prompt();
});

// Manejar Ctrl+C
rl.on('SIGINT', () => {
  log('\n\n⚠️  Interrupción recibida. Cerrando...', 'yellow');
  disconnect();
  rl.close();
  process.exit(0);
});

// Iniciar
log('\n🚀 Script de prueba WebSocket para agent-v0 backend', 'bright');
log('═══════════════════════════════════════════════════════\n', 'bright');
showStatus();
showHelp();
logInfo('Escribe "connect" para iniciar la conexión');
rl.prompt();
