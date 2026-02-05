/**
 * useVoiceChat - Voice chat hook for recipe discovery
 *
 * Provides voice input/output capabilities for the chat view:
 * - Microphone capture and streaming to backend
 * - Real-time transcription display
 * - Audio response playback
 * - Text transcript alongside audio
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioCapture } from './useAudioCapture';
import { useAudioPlayback } from './useAudioPlayback';

export type VoiceChatState =
  | 'idle'           // Not listening, not speaking
  | 'connecting'     // WebSocket connecting
  | 'listening'      // Listening for user speech
  | 'processing'     // Processing user message
  | 'speaking';      // Jamie is speaking

export interface VoiceChatMessage {
  event: string;
  data?: any;
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
    sessionId,  // Use shared session ID for unified chat experience
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

  // State
  const [state, setState] = useState<VoiceChatState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isPausedByVisibility, setIsPausedByVisibility] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const isVoiceModeActiveRef = useRef(false);

  // Store callbacks in refs to avoid stale closures
  const callbacksRef = useRef(options);
  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  // Audio capture
  const { startCapture, stopCapture, setMuted } = useAudioCapture({
    sampleRate,
    onAudioData: useCallback((base64Audio: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && isVoiceModeActiveRef.current) {
        wsRef.current.send(JSON.stringify({
          event: 'audio',
          data: base64Audio,
        }));
      }
    }, []),
  });

  // Audio playback
  const { playAudio, stopAllAudio, cleanup: cleanupAudio, initAudioContext } = useAudioPlayback();

  // Get WebSocket URL for voice chat
  const getWebSocketUrl = useCallback(() => {
    // Use the backend-search WebSocket URL from VITE_API_BASE_URL
    // @ts-expect-error - Vite provides import.meta.env
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = baseUrl.replace(/^https?/, wsProtocol);
    return `${wsUrl}/ws/chat-voice`;
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: VoiceChatMessage) => {
    const { event, data } = message;
    const callbacks = callbacksRef.current;

    switch (event) {
      case 'session_info':
        // DEBUG voice: uncomment to trace WebSocket session
        // console.log('🎤 Voice session started:', data);
        break;

      case 'listening':
        setState('listening');
        setCurrentTranscript('');
        break;

      case 'transcript_interim':
        setCurrentTranscript(data || '');
        callbacks.onTranscript?.(data || '', false);
        break;

      case 'transcript_final':
        setCurrentTranscript(data || '');
        callbacks.onTranscript?.(data || '', true);
        break;

      case 'processing':
        setState('processing');
        break;

      case 'text_chunk':
        setState('speaking');
        callbacks.onTextChunk?.(data || '');
        break;

      case 'audio':
        if (data) {
          playAudio(data);
        }
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
        // DEBUG voice: uncomment to trace tool calls
        // console.log('🔧 Tool called:', data?.name);
        break;

      case 'done':
        setState('listening');
        callbacks.onDone?.();
        break;

      case 'error':
        setError(data || 'Unknown error');
        callbacks.onError?.(data || 'Unknown error');
        break;

      default:
        // DEBUG voice: uncomment to trace unhandled events
        // console.log('🎤 Unhandled voice chat event:', event, data);
        break;
    }
  }, [playAudio]);

  // Connect to voice chat WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // DEBUG voice: console.log('🎤 Already connected');
      return;
    }

    setState('connecting');
    setError(null);

    // Initialize audio context (requires user gesture)
    await initAudioContext();

    const wsUrl = getWebSocketUrl();
    // DEBUG voice: console.log('🎤 Connecting to voice chat:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        // DEBUG voice: console.log('🎤 Voice chat WebSocket connected');
        setIsConnected(true);

        // Send start message with shared session ID
        ws.send(JSON.stringify({
          event: 'start',
          sessionId,  // Use shared session ID for unified experience
          sampleRate,
        }));

        // Start audio capture
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

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('Error parsing voice chat message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('🎤 Voice chat WebSocket error:', event);
        setError('Connection error');
        setIsConnected(false);
        setState('idle');
      };

      ws.onclose = (event) => {
        // DEBUG voice: console.log('🎤 Voice chat WebSocket closed:', event.code, event.reason);
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

  // Disconnect from voice chat
  const disconnect = useCallback(() => {
    isVoiceModeActiveRef.current = false;

    if (wsRef.current) {
      // Send stop event
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ event: 'stop' }));
      }
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    stopCapture();
    stopAllAudio();
    setIsConnected(false);
    setState('idle');
    setCurrentTranscript('');
  }, [stopCapture, stopAllAudio]);

  // Interrupt Jamie while speaking
  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && state === 'speaking') {
      wsRef.current.send(JSON.stringify({ event: 'interrupt' }));
      stopAllAudio();
      setState('listening');
    }
  }, [state, stopAllAudio]);

  // Toggle voice mode
  const toggleVoiceMode = useCallback(async () => {
    if (isConnected) {
      disconnect();
    } else {
      await connect();
    }
  }, [isConnected, connect, disconnect]);

  // Mute/unmute microphone
  const setMicMuted = useCallback((muted: boolean) => {
    setMuted(muted);
  }, [setMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      cleanupAudio();
    };
  }, [disconnect, cleanupAudio]);

  // NEU-467: Release mic when user leaves the page (tab switch, app background). Do not auto-resume.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (isVoiceModeActiveRef.current || isConnected) {
          // DEBUG voice: console.log('[useVoiceChat] Page hidden – releasing microphone and disconnecting');
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
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, stopCapture, stopAllAudio]);

  /** NEU-467: Resume voice after user returned from background (tap to continue). */
  const resumeFromVisibility = useCallback(() => {
    setIsPausedByVisibility(false);
    connect();
  }, [connect]);

  // Cancel current operation and stay in voice mode
  const cancel = useCallback(() => {
    if (state === 'speaking') {
      // Stop audio and go back to listening
      stopAllAudio();
      wsRef.current?.send(JSON.stringify({ event: 'interrupt' }));
    } else if (state === 'processing') {
      // Cancel processing, go back to listening
      wsRef.current?.send(JSON.stringify({ event: 'cancel' }));
    }
    setState('listening');
    setCurrentTranscript('');
  }, [state, stopAllAudio]);

  return {
    // State
    state,
    isConnected,
    error,
    currentTranscript,
    isPausedByVisibility,

    // Actions
    connect,
    disconnect,
    toggleVoiceMode,
    interrupt,
    cancel,
    setMicMuted,
    resumeFromVisibility,

    // Derived
    isListening: state === 'listening',
    isProcessing: state === 'processing',
    isSpeaking: state === 'speaking',
    isActive: isConnected && state !== 'idle',
  };
}
