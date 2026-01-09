FROM python:3.11-slim-bullseye

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first to leverage Docker layer caching
# Copy requirements (if present) and install dependencies
COPY apps/backend-search/requirements.txt /app/apps/backend-search/requirements.txt
RUN if [ -f /app/apps/backend-search/requirements.txt ]; then \
      pip install --upgrade pip && \
      pip install -r /app/apps/backend-search/requirements.txt; \
    else \
      pip install --upgrade pip; \
    fi

# Copy application source
COPY apps/backend-search /app/apps/backend-search

# Copy recipe data needed by the search agent
COPY data/recipes /app/data/recipes

WORKDIR /app/apps/backend-search
ENV PYTHONPATH="/app/apps/backend-search"

CMD ["uvicorn", "recipe_search_agent.api:app", "--host", "0.0.0.0", "--port", "8000"]
