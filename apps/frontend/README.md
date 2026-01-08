# Jamie Oliver 1.0

This is a code bundle for Jamie Oliver 1.0. The original project is available at https://www.figma.com/design/3aq8jgcG94z0HSLbGyKCOq/Jamie-Oliver-1.0.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (optional):
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` to configure:
   - `VITE_WS_URL`: WebSocket URL for agent-v0 backend (default: production URL)
   - `VITE_API_BASE_URL`: API URL for semantic search backend (default: `http://localhost:8000`)

## Running the code

Run `npm run dev` to start the development server.

## Backend Setup

To connect to a local backend, see [docs/LOCAL_BACKEND_SETUP.md](./docs/LOCAL_BACKEND_SETUP.md) for detailed instructions.

## Testing WebSocket Connection

Use the test script to verify WebSocket connectivity:

```bash
npm run test:websocket
```

Or with a custom URL:

```bash
node scripts/test-websocket.js ws://localhost:8000/ws/voice
```

See [scripts/README.md](./scripts/README.md) for more details.
