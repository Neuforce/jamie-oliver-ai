const resolveApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8000';
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = window.location.hostname === 'localhost'
    ? '127.0.0.1'
    : window.location.hostname || '127.0.0.1';

  return `${protocol}//${hostname}:8000`;
};

// @ts-expect-error - Vite provides import.meta.env at runtime
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || resolveApiBaseUrl();

/*
 * Voice WebSocket base URL.
 *
 * The production voice handler lives on the search/chat backend (port 8000)
 * at `/ws/chat-voice` — NOT the standalone `backend-voice` service on 8100.
 * We therefore derive the voice URL from `API_BASE_URL` and the consumer
 * (`useVoiceChat`) appends `/ws/chat-voice`.
 */
export const VOICE_WS_URL = API_BASE_URL.replace(/^https?/, (protocol) =>
  protocol === 'https' ? 'wss' : 'ws'
);
