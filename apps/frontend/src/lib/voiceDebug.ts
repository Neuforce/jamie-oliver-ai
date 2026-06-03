/** Enable verbose voice hot-path logging: set VITE_VOICE_DEBUG=true in .env.local */
export const VOICE_DEBUG =
  import.meta.env.DEV && import.meta.env.VITE_VOICE_DEBUG === 'true';

export function voiceDebugLog(...args: unknown[]): void {
  if (VOICE_DEBUG) {
    console.log(...args);
  }
}

export function voiceDebugInfo(...args: unknown[]): void {
  if (VOICE_DEBUG) {
    console.info(...args);
  }
}
