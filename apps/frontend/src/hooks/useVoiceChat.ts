/**
 * useVoiceChat – Voice chat hook for recipe discovery.
 *
 * Design
 * ──────
 * The browser captures mic audio continuously and streams every chunk to the
 * backend over WebSocket.  The BACKEND is the sole source of truth for turn
 * state (listening / processing / speaking) and barge-in detection.
 *
 * Why server-side barge-in?
 *   • Deepgram's VAD already runs on the audio stream – no need to duplicate
 *     amplitude detection in JavaScript.
 *   • Browser AEC (echoCancellation: true on getUserMedia) prevents Jamie's
 *     own voice from being transcribed as user speech.
 *   • Removes a major source of fragility: complex client-state machines that
 *     had to mirror server state under network jitter.
 *
 * The hook still responds to server "interrupted" events to stop local audio
 * playback immediately, and still supports manual interrupt / cancel buttons.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioCapture } from './useAudioCapture';
import { useAudioPlayback } from './useAudioPlayback';
import type { VoiceTurnState } from './voiceTurnUtils';

export type VoiceChatState = VoiceTurnState;

export interface VoiceChatMessage {
  event: string;
  data?: any;
  responseId?: string;
}

export interface VoiceChatRecipes {
  recipes: Array<{
    recipe_id: string;
    title: string;
    [key: string]: any;
  }>;
  [key: string]: any;
}

export interface UseVoiceChatOptions {
  /** Session ID to share with text chat (required for unified experience) */
  sessionId: string;
  /** Callback when transcript (partial or final) is received */
  onTranscript?: (text: string, isFinal: boolean) => void;
  /** Callback when text response chunk is received */
  onTextChunk?: (text: string) => void;
  /** Callback when recipes are received */
  onRecipes?: (data: VoiceChatRecipes) => void;
  /** Callback when meal plan is received */
  onMealPlan?: (data: any) => void;
  /** Callback when recipe detail is received */
  onRecipeDetail?: (data: any) => void;
  /** Callback when shopping list is received */
  onShoppingList?: (data: any) => void;
  /** Callback when response is complete */
  onDone?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Sample rate for audio capture (default: 16000) */
  sampleRate?: number;
}

export function useVoiceChat(options: UseVoiceChatOptions) {
  const {
    sessionId,
    onTranscript,
    onTextChunk,
    onRecipes,
    onMealPlan,
    onRecipeDetail,
    onShoppingList,
    onDone,
    onError,
    sampleRate = 16000,
  } = options;

  // ── state ──────────────────────────────────────────────────────────────
  const [state, setState] = useState<VoiceChatState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isPausedByVisibility, setIsPausedByVisibility] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // ── refs ───────────────────────────────────────────────────────────────
  const wsRef                = useRef<WebSocket | null>(null);
  const isVoiceModeActiveRef = useRef(false);
  const isMicManuallyMutedRef = useRef(false);
  // Deferred state transitions while audio is still playing
  const pendingDoneRef   = useRef(false);
  const pendingListenRef = useRef(false);
  // Track the active response so stale audio from a previous turn is discarded
  const activeResponseIdRef = useRef<string | null>(null);

  // Keep callbacks stable via ref so closures don't go stale
  const callbacksRef = useRef(options);
  useEffect(() => { callbacksRef.current = options; }, [options]);

  // ── helpers ────────────────────────────────────────────────────────────

  const sendSocketEvent = useCallback((event: string, data?: unknown) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const payload: Record<string, unknown> = { event };
    if (data !== undefined) payload.data = data;
    wsRef.current.send(JSON.stringify(payload));
  }, []);

  const resetActiveResponse = useCallback(() => {
    activeResponseIdRef.current = null;
  }, []);

  const isCurrentResponse = useCallback((responseId?: string) => {
    if (!responseId) return false;
    return activeResponseIdRef.current === responseId;
  }, []);

  // ── audio playback ─────────────────────────────────────────────────────
  const { playAudio, stopAllAudio, cleanup: cleanupAudio, initAudioContext } = useAudioPlayback({
    onPlaybackStateChange: setIsAudioPlaying,
  });

  // ── audio capture ──────────────────────────────────────────────────────
  // Always stream mic audio to the backend.  The server (Deepgram) decides
  // whether the user is speaking and triggers barge-in server-side.
  const { startCapture, stopCapture, setMuted } = useAudioCapture({
    sampleRate,
    onAudioData: useCallback((base64Audio: string) => {
      if (
        wsRef.current?.readyState !== WebSocket.OPEN
        || !isVoiceModeActiveRef.current
        || isMicManuallyMutedRef.current
      ) {
        return;
      }
      wsRef.current.send(JSON.stringify({ event: 'audio', data: base64Audio }));
    }, []),
  });

  // ── WebSocket URL ──────────────────────────────────────────────────────
  const getWebSocketUrl = useCallback(() => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
    return `${baseUrl.replace(/^https?/, wsProtocol)}/ws/chat-voice`;
  }, []);

  // ── message handler ────────────────────────────────────────────────────
  const handleMessage = useCallback((message: VoiceChatMessage) => {
    const { event, data, responseId } = message;
    const callbacks = callbacksRef.current;

    switch (event) {
      case 'session_info':
        console.log('🎤 Voice session started:', data);
        break;

      case 'listening':
        // Server is ready for the next user turn.  If the browser still has
        // buffered TTS audio playing, defer the state transition.
        if (isAudioPlaying) {
          pendingListenRef.current = true;
        } else {
          resetActiveResponse();
          setState('listening');
          setCurrentTranscript('');
        }
        break;

      case 'transcript_interim':
        setState('user_speaking');
        setCurrentTranscript(data || '');
        callbacks.onTranscript?.(data || '', false);
        break;

      case 'transcript_final':
        // New user utterance confirmed – any in-flight assistant audio is stale.
        stopAllAudio();
        resetActiveResponse();
        setState('user_speaking');
        setCurrentTranscript(data || '');
        callbacks.onTranscript?.(data || '', true);
        break;

      case 'processing':
        if (!responseId) {
          console.warn('[useVoiceChat] Ignoring processing event without responseId');
          break;
        }
        // New response turn – drop any audio from the previous one.
        if (activeResponseIdRef.current && activeResponseIdRef.current !== responseId) {
          stopAllAudio();
        }
        activeResponseIdRef.current = responseId;
        setState('processing');
        break;

      case 'text_chunk':
        if (!isCurrentResponse(responseId)) return;
        setState('assistant_speaking');
        callbacks.onTextChunk?.(data || '');
        break;

      case 'audio':
        if (!isCurrentResponse(responseId)) return;
        if (data) playAudio(data);
        break;

      case 'recipes':
        callbacks.onRecipes?.(data);
        break;

      case 'meal_plan':
        callbacks.onMealPlan?.(data);
        break;

      case 'recipe_detail':
        callbacks.onRecipeDetail?.(data);
        break;

      case 'shopping_list':
        callbacks.onShoppingList?.(data);
        break;

      case 'tool_call':
        console.log('🔧 Tool called:', data?.name);
        break;

      case 'done':
        if (!isCurrentResponse(responseId)) return;
        pendingDoneRef.current = true;
        if (!isAudioPlaying) {
          pendingDoneRef.current = false;
          resetActiveResponse();
          setState('listening');
          setCurrentTranscript('');
          callbacks.onDone?.();
        }
        break;

      case 'interrupted':
        // Server confirmed barge-in or cancel – stop local playback immediately.
        stopAllAudio();
        resetActiveResponse();
        setState('listening');
        setCurrentTranscript('');
        break;

      case 'error':
        setError(data || 'Unknown error');
        callbacks.onError?.(data || 'Unknown error');
        break;

      default:
        console.log('🎤 Unhandled voice chat event:', event, data);
    }
  }, [isAudioPlaying, isCurrentResponse, playAudio, resetActiveResponse, stopAllAudio]);

  // ── pending state transitions (audio drain) ────────────────────────────
  useEffect(() => {
    if (isAudioPlaying) return;
    const callbacks = callbacksRef.current;
    if (pendingDoneRef.current) {
      pendingDoneRef.current  = false;
      pendingListenRef.current = false;
      resetActiveResponse();
      setState('listening');
      setCurrentTranscript('');
      callbacks.onDone?.();
      return;
    }
    if (pendingListenRef.current) {
      pendingListenRef.current = false;
      resetActiveResponse();
      setState('listening');
      setCurrentTranscript('');
    }
  }, [isAudioPlaying, resetActiveResponse]);

  // ── connect / disconnect ───────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('🎤 Already connected');
      return;
    }

    setState('connecting');
    setError(null);
    await initAudioContext();

    const wsUrl = getWebSocketUrl();
    console.log('🎤 Connecting to voice chat:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('🎤 Voice chat WebSocket connected');
        setIsConnected(true);

        ws.send(JSON.stringify({ event: 'start', sessionId, sampleRate }));

        try {
          await startCapture();
          isVoiceModeActiveRef.current = true;
          setState('listening');
        } catch (err) {
          console.error('Failed to start audio capture:', err);
          setError('Microphone access denied');
          onError?.('Microphone access denied');
        }
      };

      ws.onmessage = (ev) => {
        try {
          handleMessage(JSON.parse(ev.data));
        } catch (err) {
          console.error('Error parsing voice chat message:', err);
        }
      };

      ws.onerror = () => {
        setError('Connection error');
        setIsConnected(false);
        setState('idle');
      };

      ws.onclose = (ev) => {
        console.log('🎤 Voice chat WebSocket closed:', ev.code, ev.reason);
        setIsConnected(false);
        isVoiceModeActiveRef.current = false;
        setState('idle');
        stopCapture();
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect');
      setState('idle');
    }
  }, [sessionId, getWebSocketUrl, sampleRate, startCapture, stopCapture, handleMessage, initAudioContext, onError]);

  const disconnect = useCallback(() => {
    isVoiceModeActiveRef.current = false;
    pendingDoneRef.current   = false;
    pendingListenRef.current = false;
    resetActiveResponse();

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) sendSocketEvent('stop');
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    stopCapture();
    stopAllAudio();
    setIsConnected(false);
    setState('idle');
    setCurrentTranscript('');
  }, [resetActiveResponse, sendSocketEvent, stopCapture, stopAllAudio]);

  // ── controls ───────────────────────────────────────────────────────────

  /** Interrupt Jamie while she is speaking (from a UI button). */
  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && state === 'assistant_speaking') {
      pendingDoneRef.current   = false;
      pendingListenRef.current = false;
      resetActiveResponse();
      stopAllAudio();
      sendSocketEvent('interrupt');
      setState('listening');
    }
  }, [resetActiveResponse, sendSocketEvent, state, stopAllAudio]);

  /** Cancel current operation and stay in voice mode. */
  const cancel = useCallback(() => {
    pendingDoneRef.current   = false;
    pendingListenRef.current = false;
    resetActiveResponse();
    if (state === 'assistant_speaking') {
      stopAllAudio();
      sendSocketEvent('interrupt');
    } else if (state === 'processing') {
      sendSocketEvent('cancel');
    }
    setState('listening');
    setCurrentTranscript('');
  }, [resetActiveResponse, sendSocketEvent, state, stopAllAudio]);

  const toggleVoiceMode = useCallback(async () => {
    if (isConnected) disconnect();
    else await connect();
  }, [isConnected, connect, disconnect]);

  const setMicMuted = useCallback((muted: boolean) => {
    isMicManuallyMutedRef.current = muted;
    setMuted(muted);
  }, [setMuted]);

  // ── visibility: release mic when user leaves the tab ───────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && (isVoiceModeActiveRef.current || isConnected)) {
        console.log('[useVoiceChat] Page hidden – releasing microphone and disconnecting');
        isVoiceModeActiveRef.current = false;
        stopCapture();
        if (wsRef.current) {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ event: 'stop' }));
          }
          wsRef.current.close(1000, 'Visibility hidden');
          wsRef.current = null;
        }
        stopAllAudio();
        setIsConnected(false);
        setState('idle');
        setCurrentTranscript('');
        setIsPausedByVisibility(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, stopCapture, stopAllAudio]);

  /** Resume voice after returning from background. */
  const resumeFromVisibility = useCallback(() => {
    setIsPausedByVisibility(false);
    connect();
  }, [connect]);

  // ── cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      disconnect();
      cleanupAudio();
    };
  }, [disconnect, cleanupAudio]);

  // ── public API ─────────────────────────────────────────────────────────
  return {
    state,
    isConnected,
    error,
    currentTranscript,
    isPausedByVisibility,

    connect,
    disconnect,
    toggleVoiceMode,
    interrupt,
    cancel,
    setMicMuted,
    resumeFromVisibility,

    isListening:  state === 'listening',
    isProcessing: state === 'processing',
    isSpeaking:   state === 'assistant_speaking' || state === 'barge_in_pending',
    isActive:     isConnected && state !== 'idle',
  };
}
