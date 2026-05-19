#!/usr/bin/env node

/**
 * WebSocket smoke test for agent-v0 backend
 *
 * Usage:
 *   node scripts/test-websocket.js [ws_url]
 *
 * Example:
 *   node scripts/test-websocket.js wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice
 */

const WebSocket = require('ws');
const readline = require('readline');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Default WebSocket URL (override with argv)
const WS_URL = process.argv[2] || 'ws://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice';

// Console colors
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

// Unique session id
function generateSessionId() {
  return `test_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Readline UI
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
  logInfo(`Connecting to: ${WS_URL}`);
  logInfo(`Session ID: ${sessionId}`);
  
  try {
    ws = new WebSocket(WS_URL, {
      headers: {
        'User-Agent': 'jo-ai-v1-test-script/1.0',
      },
    });

    ws.on('open', () => {
      isConnected = true;
      logSuccess('WebSocket connected');
      
      // Initial wire protocol message
      const startMessage = {
        event: 'start',
        sessionId: sessionId,
        sampleRate: 16000,
        customParameters: currentRecipeId ? { recipeId: currentRecipeId } : {},
      };
      
      logMessage(`Sending start message: ${JSON.stringify(startMessage, null, 2)}`, 'sent');
      ws.send(JSON.stringify(startMessage));
      
      logInfo('Waiting for server messages...');
      logInfo('Type "help" for commands');
      rl.prompt();
    });

    ws.on('message', (data) => {
      try {
        // Try JSON first
        let message;
        try {
          message = JSON.parse(data.toString());
          logMessage(`Received (JSON):\n${JSON.stringify(message, null, 2)}`, 'received');
        } catch (e) {
          // Plain text / binary preview
          const preview = data.toString().substring(0, 100);
          logMessage(`Received (text/binary, first 100 chars):\n${preview}${data.length > 100 ? '...' : ''}`, 'received');
          logWarning(`Payload size: ${data.length} bytes`);
        }
        
        // Classify event type
        if (message && message.event) {
          switch (message.event) {
            case 'recipe_state':
              logInfo('📋 Recipe state updated');
              break;
            case 'recipe_message':
              logInfo(`💬 Message: ${message.data?.message || 'N/A'}`);
              break;
            case 'recipe_error':
              logError(`Recipe error: ${message.data?.error || 'N/A'}`);
              break;
            case 'manager_system':
              logInfo(`🔧 System: ${message.data?.message || 'N/A'}`);
              break;
            case 'audio':
              logInfo(`🔊 Audio (${message.data?.length || 0} bytes)`);
              break;
            case 'control':
              logInfo(`🎮 Control: ${JSON.stringify(message.data)}`);
              break;
            case 'stop':
              logWarning('🛑 Stop signal received');
              break;
            default:
              logInfo(`📨 Unknown event: ${message.event}`);
          }
        }
      } catch (error) {
        logError(`Error handling message: ${error.message}`);
      }
      
      rl.prompt();
    });

    ws.on('error', (error) => {
      logError(`WebSocket error: ${error.message}`);
      if (error.code) {
        logError(`Error code: ${error.code}`);
      }
      if (error.code === 'ECONNREFUSED') {
        logError('Connection refused — is the server running?');
      } else if (error.code === 'ENOTFOUND') {
        logError('Host not found — check the URL.');
      }
      rl.prompt();
    });

    ws.on('close', (code, reason) => {
      isConnected = false;
      logWarning(`WebSocket closed. Code: ${code}, Reason: ${reason || 'N/A'}`);
      
      if (code === 1006) {
        logError('Connection closed abnormally (1006). Common causes:');
        logError('  - Server unreachable');
        logError('  - Network / firewall issues');
        logError('  - Server rejected the socket');
      }
      
      logInfo('Press Ctrl+C to exit or type "reconnect"');
      rl.prompt();
    });

    ws.on('ping', () => {
      logInfo('Ping from server');
      if (ws.isAlive === false) {
        ws.isAlive = true;
      }
    });

    ws.on('pong', () => {
      logInfo('Pong from server');
    });

  } catch (error) {
    logError(`Failed to create WebSocket: ${error.message}`);
    rl.prompt();
  }
}

function sendMessage(message) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    logError('No active connection. Run "connect" or "reconnect".');
    return;
  }
  
  try {
    let payload;
    if (typeof message === 'string') {
      // Try parsing as JSON
      try {
        payload = JSON.parse(message);
      } catch (e) {
        // Plain-object fallback when not JSON
        payload = { message: message };
      }
    } else {
      payload = message;
    }
    
    logMessage(`Sending: ${JSON.stringify(payload, null, 2)}`, 'sent');
    ws.send(JSON.stringify(payload));
  } catch (error) {
    logError(`Send failed: ${error.message}`);
  }
}

function sendTextMessage(text) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    logError('No active connection. Run "connect" or "reconnect".');
    return;
  }
  
  if (!text || !text.trim()) {
    logError('Please provide text after "text".');
    return;
  }
  
  try {
    // Backend routes text through the voice assistant path.
    // We send plain text like a simulated transcription.
    // Production favors audio; text is for debugging.
    const payload = {
      event: 'text',
      message: text.trim(),
      timestamp: new Date().toISOString(),
    };
    
    logMessage(`Sending text: "${text.trim()}"`, 'sent');
    logInfo('Note: backend still expects audio in production; text is for debugging');
    ws.send(JSON.stringify(payload));
  } catch (error) {
    logError(`Text send failed: ${error.message}`);
  }
}

function sendRecipeCommand(command, args = {}) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    logError('No active connection. Run "connect" or "reconnect".');
    return;
  }
  
  const commands = {
    start: () => {
      const recipeId = args.recipeId || currentRecipeId || 'squash_risotto_2';
      logInfo(`Starting recipe: ${recipeId}`);
      sendTextMessage(`Start recipe ${recipeId}`);
      currentRecipeId = recipeId;
    },
    next: () => {
      logInfo('Requesting next step');
      sendTextMessage('What is the next step?');
    },
    done: () => {
      logInfo('Marking step complete');
      sendTextMessage('This step is done');
    },
    repeat: () => {
      logInfo('Repeating current step');
      sendTextMessage('Can you repeat the current step?');
    },
    status: () => {
      logInfo('Recipe status query');
      sendTextMessage('What is the current status of the recipe?');
    },
    list: () => {
      logInfo('Listing recipes');
      sendTextMessage('What recipes are available?');
    },
  };
  
  if (commands[command]) {
    commands[command]();
  } else {
    logError(`Unknown recipe command: ${command}`);
    logInfo('Commands: start, next, done, repeat, status, list');
  }
}

function startAudioCapture() {
  if (isRecording) {
    logWarning('Already recording. Use "stopvoice" to stop.');
    return;
  }
  
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    logError('No active connection. Run "connect" first.');
    return;
  }
  
  // Check sox is available (macOS/Linux)
  const checkSox = spawn('which', ['sox']);
  checkSox.on('close', (code) => {
    if (code !== 0) {
      logError('sox not found. Install: brew install sox (macOS) or apt-get install sox (Linux)');
      logInfo('You can still use: text <your message>');
      return;
    }
    
    isRecording = true;
    logSuccess('Starting microphone capture...');
    logInfo('Speak now. Press Ctrl+C or type "stopvoice" to stop.');
    
    // Capture audio with sox (PCM 16-bit, 16 kHz, mono)
    audioProcess = spawn('sox', [
      '-d',                    // Default input device
      '-t', 'raw',             // Raw format
      '-r', '16000',           // Sample rate 16 kHz
      '-c', '1',               // Mono
      '-b', '16',              // 16-bit
      '-e', 'signed-integer',  // Signed integer
      '-L',                    // Little-endian
      '-'                      // Stdout
    ]);
    
    let audioBuffer = Buffer.alloc(0);
    const chunkSize = 3200; // ~200 ms at 16 kHz, 16-bit, mono
    
    audioProcess.stdout.on('data', (chunk) => {
      audioBuffer = Buffer.concat([audioBuffer, chunk]);
      
      // Send when we have a full chunk
      if (audioBuffer.length >= chunkSize) {
        const chunkToSend = audioBuffer.slice(0, chunkSize);
        audioBuffer = audioBuffer.slice(chunkSize);
        
        // Base64-encode
        const base64Audio = chunkToSend.toString('base64');
        
        // Send over WebSocket
        try {
          ws.send(JSON.stringify({
            event: 'audio',
            data: base64Audio
          }));
        } catch (error) {
          logError(`Audio send error: ${error.message}`);
        }
      }
    });
    
    audioProcess.stderr.on('data', (data) => {
      // Ignore sox stderr (usually benign warnings)
    });
    
    audioProcess.on('close', (code) => {
      isRecording = false;
      if (code === 0) {
        logInfo('Audio capture finished');
      } else {
        logWarning(`Audio process exited: ${code}`);
      }
    });
    
    audioProcess.on('error', (error) => {
      isRecording = false;
      logError(`Audio capture error: ${error.message}`);
    });
  });
}

function stopAudioCapture() {
  if (!isRecording) {
    logWarning('Not recording.');
    return;
  }
  
  if (audioProcess) {
    audioProcess.kill();
    audioProcess = null;
  }
  
  isRecording = false;
  logSuccess('Audio capture stopped');
}

function showHelp() {
  log('\n📚 Commands:', 'bright');
  log('\n🔌 Connection:');
  log('  connect          - Connect to WebSocket');
  log('  reconnect        - Reconnect WebSocket');
  log('  disconnect       - Disconnect WebSocket');
  log('  status           - Show connection status');
  log('  session          - Show current session id');
  log('  newsession       - Generate a new session id');
  
  log('\n💬 Messages:');
  log('  send <json>      - Send a JSON message to the server');
  log('  text <message>   - Send a plain-text message');
  log('  test             - Send a test message');
  
  log('\n🍳 Recipe workflow:');
  log('  recipe start [id] - Start a recipe (e.g. recipe start squash_risotto_2)');
  log('  recipe next       - Ask for the next step');
  log('  recipe done       - Mark current step complete');
  log('  recipe repeat     - Repeat current step');
  log('  recipe status     - Ask for recipe status');
  log('  recipe list       - List available recipes');
  
  log('\n🎤 Audio / voice:');
  log('  voice start      - Start microphone capture (sox)');
  log('  voice stop       - Stop microphone capture');
  
  log('\n📖 Help:');
  log('  examples         - Show message examples');
  log('  help             - Show this help');
  log('  exit / quit      - Exit the script\n');
}

function showExamples() {
  log('\n📝 Examples:', 'bright');
  
  log('\n🍳 Recipe workflow:');
  log('   recipe start squash_risotto_2  - Start a specific recipe', 'cyan');
  log('   recipe start                   - Start default recipe', 'cyan');
  log('   recipe next                    - Next step', 'cyan');
  log('   recipe done                    - Step complete', 'cyan');
  log('   recipe repeat                  - Repeat current step', 'cyan');
  log('   recipe status                  - Recipe status', 'cyan');
  log('   recipe list                    - List recipes', 'cyan');
  
  log('\n💬 Text messages:');
  log('   text What recipes do you have?', 'cyan');
  log('   text Start the squash risotto recipe', 'cyan');
  log('   text The oven is ready', 'cyan');
  log('   text I finished this step', 'cyan');
  
  log('\n🎤 Audio / voice:');
  log('   voice start                    - Start recording (needs sox)', 'cyan');
  log('   voice stop                     - Stop recording', 'cyan');
  
  log('\n📋 JSON:');
  log('   send {"event":"text","message":"Hello"}', 'cyan');
  
  log('\n💡 Tips:');
  log('   - Recipe commands send text the assistant interprets', 'yellow');
  log('   - Voice needs sox: brew install sox (macOS)', 'yellow');
  log('   - Audio streams to the WebSocket in real time\n', 'yellow');
}

function showStatus() {
  log('\n📊 Connection status:', 'bright');
  log(`  URL: ${WS_URL}`);
  log(`  Session ID: ${sessionId}`);
  log(`  Connected: ${isConnected ? '✅ Yes' : '❌ No'}`);
  if (ws) {
    const states = {
      [WebSocket.CONNECTING]: '🔄 Connecting',
      [WebSocket.OPEN]: '✅ Open',
      [WebSocket.CLOSING]: '🔄 Closing',
      [WebSocket.CLOSED]: '❌ Closed',
    };
    log(`  WebSocket: ${states[ws.readyState] || 'Unknown'}`);
  }
  log('');
}

function disconnect() {
  // Stop recording if active
  if (isRecording) {
    stopAudioCapture();
  }
  
  if (ws) {
    logInfo('Closing connection...');
    ws.close();
    ws = null;
    isConnected = false;
  } else {
    logWarning('No active connection.');
  }
}

// Line command handler
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
        logWarning('Already connected. Use "disconnect" first.');
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
      logInfo(`Current session id: ${sessionId}`);
      break;

    case 'newsession':
      sessionId = generateSessionId();
      logSuccess(`New session id: ${sessionId}`);
      break;

    case 'send':
      if (!args) {
        logError('Usage: send <json_string>');
        logInfo('Example: send {"event":"text","message":"Hello"}');
      } else {
        sendMessage(args);
      }
      break;

    case 'text':
    case 't':
      if (!args) {
        logError('Usage: text <message>');
        logInfo('Example: text What recipes do you have?');
      } else {
        sendTextMessage(args);
      }
      break;

    case 'recipe':
    case 'r':
      if (!args) {
        logError('Usage: recipe <command> [args]');
        logInfo('Commands: start [recipe_id], next, done, repeat, status, list');
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
        logError('Usage: voice start | voice stop');
      }
      break;

    case 'stopvoice':
      stopAudioCapture();
      break;

    case 'test':
      sendMessage({
        event: 'test',
        message: 'Test message from script',
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
      logInfo('Closing connection and exiting...');
      disconnect();
      rl.close();
      process.exit(0);
      break;

    default:
      logWarning(`Unknown command: ${command}`);
      logInfo('Type "help" for available commands');
  }

  rl.prompt();
});

// Ctrl+C
rl.on('SIGINT', () => {
  log('\n\n⚠️  Interrupt received. Closing...', 'yellow');
  disconnect();
  rl.close();
  process.exit(0);
});

// Start
log('\n🚀 WebSocket smoke test — agent-v0 backend', 'bright');
log('═══════════════════════════════════════════════════════\n', 'bright');
showStatus();
showHelp();
logInfo('Type "connect" to start the connection');
rl.prompt();
