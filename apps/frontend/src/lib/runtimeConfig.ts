/**
 * Prefer VITE_API_BASE_URL (set in Vercel / CI to your backend-search public URL).
 * Only default to port 8000 on localhost — using the production site's hostname
 * with :8000 breaks in prod and triggers a silent fallback to bundled recipes-json.
 */
const resolveApiBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8000';
  }

  const hostname = window.location.hostname || '127.0.0.1';
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = hostname === 'localhost' ? '127.0.0.1' : hostname;
    return `${protocol}//${host}:8000`;
  }

  console.error(
    '[runtimeConfig] VITE_API_BASE_URL is not set. Recipe API requests will fail until you set it to your backend-search URL (e.g. https://….up.railway.app).'
  );
  return '';
};

// @ts-expect-error - Vite provides import.meta.env at runtime
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || resolveApiBaseUrl();

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
