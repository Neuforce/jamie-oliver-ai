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
pip install -e .
cd /app/apps/backend-voice

echo "🚀 Starting application..."
# Start the application in background and capture PID
"$@" &
APP_PID=$!

# Wait for the application to finish
wait "$APP_PID"

