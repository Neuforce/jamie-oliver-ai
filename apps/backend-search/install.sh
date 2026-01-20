#!/bin/bash
# Installation script for Railway deployment
# Ensures all dependencies are installed correctly, including ccai package

set -e

echo "🔧 Installing backend-search dependencies..."

# Upgrade pip
pip install --upgrade pip

# Install requirements.txt first (includes deepgram-sdk with correct version)
echo "📦 Installing requirements from requirements.txt..."
pip install -r requirements.txt

# Install ccai package from monorepo root
# This ensures deepgram-sdk is already installed before ccai tries to use it
echo "📦 Installing ccai package..."
cd ../../packages/ccai
pip install -e .
cd ../../apps/backend-search

echo "✅ All dependencies installed successfully"
