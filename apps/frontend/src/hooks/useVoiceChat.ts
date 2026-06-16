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
import { VOICE_WS_URL } from '../lib/runtimeConfig';
import { getStoredJamieAccessUserId } from '../lib/supertab';
import type { VoiceSpendMandateConsentResolvedPayload } from '../lib/voiceSpendMandateConsentResolved';

type VoiceLatencyTurnMetrics = {
  transcriptFinalAt: number;
  responseId?: string;
  processingAt?: number;
  firstTextAt?: number;
  firstAudioAt?: number;
};

type VoiceLatencySession = {
  connectStartedAt: number;
  stageMarks: Record<string, number>;
  currentTurn?: VoiceLatencyTurnMetrics;
};

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
  /** Server asks client to open My Tab checkout for focused recipe (NEU-619) */
  onRecipePaywallRequested?: (payload: {
    backend_recipe_id: string;
    tool_call_id?: string;
    response_id?: string;
    auto_charge?: boolean;
    mandate?: unknown;
    price_amount?: number;
    currency_code?: string;
    ceiling_amount?: number;
  }) => void;
  /** Spend mandate consent card metadata for inline rendering */
  onSpendMandateConsentRequested?: (payload: {
    backend_recipe_id?: string;
    tool_call_id?: string;
    response_id?: string;
    price_amount?: number;
    currency_code?: string;
    ceiling_amount?: number;
    ask_id?: string;
  }) => void;
  /** Server resolved a consent ask (e.g. verbal yes/no in voice) */
  onSpendMandateConsentResolved?: (payload: VoiceSpendMandateConsentResolvedPayload) => void;
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
    onRecipePaywallRequested,
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
  // Mirror of isAudioPlaying state — lets ws.onmessage always read the
  // current value without capturing a stale closure from connect().
  const isAudioPlayingRef = useRef(false);
  // Deferred state transitions while audio is still playing
  const pendingDoneRef   = useRef(false);
  const pendingListenRef = useRef(false);
  // Track the active response so stale audio from a previous turn is discarded
  const activeResponseIdRef = useRef<string | null>(null);
  const latencyRef = useRef<VoiceLatencySession | null>(null);

  // Keep callbacks stable via ref so closures don't go stale
  const callbacksRef = useRef(options);
  useEffect(() => { callbacksRef.current = options; }, [options]);

  // ── helpers ────────────────────────────────────────────────────────────

  const nowMs = useCallback(() => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }, []);

  const roundMs = useCallback((value: number) => Math.round(value * 10) / 10, []);

  const startLatencySession = useCallback(() => {
    const startedAt = nowMs();
    latencyRef.current = {
      connectStartedAt: startedAt,
      stageMarks: { connect_started: startedAt },
    };
    console.info('[voice-latency]', { stage: 'connect_started', totalMs: 0 });
  }, [nowMs]);

  const markLatencyStage = useCallback(
    (stage: string, extra: Record<string, unknown> = {}, once = true) => {
      const session = latencyRef.current;
      if (!session) return;
      if (once && session.stageMarks[stage] !== undefined) return;
      const stamp = nowMs();
      session.stageMarks[stage] = stamp;
      console.info('[voice-latency]', {
        stage,
        totalMs: roundMs(stamp - session.connectStartedAt),
        ...extra,
      });
    },
    [nowMs, roundMs]
  );

  const markTranscriptFinalLatency = useCallback(
    (text: string) => {
      const session = latencyRef.current;
      if (!session) return;
      const stamp = nowMs();
      session.currentTurn = {
        transcriptFinalAt: stamp,
      };
      console.info('[voice-latency]', {
        stage: 'transcript_final',
        totalMs: roundMs(stamp - session.connectStartedAt),
        transcriptLength: text.length,
      });
    },
    [nowMs, roundMs]
  );

  const markProcessingLatency = useCallback(
    (responseId: string) => {
      const session = latencyRef.current;
      if (!session?.currentTurn) return;
      if (session.currentTurn.responseId === responseId && session.currentTurn.processingAt !== undefined) return;
      const stamp = nowMs();
      session.currentTurn.responseId = responseId;
      session.currentTurn.processingAt = stamp;
      console.info('[voice-latency]', {
        stage: 'processing',
        totalMs: roundMs(stamp - session.connectStartedAt),
        transcriptToProcessingMs: roundMs(stamp - session.currentTurn.transcriptFinalAt),
      });
    },
    [nowMs, roundMs]
  );

  const markFirstTextLatency = useCallback(
    (responseId?: string) => {
      const session = latencyRef.current;
      const turn = session?.currentTurn;
      if (!session || !turn || !responseId || turn.responseId !== responseId || turn.firstTextAt !== undefined) {
        return;
      }
      const stamp = nowMs();
      turn.firstTextAt = stamp;
      console.info('[voice-latency]', {
        stage: 'first_text_chunk',
        totalMs: roundMs(stamp - session.connectStartedAt),
        processingToFirstTextMs:
          turn.processingAt !== undefined ? roundMs(stamp - turn.processingAt) : undefined,
      });
    },
    [nowMs, roundMs]
  );

  const markFirstAudioLatency = useCallback(
    (responseId?: string) => {
      const session = latencyRef.current;
      const turn = session?.currentTurn;
      if (!session || !turn || !responseId || turn.responseId !== responseId || turn.firstAudioAt !== undefined) {
        return;
      }
      const stamp = nowMs();
      turn.firstAudioAt = stamp;
      console.info('[voice-latency]', {
        stage: 'first_audio_chunk',
        totalMs: roundMs(stamp - session.connectStartedAt),
        processingToFirstAudioMs:
          turn.processingAt !== undefined ? roundMs(stamp - turn.processingAt) : undefined,
        firstTextToFirstAudioMs:
          turn.firstTextAt !== undefined ? roundMs(stamp - turn.firstTextAt) : undefined,
        tapToFirstAudioMs: roundMs(stamp - session.connectStartedAt),
      });
    },
    [nowMs, roundMs]
  );

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
    const activeId = activeResponseIdRef.current;
    if (!activeId) return false;
    if (!responseId) {
      // Legacy payloads without responseId — only while a turn is in flight.
      return true;
    }
    return activeId === responseId;
  }, []);

  // ── audio playback ─────────────────────────────────────────────────────
  // Stable callback — wrapping in useCallback prevents it from changing every
  // render, which would cascade: updatePlaybackState → stopAllAudio →
  // disconnect → cleanup effect → disconnect() called on every re-render.
  const onPlaybackStateChange = useCallback((playing: boolean) => {
    isAudioPlayingRef.current = playing;
    setIsAudioPlaying(playing);
  }, []);

  const { playAudio, stopAllAudio, cleanup: cleanupAudio, initAudioContext } = useAudioPlayback({
    onPlaybackStateChange,
  });

  // ── audio capture ──────────────────────────────────────────────────────
  // Always stream mic audio to the backend.  The server (Deepgram) decides
  // whether the user is speaking and triggers barge-in server-side.
  const { startCapture, stopCapture, setMuted } = useAudioCapture({
    sampleRate,
    onLifecycleEvent: (event, metadata) => {
      switch (event) {
        case 'get_user_media_start':
          markLatencyStage('get_user_media_start');
          break;
        case 'get_user_media_ready':
          markLatencyStage('get_user_media_ready', metadata);
          break;
        case 'worklet_ready':
          markLatencyStage('audio_worklet_ready');
          break;
        case 'capture_ready':
          markLatencyStage('capture_ready', metadata);
          break;
        case 'capture_error':
          markLatencyStage('capture_error', {}, false);
          break;
      }
    },
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
    return `${VOICE_WS_URL}/ws/chat-voice`;
  }, []);

  // ── message handler ────────────────────────────────────────────────────
  const handleMessage = useCallback((message: VoiceChatMessage) => {
    const { event, data, responseId } = message;
    const callbacks = callbacksRef.current;

    switch (event) {
      case 'session_info':
        console.log('🎤 Voice session started:', data);
        markLatencyStage('session_info');
        break;

      case 'listening':
        // Server is ready for the next user turn.  If the browser still has
        // buffered TTS audio playing, defer the state transition.
        if (isAudioPlayingRef.current) {
          pendingListenRef.current = true;
        } else {
          resetActiveResponse();
          setState('listening');
          setCurrentTranscript('');
          markLatencyStage('server_listening');
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
        markTranscriptFinalLatency(data || '');
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
        markProcessingLatency(responseId);
        break;

      case 'text_chunk':
        if (!isCurrentResponse(responseId)) return;
        setState('assistant_speaking');
        markFirstTextLatency(responseId);
        callbacks.onTextChunk?.(data || '');
        break;

      case 'audio':
        if (!isCurrentResponse(responseId)) return;
        markFirstAudioLatency(responseId);
        if (data) playAudio(data);
        break;

      case 'recipes':
        if (!isCurrentResponse(responseId)) return;
        callbacks.onRecipes?.(data);
        break;

      case 'meal_plan':
        if (!isCurrentResponse(responseId)) return;
        callbacks.onMealPlan?.(data);
        break;

      case 'recipe_detail':
        if (!isCurrentResponse(responseId)) return;
        callbacks.onRecipeDetail?.(data);
        break;

      case 'shopping_list':
        if (!isCurrentResponse(responseId)) return;
        callbacks.onShoppingList?.(data);
        break;

      case 'recipe_paywall_requested': {
        if (!isCurrentResponse(responseId)) return;
        const bid =
          typeof data?.backend_recipe_id === 'string'
            ? data.backend_recipe_id.trim()
            : '';
        if (!bid) break;
        callbacks.onRecipePaywallRequested?.({
          backend_recipe_id: bid,
          tool_call_id: typeof data?.tool_call_id === 'string' ? data.tool_call_id : undefined,
          response_id: typeof data?.response_id === 'string' ? data.response_id : responseId,
          auto_charge: data?.auto_charge === true ? true : undefined,
          mandate: data?.mandate,
          price_amount: typeof data?.price_amount === 'number' ? data.price_amount : undefined,
          currency_code: typeof data?.currency_code === 'string' ? data.currency_code : undefined,
          ceiling_amount: typeof data?.ceiling_amount === 'number' ? data.ceiling_amount : undefined,
        });
        break;
      }

      case 'spend_mandate_consent_requested': {
        if (!isCurrentResponse(responseId)) return;
        callbacks.onSpendMandateConsentRequested?.({
          backend_recipe_id:
            typeof data?.backend_recipe_id === 'string' ? data.backend_recipe_id.trim() : undefined,
          tool_call_id: typeof data?.tool_call_id === 'string' ? data.tool_call_id : undefined,
          response_id: typeof data?.response_id === 'string' ? data.response_id : responseId,
          price_amount: typeof data?.price_amount === 'number' ? data.price_amount : undefined,
          currency_code: typeof data?.currency_code === 'string' ? data.currency_code : undefined,
          ceiling_amount: typeof data?.ceiling_amount === 'number' ? data.ceiling_amount : undefined,
          ask_id: typeof data?.ask_id === 'string' ? data.ask_id : undefined,
        });
        break;
      }

      case 'spend_mandate_consent_resolved': {
        if (!isCurrentResponse(responseId)) return;
        const bid =
          typeof data?.backend_recipe_id === 'string' ? data.backend_recipe_id.trim() : '';
        if (!bid) break;
        callbacks.onSpendMandateConsentResolved?.({
          backend_recipe_id: bid,
          approved: Boolean(data?.approved),
          ask_id: typeof data?.ask_id === 'string' ? data.ask_id : undefined,
          mandate: data?.mandate,
          reason: typeof data?.reason === 'string' ? data.reason : undefined,
        });
        break;
      }

      case 'tool_call':
        console.log('🔧 Tool called:', data?.name);
        break;

      case 'done':
        if (!isCurrentResponse(responseId)) return;
        pendingDoneRef.current = true;
        if (!isAudioPlayingRef.current) {
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
  }, [
    isCurrentResponse,
    markFirstAudioLatency,
    markFirstTextLatency,
    markLatencyStage,
    markProcessingLatency,
    markTranscriptFinalLatency,
    playAudio,
    resetActiveResponse,
    stopAllAudio,
  ]);

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

    startLatencySession();
    setState('connecting');
    setError(null);
    const sharedCtx = await initAudioContext();
    markLatencyStage('audio_context_ready');

    const wsUrl = getWebSocketUrl();
    console.log('🎤 Connecting to voice chat:', wsUrl);

    try {
      let captureError: unknown = null;
      let connectCancelled = false;
      const capturePromise = (async () => {
        try {
          const started = await startCapture(sharedCtx);
          if (connectCancelled) {
            stopCapture();
            return false;
          }
          return started;
        } catch (err) {
          captureError = err;
          return false;
        }
      })();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      markLatencyStage('websocket_created');

      ws.onopen = async () => {
        console.log('🎤 Voice chat WebSocket connected');
        markLatencyStage('websocket_open');
        setIsConnected(true);

        ws.send(JSON.stringify({
          event: 'start',
          sessionId,
          sampleRate,
          userId: getStoredJamieAccessUserId() ?? undefined,
        }));
        markLatencyStage('start_event_sent');

        try {
          const captureStarted = await capturePromise;
          if (!captureStarted) {
            throw captureError instanceof Error ? captureError : new Error('Failed to start audio capture');
          }
          if (connectCancelled) {
            stopCapture();
            return;
          }
          isVoiceModeActiveRef.current = true;
          setState('listening');
          markLatencyStage('local_listening_ready');
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
        connectCancelled = true;
        setError('Connection error');
        setIsConnected(false);
        setState('idle');
        stopCapture();
      };

      ws.onclose = (ev) => {
        console.log('🎤 Voice chat WebSocket closed:', ev.code, ev.reason);
        connectCancelled = true;
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
  }, [
    getWebSocketUrl,
    handleMessage,
    initAudioContext,
    markLatencyStage,
    onError,
    sampleRate,
    sessionId,
    startCapture,
    startLatencySession,
    stopCapture,
  ]);

  /** Tell the discovery voice backend which recipe sheet is focused (modal). */
  const notifyFocusedRecipe = useCallback(
    (
      backendRecipeId: string | null | undefined,
      accessState?: 'free' | 'locked' | 'owned' | null,
    ) => {
      const trimmed = backendRecipeId?.trim() ?? '';
      sendSocketEvent('focused_recipe', {
        backendRecipeId: trimmed,
        ...(accessState ? { accessState } : {}),
      });
    },
    [sendSocketEvent],
  );

  const disconnect = useCallback(() => {
    isVoiceModeActiveRef.current = false;
    pendingDoneRef.current   = false;
    pendingListenRef.current = false;
    resetActiveResponse();
    latencyRef.current = null;

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) sendSocketEvent('stop');
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    stopCapture();
    stopAllAudio();
    setIsConnected(false);
    setIsPausedByVisibility(false);
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
    stopAllAudio();
    if (state === 'assistant_speaking') {
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
    notifyFocusedRecipe,

    isListening:  state === 'listening',
    isProcessing: state === 'processing',
    isSpeaking:   state === 'assistant_speaking' || state === 'barge_in_pending',
    isActive:     isConnected && state !== 'idle',
  };
}
