ARG PYTHON_VERSION=3.11
FROM python:${PYTHON_VERSION}-slim-bullseye

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends --fix-missing \
    build-essential \
    libpq-dev \
    portaudio19-dev \
    libportaudio2 \
    curl \
    || (apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        portaudio19-dev \
        libportaudio2 \
        curl) && \
    rm -rf /var/lib/apt/lists/*

# Copy files needed for dependency installation
COPY apps/backend-voice/requirements.txt ./apps/backend-voice/
COPY apps/backend-voice/README.md ./apps/backend-voice/
COPY packages/ccai /app/packages/ccai

# Install Python dependencies
WORKDIR /app/apps/backend-voice
RUN pip install --upgrade pip && \
    pip install -r requirements.txt && \
    pip install -e /app/packages/ccai

# Copy backend source
COPY apps/backend-voice/src ./src

# Copy startup script
COPY apps/backend-voice/startup.sh /app/startup.sh
RUN sed -i 's/\r$//' /app/startup.sh && chmod +x /app/startup.sh

WORKDIR /app/apps/backend-voice
ENV PYTHONPATH="/app/apps/backend-voice/src:/app/packages"

ENTRYPOINT ["/app/startup.sh"]
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100"]

