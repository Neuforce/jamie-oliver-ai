#!/bin/bash
# Installation script for Railway deployment
# Ensures all dependencies are installed correctly, including ccai package
# This fixes the deepgram-sdk ImportError by installing dependencies in the correct order

set -e

echo "🔧 Installing backend-search dependencies..."

# Upgrade pip
pip install --upgrade pip

# Install requirements.txt first (includes deepgram-sdk with correct version)
# This ensures deepgram-sdk is installed before ccai tries to use it
echo "📦 Installing requirements from requirements.txt..."
pip install -r requirements.txt

# Verify deepgram-sdk is installed
python -c "import deepgram; print(f'✅ deepgram-sdk version: {deepgram.__version__}')" || {
    echo "❌ deepgram-sdk installation failed"
    exit 1
}

# Install ccai package from monorepo root
echo "📦 Installing ccai package..."
cd ../../packages/ccai
pip install -e .
cd ../../apps/backend-search

echo "✅ All dependencies installed successfully"
