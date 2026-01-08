"""
Vercel serverless function wrapper for FastAPI app.
This file is used by Vercel to deploy the FastAPI backend as serverless functions.
"""

import sys
import os
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

# Set environment variables if not already set (Vercel provides these)
# Load from .env if it exists (for local development)
env_file = project_root / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

# Import the FastAPI app
from recipe_search_agent.api import app

# Vercel expects a handler function that takes (event, context)
# We need to use mangum to convert ASGI app to AWS Lambda handler
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    # Fallback if mangum is not available
    # Vercel Python runtime should handle ASGI apps directly
    handler = app
