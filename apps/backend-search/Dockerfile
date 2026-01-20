FROM python:3.11-slim-bullseye

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgomp1 \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first to leverage Docker layer caching
COPY apps/backend-search/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Copy and install CCAI package (required for chat agent)
# Note: deepgram-sdk should already be installed from requirements.txt above
# This ensures version compatibility before installing ccai
COPY packages/ccai /app/packages/ccai
RUN pip install /app/packages/ccai

# Copy application source
COPY apps/backend-search /app/apps/backend-search

# Copy recipe data needed by the search agent
COPY data/recipes /app/data/recipes

WORKDIR /app/apps/backend-search
ENV PYTHONPATH="/app/apps/backend-search"

EXPOSE 8080

CMD ["sh", "-c", "uvicorn recipe_search_agent.api:app --host 0.0.0.0 --port ${PORT:-8080}"]
