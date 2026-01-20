#!/bin/bash

# Graceful shutdown handler
shutdown() {
    echo "🛑 Received shutdown signal, gracefully stopping..."
    kill -TERM "$APP_PID" 2>/dev/null
    wait "$APP_PID"
    echo "✅ Application stopped gracefully"
    exit 0
}

# Set up signal handlers
trap 'shutdown' SIGTERM SIGINT

echo "🔧 Installing ccai in editable mode with dependencies..."
cd /app/packages/ccai
# pyaudio is optional - if it fails, that's OK since backend-voice uses WebSocketAudioInterface
pip install -e . || {
    echo "⚠️  Standard installation had issues (likely pyaudio), installing without it..."
    pip install -e . --no-deps || true
    pip install "pydantic>=2.9.2" "docstring-parser>=0.16" "certifi>=2024.8.30" \
        "deepgram-sdk>=3.7.6" "mailjet-rest>=1.4.0" "langfuse>=3.3.0" || true
    echo "✅ ccai installed (pyaudio skipped - not needed for backend-voice)"
}
cd /app/apps/backend-voice

echo "🚀 Starting application..."
# Start the application in background and capture PID
"$@" &
APP_PID=$!

# Wait for the application to finish
wait "$APP_PID"

