import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketMessage {
  event: string;
  data?: any;
  action?: string;
}

export interface RecipeState {
  recipe_id?: string;
  recipe_title?: string;
  running?: boolean;
  has_recipe?: boolean;
  current_step?: number;
  total_steps?: number;
  completed_steps?: string[] | number[]; // Backend sends step IDs (strings) or indices (numbers)
  steps?: {
    [stepId: string]: {
      id: string;
      status: 'pending' | 'ready' | 'active' | 'waiting_ack' | 'completed';
      descr?: string;
      timer?: {
        duration_secs?: number;
        remaining_secs?: number;
        end_ts?: number;
      };
    };
  };
  timers?: Array<{
    step_id: string;
    duration: number;
    remaining?: number;
  }>;
}

export interface SessionInfo {
  session_id: string;
  recipe_id?: string;
  mode?: string;
  [key: string]: any;
}

export interface UseWebSocketOptions {
  onRecipeState?: (state: RecipeState) => void;
  onRecipeMessage?: (message: string) => void;
  onRecipeError?: (error: string) => void;
  onTimerDone?: (stepId: string, requiresConfirm: boolean) => void;
  onReminderTick?: (stepId: string) => void;
  onAudio?: (base64Audio: string) => void;
  onStop?: () => void;
  onControl?: (action: string, data?: any) => void;
  onSessionInfo?: (info: SessionInfo) => void;
  autoConnect?: boolean;
  recipeId?: string;
  context?: Record<string, any>;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onRecipeState,
    onRecipeMessage,
    onRecipeError,
    onTimerDone,
    onReminderTick,
    onAudio,
    onStop,
    onControl,
    onSessionInfo,
    autoConnect = false,
    recipeId,
    context,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const shouldReconnectRef = useRef(true);
  const isMountedRef = useRef(true);
  const consecutive1006ErrorsRef = useRef(0);
  const maxConsecutive1006Errors = 2; // Stop after 2 consecutive 1006 errors
  const contextRef = useRef<Record<string, any> | undefined>(context);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  // Get WebSocket URL from environment
  const getWebSocketUrl = useCallback(() => {
    // @ts-expect-error - Vite provides import.meta.env but TypeScript types may not be fully loaded
    const wsUrl = import.meta.env.VITE_WS_URL || 'wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice';
    return wsUrl;
  }, []);

  const connect = useCallback(() => {
    // Don't connect if already connected, connecting, or component unmounted
    if (wsRef.current?.readyState === WebSocket.OPEN || isConnecting || !isMountedRef.current) {
      return;
    }

    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setIsConnecting(true);
    setError(null);
    shouldReconnectRef.current = true; // Allow reconnection for this connection attempt

    try {
      const wsUrl = getWebSocketUrl();
      
      // Validate WebSocket URL format
      if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        console.error('Invalid WebSocket URL format. Must start with ws:// or wss://');
        setError('Invalid WebSocket URL configuration.');
        setIsConnecting(false);
        return;
      }
      
      // Only log connection attempt on first try to avoid spam
      if (reconnectAttemptsRef.current === 0) {
        console.log('Attempting WebSocket connection to:', wsUrl);
      }
      
      console.log('🔌 Creating WebSocket connection to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        consecutive1006ErrorsRef.current = 0; // Reset consecutive 1006 errors on successful connection

        // Send start message
        const customParameters = {
          ...(contextRef.current || {}),
        };
        if (recipeId && !customParameters.recipeId) {
          customParameters.recipeId = recipeId;
        }
        const startMessage = {
          event: 'start',
          sessionId: sessionIdRef.current,
          sampleRate: 16000,
          customParameters,
        };
        console.log('📤 Sending start message:', startMessage);
        ws.send(JSON.stringify(startMessage));

        // If recipeId is provided, start the recipe
        if (recipeId) {
          // The backend will handle starting the recipe via the assistant
          // We can send a message to start it if needed
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (evt) => {
        // Only log error details on first attempt to avoid spam
        if (reconnectAttemptsRef.current === 0) {
          console.error('❌ WebSocket connection error:', evt);
          console.error('❌ WebSocket URL attempted:', wsUrl);
          console.error('❌ WebSocket readyState:', ws.readyState);
        }
        setError('Connection error. Please check if the backend is available.');
        setIsConnected(false);
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        const { code, reason, wasClean } = event;
        
        setIsConnected(false);
        setIsConnecting(false);

        // Code 1006 = Abnormal Closure (connection lost without close frame)
        // This usually means the server is not available or connection was refused
        if (code === 1006) {
          consecutive1006ErrorsRef.current += 1;
          
          // Only log detailed error on first occurrence
          if (consecutive1006ErrorsRef.current === 1) {
            console.error('WebSocket connection failed (1006 - Abnormal Closure)');
            console.error('This usually means:');
            console.error('  1. The backend server is not running');
            console.error('  2. The WebSocket URL is incorrect');
            console.error('  3. Network/firewall is blocking the connection');
            console.error('  4. The server does not support WebSocket connections');
            console.error('WebSocket URL attempted:', wsUrl);
          } else if (consecutive1006ErrorsRef.current === maxConsecutive1006Errors) {
            // Stop trying after consecutive 1006 errors
            shouldReconnectRef.current = false;
            const errorMsg = 'Unable to connect to the backend server. The server may be unavailable or the WebSocket URL is incorrect.';
            setError(errorMsg);
            console.error('Multiple consecutive 1006 errors detected. Stopping reconnection attempts.');
            console.error('Please verify the backend server is running and accessible.');
            return; // Don't attempt to reconnect
          }
          // Silently skip logging for subsequent 1006 errors to avoid spam
        } else if (code === 1011) {
          // Code 1011 = Internal Server Error - server-side error, don't retry
          shouldReconnectRef.current = false;
          const errorMessage = reason || 'Internal server error';
          const userMessage = `Server error: ${errorMessage}. This usually indicates a backend configuration issue (e.g., missing API keys). Please check the backend logs.`;
          setError(userMessage);
          console.error(`WebSocket closed with server error (code: ${code}): ${errorMessage}`);
          if (onRecipeError) {
            onRecipeError(`Backend configuration error: ${errorMessage}. Check backend logs for details (e.g., missing DEEPGRAM_API_KEY).`);
          }
          return; // Don't attempt to reconnect for server errors
        } else {
          // Reset consecutive 1006 counter for other error codes
          consecutive1006ErrorsRef.current = 0;
          
          if (code !== 1000 && shouldReconnectRef.current && isMountedRef.current) {
            // Log other non-normal closures (but not 1006 or 1011)
            console.log(`WebSocket closed, code: ${code}, reason: ${reason || 'none'}, clean: ${wasClean}`);
          }
        }

        // Don't attempt to reconnect for normal closures, manual disconnects, server errors, or after too many 1006 errors
        if (code === 1000 || code === 1001 || code === 1011 || !shouldReconnectRef.current) {
          return;
        }

        // Only attempt to reconnect if:
        // 1. Component is still mounted
        // 2. We haven't exceeded max attempts
        // 3. We haven't had too many consecutive 1006 errors
        if (
          isMountedRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts &&
          consecutive1006ErrorsRef.current < maxConsecutive1006Errors
        ) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(10000, 2000 * Math.pow(2, reconnectAttemptsRef.current - 1));
          
          reconnectTimeoutRef.current = setTimeout(() => {
            // Double-check conditions before reconnecting
            if (
              shouldReconnectRef.current &&
              isMountedRef.current &&
              reconnectAttemptsRef.current <= maxReconnectAttempts &&
              consecutive1006ErrorsRef.current < maxConsecutive1006Errors
            ) {
              // Only log reconnection attempts for first few tries
              if (reconnectAttemptsRef.current <= 2) {
                console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
              }
              connect();
            }
          }, delay);
        } else if (
          (reconnectAttemptsRef.current >= maxReconnectAttempts || consecutive1006ErrorsRef.current >= maxConsecutive1006Errors) &&
          isMountedRef.current
        ) {
          // Stop reconnection attempts and show final error
          shouldReconnectRef.current = false;
          const errorMsg = code === 1006 || consecutive1006ErrorsRef.current >= maxConsecutive1006Errors
            ? 'Unable to connect to the backend server. Please verify the server is running and accessible.'
            : `Unable to connect after ${maxReconnectAttempts} attempts. Please check your connection and refresh the page.`;
          setError(errorMsg);
          console.error('Reconnection attempts stopped.');
          console.error('Final connection state - Code:', code, 'Reason:', reason || 'none', 'Clean:', wasClean);
        }
      };
    } catch (err) {
      console.error('Error creating WebSocket:', err);
      setError('Failed to create connection.');
      setIsConnecting(false);
    }
  }, [getWebSocketUrl, recipeId]);

  const disconnect = useCallback(() => {
    // Prevent automatic reconnection
    shouldReconnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent reconnection

    if (wsRef.current) {
      // Close with normal closure code to avoid triggering onclose reconnection
      try {
        wsRef.current.close(1000, 'Manual disconnect');
      } catch (err) {
        // Ignore errors during close
      }
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Cannot send message.');
    }
  }, []);

  const sendAudio = useCallback((base64Audio: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          event: 'audio',
          data: base64Audio,
        })
      );
    } else {
      console.warn('⚠️ Cannot send audio: WebSocket not open, readyState:', wsRef.current?.readyState);
    }
  }, []);

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      const { event, data, action } = message;

      switch (event) {
        case 'recipe_state':
          if (onRecipeState && data) {
            onRecipeState(data as RecipeState);
          }
          break;

        case 'recipe_message':
          if (onRecipeMessage && data?.message) {
            onRecipeMessage(data.message);
          }
          break;

        case 'recipe_error':
          if (onRecipeError && data?.message) {
            onRecipeError(data.message);
          }
          break;

        case 'manager_system':
          if (data?.type === 'timer_done') {
            const stepId = data.step_id || data.descr || 'A step';
            const requiresConfirm = data.requires_confirm || false;
            if (onTimerDone) {
              onTimerDone(stepId, requiresConfirm);
            }
          } else if (data?.type === 'reminder_tick') {
            const stepId = data.step_id || 'A step';
            if (onReminderTick) {
              onReminderTick(stepId);
            }
          }
          break;

        case 'audio':
          console.log('📡 WebSocket received audio event, data type:', typeof data, 'length:', data?.length || 0);
          if (onAudio && data) {
            onAudio(data);
          } else {
            console.warn('⚠️ Audio event received but onAudio callback is missing or data is empty');
          }
          break;

        case 'control':
          if (onControl) {
            onControl(action || '', message.data);
          }
          break;

        case 'session_info':
          if (data) {
            setSessionInfo(data as SessionInfo);
            if (onSessionInfo) {
              onSessionInfo(data as SessionInfo);
            }
          }
          break;

        case 'stop':
          if (onStop) {
            onStop();
          }
          disconnect();
          break;

        default:
          console.log('Unhandled WebSocket message:', message);
      }
    },
    [onRecipeState, onRecipeMessage, onRecipeError, onTimerDone, onReminderTick, onAudio, onStop, disconnect, onSessionInfo]
  );

  // Auto-connect if enabled
  useEffect(() => {
    isMountedRef.current = true;
    
    if (autoConnect) {
      console.log('🔌 Auto-connect enabled, attempting WebSocket connection...');
      console.log('🔌 Recipe ID:', recipeId);
      console.log('🔌 WebSocket URL:', getWebSocketUrl());
      connect();
    } else {
      console.log('⚠️ Auto-connect is disabled');
    }

    return () => {
      console.log('🧹 Cleaning up WebSocket connection...');
      isMountedRef.current = false;
      shouldReconnectRef.current = false;
      disconnect();
    };
  }, [autoConnect, recipeId]); // Include recipeId to reconnect when recipe changes

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendMessage,
    sendAudio,
    sessionInfo,
  };
}
