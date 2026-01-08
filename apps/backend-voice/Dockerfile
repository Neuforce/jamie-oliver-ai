ARG PYTHON_VERSION=3.11
FROM python:${PYTHON_VERSION}-slim-bullseye

ENV PYTHONUNBUFFERED=1 \
    POETRY_VERSION=2.1.1 \
    POETRY_HOME=/opt/poetry \
    PATH="$POETRY_HOME/bin:$PATH"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    portaudio19-dev \
    libportaudio2 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip install poetry==$POETRY_VERSION && rm -rf /var/lib/apt/lists/*

# Copy files needed for dependency installation
COPY apps/backend-voice/pyproject.toml ./apps/backend-voice/
COPY packages/ccai ./packages/

WORKDIR /app/apps/backend-voice
RUN poetry config virtualenvs.create false && \
    poetry install --no-root --only main || \
    pip install -e .

# Copy backend source
COPY apps/backend-voice/src ./src

# Copy data/recipes directory
COPY data/recipes /app/data/recipes

# Copy startup script
COPY apps/backend-voice/startup.sh /app/startup.sh
RUN sed -i 's/\r$//' /app/startup.sh && chmod +x /app/startup.sh

WORKDIR /app/apps/backend-voice
ENV PYTHONPATH="/app/apps/backend-voice/src:/app/packages"

ENTRYPOINT ["/app/startup.sh"]
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100"]

