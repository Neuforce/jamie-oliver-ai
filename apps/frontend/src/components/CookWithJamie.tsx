import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Recipe } from '../data/recipes';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Plus, Minus, RotateCcw, Bell } from 'lucide-react';
import { Button } from './ui/button';
import { RecipeCard } from './RecipeCard';
import { TimerPanel, type ActiveTimer } from './TimerPanel';
import { useWebSocket, type RecipeState, type ActiveTimerInfo } from '../hooks/useWebSocket';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { toast } from 'sonner';
// @ts-expect-error - Vite resolves figma:asset imports via alias configuration
import jamieLogoImport from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';

const jamieLogo = typeof jamieLogoImport === 'string' ? jamieLogoImport : (jamieLogoImport as any).src || jamieLogoImport;
const CHAT_STORAGE_KEY = 'jamie-oliver-chat-messages';

// Export function to clear chat history (used when recipe is completed)
export const clearChatHistory = () => {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing chat history:', error);
  }
};

interface CookWithJamieProps {
  recipe: Recipe;
  onClose: () => void;
  onBackToChat?: () => void;
  onExploreRecipes?: () => void;
}

export function CookWithJamie({ recipe, onClose, onBackToChat, onExploreRecipes }: CookWithJamieProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  // Session tracking - only save when user has made deliberate progress
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [voicePausedByVisibility, setVoicePausedByVisibility] = useState(false);
  const recognitionRef = useRef(null as any);

  // WebSocket and Audio states
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [wsRecipeState, setWsRecipeState] = useState(null as RecipeState | null);
  const audioCaptureStartedRef = useRef(false);
  const canStreamAudioRef = useRef(false);
  const lastAutoTimerStepRef = useRef<number | null>(null);
  const currentStepRef = useRef(0);

  // Prefer backend slug ID when available so the voice agent loads the same recipe
  const backendRecipeId = recipe?.backendId;
  // Fallback to numeric ID if slug is missing (e.g., legacy sessions)
  const recipeId = backendRecipeId || (recipe ? String(recipe.id) : undefined);
  const websocketContext = useMemo(() => {
    if (!recipe) return undefined;
    return {
      mode: 'cooking',
      recipeId: backendRecipeId || String(recipe.id),
      recipeTitle: recipe.title,
      recipeNumericId: recipe.id,
      recipePayload: recipe.rawRecipePayload,
      resumeStepIndex: currentStepRef.current,
    };
  }, [recipe, backendRecipeId]);

  // Audio playback hook
  const audioPlayback = useAudioPlayback();

  const parseIsoDurationToSeconds = useCallback((duration?: string | number | null) => {
    if (!duration) return 0;

    // If duration is already a number, return it directly (it's in seconds)
    if (typeof duration === 'number') {
      return Math.round(duration);
    }

    // Otherwise, parse ISO 8601 duration string (e.g., "PT50M", "PT1H30M")
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    return hours * 3600 + minutes * 60 + seconds;
  }, []);

  const extractSecondsFromInstruction = useCallback((text?: string) => {
    if (!text) return 0;
    const match = text.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('sec')) {
      return Math.round(value);
    }
    return Math.round(value * 60);
  }, []);

  const applyBackendTimerControl = useCallback(
    (action: string, payload?: { seconds?: number }) => {
      console.log('🕐 [TIMER-FE] applyBackendTimerControl called:', { action, payload });
      const parsedSeconds =
        typeof payload?.seconds === 'number'
          ? Math.max(0, Math.round(payload.seconds))
          : null;

      if (action === 'timer_start' || action === 'timer_resume') {
        console.log('🕐 [TIMER-FE] Starting timer with seconds:', parsedSeconds ?? 'using previous/default');
        setTimerSeconds((prev) => {
          const newValue = parsedSeconds !== null ? parsedSeconds : (prev > 0 ? prev : timerMinutes * 60);
          console.log('🕐 [TIMER-FE] Setting timer seconds:', newValue);
          return newValue;
        });
        setTimerRunning(true);
        console.log('🕐 [TIMER-FE] Timer is now running');
        return;
      }

      if (action === 'timer_pause') {
        console.log('🕐 [TIMER-FE] Pausing timer');
        setTimerRunning(false);
        return;
      }

      if (action === 'timer_reset') {
        console.log('🕐 [TIMER-FE] Resetting timer to:', parsedSeconds ?? timerMinutes * 60);
        setTimerRunning(false);
        setTimerSeconds(parsedSeconds ?? timerMinutes * 60);
      }
    },
    [timerMinutes]
  );

  // Prefer backend-authored instructions so UI matches the recipe engine step-by-step
  const instructions = useMemo(() => {
    if (!recipe) return [];
    if (recipe.backendSteps?.length) {
      return recipe.backendSteps.map((step) => step.instructions);
    }
    return recipe.instructions;
  }, [recipe]);

  const stepIdToIndex = useMemo(() => {
    if (!recipe?.backendSteps?.length) {
      return new Map<string, number>();
    }
    return recipe.backendSteps.reduce<Map<string, number>>((map, step, index) => {
      map.set(step.id, index);
      return map;
    }, new Map<string, number>());
  }, [recipe]);

  // Helper to check if a step index has an active timer running
  const stepHasActiveTimer = useCallback((stepIndex: number): boolean => {
    if (!recipe?.backendSteps?.length || !activeTimers.length) return false;
    const backendStep = recipe.backendSteps[stepIndex];
    if (!backendStep) return false;
    return activeTimers.some(timer => timer.step_id === backendStep.id);
  }, [recipe, activeTimers]);

  // Get timer info for a step
  const getStepTimerInfo = useCallback((stepIndex: number): ActiveTimer | undefined => {
    if (!recipe?.backendSteps?.length || !activeTimers.length) return undefined;
    const backendStep = recipe.backendSteps[stepIndex];
    if (!backendStep) return undefined;
    return activeTimers.find(timer => timer.step_id === backendStep.id);
  }, [recipe, activeTimers]);

  const syncRecipeStateFromBackend = useCallback((state: RecipeState) => {
    if (!state || !recipe) return;

    const resolveStepIndex = (stepId?: string, descr?: string): number | null => {
      if (stepId && stepIdToIndex.has(stepId)) return stepIdToIndex.get(stepId)!;
      if (descr && recipe.backendSteps?.length) {
        const descrMatch = recipe.backendSteps.findIndex(
          (step) => step.descr?.toLowerCase() === descr.toLowerCase()
        );
        if (descrMatch >= 0) return descrMatch;
      }
      const normalizedId = stepId?.toLowerCase();
      const normalizedDescr = descr?.toLowerCase();
      const fallbackIndex = instructions.findIndex((inst, idx) => {
        const instLower = String(inst).toLowerCase();
        if (normalizedId && instLower.includes(normalizedId)) return true;
        if (normalizedDescr && instLower.includes(normalizedDescr)) return true;
        if (stepId && String(idx) === stepId) return true;
        return false;
      });
      return fallbackIndex >= 0 ? fallbackIndex : null;
    };

    if (state.steps) {
      const stepsArray = Object.values(state.steps);
      const activeStep = stepsArray.find(step => step.status === 'active' || step.status === 'waiting_ack')
        || stepsArray.find(step => step.status === 'ready');
      if (activeStep) {
        const stepIndex = resolveStepIndex(activeStep.id, activeStep.descr);
        if (stepIndex !== null) {
          setCurrentStep((prev) => (prev === 0 || stepIndex > prev ? stepIndex : prev));
        }
      }
      const completedIndices = stepsArray
        .filter(step => step.status === 'completed')
        .map(step => resolveStepIndex(step.id, step.descr))
        .filter((idx): idx is number => idx !== null);
      setCompletedSteps(completedIndices);
    } else if (Array.isArray(state.completed_steps)) {
      const completedIndices = state.completed_steps
        .map(step => (typeof step === 'number' ? step : resolveStepIndex(String(step))))
        .filter((idx): idx is number => typeof idx === 'number' && idx >= 0);
      setCompletedSteps(completedIndices);
    }
    if (state.current_step !== undefined && state.current_step >= 0) {
      const boundedIndex = instructions.length > 0 ? Math.min(state.current_step, instructions.length - 1) : 0;
      setCurrentStep((prev) => (prev === 0 || boundedIndex > prev ? boundedIndex : prev));
    }
  }, [instructions, recipe, stepIdToIndex]);

  const handleControl = useCallback(
    (action: string, data?: any) => {
      console.log('🕐 [CONTROL-FE] handleControl received:', { action, data });
      if (action === 'clear') {
        audioPlayback.stopAllAudio();
        return;
      }

      if (action?.startsWith('timer_')) {
        console.log('🕐 [CONTROL-FE] Routing to applyBackendTimerControl');
        applyBackendTimerControl(action, data);
        return;
      }

      if (action === 'focus_step' && data?.step_id) {
        const stepIndex = stepIdToIndex.get(String(data.step_id));
        if (typeof stepIndex === 'number') {
          setCurrentStep(stepIndex);
        }
      }
    },
    [audioPlayback, applyBackendTimerControl, stepIdToIndex]
  );

  // WebSocket hook - auto-connect when component mounts
  const {
    isConnected: isWebSocketConnected,
    isConnecting: isWebSocketConnecting,
    error: wsError,
    connect: wsConnect,
    disconnect: wsDisconnect,
    sendMessage: wsSendMessage,
    sendAudio: wsSendAudio,
    sessionInfo,
  } = useWebSocket({
    autoConnect: true,
    recipeId: recipeId,
    context: websocketContext,
    onRecipeState: (state) => {
      setWsRecipeState(state);
      syncRecipeStateFromBackend(state);
    },
    onRecipeMessage: (message) => {
      console.log('[WebSocket] Recipe message:', message);
    },
    onRecipeError: (error) => {
      setVoiceError(error);
      console.error('[WebSocket] Recipe error:', error);
    },
    onTimerDone: (stepId, requiresConfirm) => {
      toast.info('Timer Done', {
        description: `Timer for ${stepId} is complete${requiresConfirm ? '. Please confirm when finished.' : '.'}`,
        duration: 5000,
      });
    },
    onTimerListUpdate: (timers: ActiveTimerInfo[]) => {
      console.log('🕐 Active timers updated:', timers.length);
      const panelTimers: ActiveTimer[] = timers.map(t => ({
        id: t.id,
        step_id: t.step_id,
        label: t.label,
        duration_secs: t.duration_secs,
        started_at: t.started_at,
        remaining_secs: t.remaining_secs,
      }));
      setActiveTimers(panelTimers);
    },
  });

  const audioCapture = useAudioCapture({
    onAudioData: (base64Audio: string) => wsSendAudio(base64Audio),
  });

  const speakText = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      window.speechSynthesis.speak(u);
    }
  }, []);

  const micIconSrc = isMicMuted ? '/assets/tabler-icon-microphone-off.svg' : '/assets/tabler-icon-microphone.svg';
  const micRingSrc = isMicMuted ? '/assets/Ellipse-red.svg' : '/assets/Ellipse-green.svg';
  const micIconAlt = isMicMuted ? 'Microphone muted' : 'Microphone active';

  // Session restore on mount (e.g. user clicked "Continue Cooking")
  useEffect(() => {
    if (!recipe) return;
    const saved = localStorage.getItem(`cooking-session-${recipe.id}`);
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.currentStep !== undefined) {
          setCurrentStep(session.currentStep);
          setCompletedSteps(session.completedSteps || []);
          setHasUserInteracted(true);
        }
      } catch (e) { /* ignore */ }
    }
  }, [recipe]);

  // Save session only when user has made deliberate progress
  // This prevents ghost sessions from restored or synced state
  useEffect(() => {
    if (!recipe || !hasUserInteracted) return;

    // Check if there's any progress worth saving
    const hasProgress = currentStep > 0 ||
                       completedSteps.length > 0 ||
                       timerRunning ||
                       timerSeconds > 0;

    if (hasProgress) {
      const session = {
        recipeId: recipe.id,
        currentStep,
        completedSteps,
        timerSeconds,
        timerRunning,
        timestamp: new Date().getTime(),
        timerEndTime: timerRunning ? new Date().getTime() + timerSeconds * 1000 : null
      };
      console.log('[CookWithJamie] Saving session to localStorage:', session);
      localStorage.setItem(`cooking-session-${recipe.id}`, JSON.stringify(session));
    }
  }, [currentStep, completedSteps, timerSeconds, timerRunning, recipe, hasUserInteracted]);

  // Initialize WebSocket connection and audio capture when component mounts (only once)
  // This runs immediately when component mounts, which happens after user clicks "Cook with Jamie"
  useEffect(() => {
    if (!recipe || audioCaptureStartedRef.current) return;

    // WebSocket will auto-connect via useWebSocket hook
    // Request microphone permission and start audio capture silently
    const initializeAudio = async () => {
      try {
        console.log('🎤 Requesting microphone permission...');
        // Request permission silently (no UI blocking)
        await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('✅ Microphone permission granted');

        // Initialize and resume AudioContext for playback BEFORE starting capture
        try {
          console.log('🔊 Initializing AudioContext for playback...');
          const audioContext = await audioPlayback.initAudioContext();
          console.log('✅ AudioContext initialized, state:', audioContext?.state);
          if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
          }
        } catch (err: any) {
          console.error('❌ Error initializing AudioContext for playback:', err);
        }

        // Start audio capture automatically
        try {
          console.log('🎙️ Starting audio capture...');
          await audioCapture.startCapture();
          audioCaptureStartedRef.current = true;
          setIsListening(true);
          setVoiceError('');
          setIsMicMuted(false);
          audioCapture.setMuted(false);

          if (!isWebSocketConnected && !isWebSocketConnecting) {
            wsConnect();
          }
        } catch (err: any) {
          console.error('❌ Error starting audio capture:', err);
          setVoiceError('Failed to start audio capture');
        }
      } catch (err: any) {
        console.error('❌ Microphone permission error:', err);
        setVoiceError('Microphone permission denied');
        setIsMicMuted(true);
      }
    };

    const timeoutId = setTimeout(() => initializeAudio(), 100);

    return () => {
      clearTimeout(timeoutId);
      if (audioCaptureStartedRef.current) {
        audioCapture.stopCapture();
      }
      audioPlayback.cleanup();
      wsDisconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe]);

  // Update mic mute state (also mute when WS disconnects to avoid spam)
  useEffect(() => {
    if (!audioCaptureStartedRef.current) return;
    const shouldMute = isMicMuted || !isWebSocketConnected;
    audioCapture.setMuted(shouldMute);
  }, [isMicMuted, isWebSocketConnected, audioCapture]);

  // NEU-467: Release mic when user leaves the experience (tab switch, app background, lock screen).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (audioCaptureStartedRef.current) {
          console.log('[CookWithJamie] Page hidden – releasing microphone');
          audioCapture.stopCapture();
          audioCaptureStartedRef.current = false;
          setIsListening(false);
          wsDisconnect();
          setVoicePausedByVisibility(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [audioCapture, wsDisconnect]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setTimerRunning(false);
            console.log('⏰ Frontend timer finished');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds]);

  // Initialize Web Speech API
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setVoiceText(transcript);
        handleVoiceCommand(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'aborted') {
          setIsListening(false);
          setVoiceError('');
          return;
        }
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        setVoiceError(event.error);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleMicMute = () => setIsMicMuted(prev => !prev);

  const toggleVoiceListening = async () => {
    // If voice was paused by leaving the app, resume on tap
    if (voicePausedByVisibility) {
      await resumeVoiceAfterVisibility();
      return;
    }
    // If WebSocket is not connected, try to connect first
    if (!isWebSocketConnected && !isWebSocketConnecting) {
      console.log('🔌 WebSocket not connected, attempting to connect from mic button...');
      wsConnect();
      // Wait a moment and check if connection succeeded
      setTimeout(() => {
        if (isWebSocketConnected) {
          console.log('✅ WebSocket connected, enabling microphone');
          setIsMicMuted(false);
          audioCapture.setMuted(false);
        } else {
          toast.error('Failed to connect to backend. Please check your connection.', { duration: 5000 });
        }
      }, 2000);
      return;
    }

    // This now controls mic mute/unmute for WebSocket audio
    toggleMicMute();
  };

  /** NEU-467: Resume voice after user returned from background (tap to continue). */
  const resumeVoiceAfterVisibility = useCallback(async () => {
    if (!recipe) return;
    setVoicePausedByVisibility(false);
    setVoiceError('');
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = await audioPlayback.initAudioContext();
      if (audioContext?.state === 'suspended') await audioContext.resume();
      wsConnect();
      await audioCapture.startCapture();
      audioCaptureStartedRef.current = true;
      setIsListening(true);
      setIsMicMuted(false);
      audioCapture.setMuted(false);
      toast.success('Voice resumed', { duration: 2000 });
    } catch (err: any) {
      console.error('Failed to resume voice:', err);
      setVoiceError(err?.message || 'Could not resume microphone');
      setVoicePausedByVisibility(true);
    }
  }, [recipe, audioPlayback, audioCapture, wsConnect]);

  const handleVoiceCommand = (command: string) => {
    const lowerCommand = command.toLowerCase();

    // Navigation commands
    if (lowerCommand.includes('siguiente') || lowerCommand.includes('next')) {
      handleNext();
      speakText('Siguiente paso');
    } else if (lowerCommand.includes('anterior') || lowerCommand.includes('previous')) {
      handlePrevious();
      speakText('Paso anterior');
    } else if (lowerCommand.includes('repetir') || lowerCommand.includes('repeat')) {
      speakText(instructions[currentStep]);
    }

    // Timer commands
    else if (lowerCommand.includes('iniciar timer') || lowerCommand.includes('start timer')) {
      startTimer();
      speakText('Timer iniciado');
    } else if (lowerCommand.includes('pausar') || lowerCommand.includes('pause')) {
      setTimerRunning(false);
      speakText('Timer pausado');
    } else if (lowerCommand.includes('reiniciar') || lowerCommand.includes('reset')) {
      resetTimer();
      speakText('Timer reiniciado');
    } else if (lowerCommand.includes('agregar') || lowerCommand.includes('add')) {
      addMinute();
      speakText('Un minuto agregado');
    }

    // Other voice commands - just speak a response
    else {
      // For now, just acknowledge the command
      speakText("I heard you. Please use the microphone to communicate with Jamie.");
    }
  };


  if (!recipe) return null;

  const totalSteps = instructions.length;
  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const isCurrentStepCompleted = completedSteps.includes(currentStep);

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setHasUserInteracted(true);
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setHasUserInteracted(true);
      setCurrentStep(currentStep - 1);
    }
  };

  const toggleStepComplete = async () => {
    setHasUserInteracted(true);
    const wasCompleted = completedSteps.includes(currentStep);

    // Update local state first for immediate feedback
    if (wasCompleted) {
      setCompletedSteps(completedSteps.filter(s => s !== currentStep));
    } else {
      setCompletedSteps([...completedSteps, currentStep]);
    }

    // Notify backend when marking a step as complete (not when unmarking)
    if (!wasCompleted && sessionInfo?.session_id) {
      // Get the backend step ID for the current step
      const backendStep = recipe?.backendSteps?.[currentStep];
      const stepId = backendStep?.id;

      if (stepId) {
        try {
          // @ts-expect-error - Vite provides import.meta.env
          const wsUrl = import.meta.env.VITE_WS_URL || 'wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice';
          // Derive API base URL from WebSocket URL
          const apiBaseUrl = wsUrl
            .replace('wss://', 'https://')
            .replace('ws://', 'http://')
            .replace('/ws/voice', '');

          const response = await fetch(
            `${apiBaseUrl}/sessions/${sessionInfo.session_id}/steps/${stepId}/confirm`,
            { method: 'POST' }
          );

          if (response.ok) {
            console.log(`✅ Step ${stepId} confirmed with backend`);
          } else {
            console.warn(`⚠️ Failed to confirm step ${stepId} with backend:`, response.status);
          }
        } catch (error) {
          console.error('Error confirming step with backend:', error);
        }
      } else {
        if (isWebSocketConnected) {
          const stepDesc = instructions[currentStep];
          wsSendMessage({
            event: 'text',
            data: { message: `I completed the current step: ${stepDesc}` },
          });
          console.log('📤 Sent step completion via WebSocket text message');
        }
      }
    }
  };

  // Start a backend timer for the current step (parallel cooking support)
  const startBackendTimer = async (stepId?: string) => {
    const targetStepId = stepId || recipe?.backendSteps?.[currentStep]?.id;

    if (!targetStepId || !sessionInfo?.session_id) {
      console.warn('Cannot start backend timer: missing stepId or session');
      return false;
    }

    try {
      // @ts-expect-error - Vite provides import.meta.env
      const wsUrl = import.meta.env.VITE_WS_URL || 'wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice';
      const apiBaseUrl = wsUrl
        .replace('wss://', 'https://')
        .replace('ws://', 'http://')
        .replace('/ws/voice', '');

      const response = await fetch(
        `${apiBaseUrl}/sessions/${sessionInfo.session_id}/steps/${targetStepId}/start-timer`,
        { method: 'POST' }
      );

      if (response.ok) {
        console.log(`⏰ Started backend timer for step ${targetStepId}`);
        toast.success('Timer started!', {
          description: 'The timer is now running in the background.',
          duration: 3000,
        });
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.warn(`⚠️ Failed to start timer:`, response.status, errorData);
        toast.error('Could not start timer', {
          description: errorData.detail || 'Please try again.',
          duration: 3000,
        });
        return false;
      }
    } catch (error) {
      console.error('Error starting timer:', error);
      return false;
    }
  };

  // Cancel a backend timer
  const cancelBackendTimer = async (timerId: string) => {
    if (!sessionInfo?.session_id) {
      console.warn('Cannot cancel timer: missing session');
      return false;
    }

    try {
      // @ts-expect-error - Vite provides import.meta.env
      const wsUrl = import.meta.env.VITE_WS_URL || 'wss://jamie-backend-alb-685777308.us-east-1.elb.amazonaws.com/ws/voice';
      const apiBaseUrl = wsUrl
        .replace('wss://', 'https://')
        .replace('ws://', 'http://')
        .replace('/ws/voice', '');

      const response = await fetch(
        `${apiBaseUrl}/sessions/${sessionInfo.session_id}/timers/${timerId}/cancel`,
        { method: 'POST' }
      );

      if (response.ok) {
        console.log(`⏰ Cancelled timer ${timerId}`);
        return true;
      } else {
        console.warn(`⚠️ Failed to cancel timer:`, response.status);
        return false;
      }
    } catch (error) {
      console.error('Error cancelling timer:', error);
      return false;
    }
  };

  const startTimer = () => {
    setHasUserInteracted(true);
    if (timerSeconds === 0) {
      setTimerSeconds(timerMinutes * 60);
    }
    setTimerRunning(true);
  };

  const pauseTimer = () => {
    setHasUserInteracted(true);
    setTimerRunning(false);
  };

  const resetTimer = () => {
    setHasUserInteracted(true);
    setTimerRunning(false);
    setTimerSeconds(timerMinutes * 60);
  };

  const addMinute = () => {
    setHasUserInteracted(true);
    setTimerSeconds(prev => prev + 60);
  };

  const subtractMinute = () => {
    setHasUserInteracted(true);
    setTimerSeconds(prev => Math.max(0, prev - 60));
  };

  const [shouldShowTimer, setShouldShowTimer] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Only show timer when:
  // 1. A timer is actively running, OR
  // 2. The current step is a timer step (type='timer' or has duration)
  useEffect(() => {
    const backendStep = recipe?.backendSteps?.[currentStep];
    const isTimerStep = Boolean(
      backendStep?.type === 'timer' ||
      (backendStep?.duration && parseIsoDurationToSeconds(backendStep.duration) > 0)
    );

    setShouldShowTimer(timerRunning || isTimerStep);
  }, [timerSeconds, timerRunning, recipe, currentStep, parseIsoDurationToSeconds]);

  const handleExitClick = () => {
    console.log('Exit clicked - currentStep:', currentStep, 'completedSteps:', completedSteps, 'timerRunning:', timerRunning, 'timerSeconds:', timerSeconds);

    // Check if there's any progress: moved from step 0, completed steps, or has active/running timer
    const hasProgress = currentStep > 0 ||
                       completedSteps.length > 0 ||
                       timerRunning ||
                       timerSeconds > 0;

    if (!hasProgress) {
      console.log('No progress, exiting directly to chat');
      onClose();
      // Navigate back to chat modal
      if (onBackToChat) {
        onBackToChat();
      }
      return;
    }

    // Otherwise show confirmation
    console.log('Showing exit confirmation dialog - user has progress');
    setShowExitConfirmation(true);
  };

  const handleExitWithoutSaving = () => {
    console.log('Exit without saving');
    if (recipe) {
      localStorage.removeItem(`cooking-session-${recipe.id}`);
    }
    toast.info('Session discarded', {
      description: 'Your progress was not saved'
    });
    setShowExitConfirmation(false);
    onClose();
    // Navigate back to chat modal
    if (onBackToChat) {
      onBackToChat();
    }
  };

  const handleSaveAndExit = () => {
    console.log('Save and exit');
    // Session is already being saved automatically - no toast needed
    setShowExitConfirmation(false);
    // Cleanup WebSocket and audio
    audioCapture.stopCapture();
    audioPlayback.cleanup();
    wsDisconnect();
    onClose();
    // Navigate back to chat modal
    if (onBackToChat) {
      onBackToChat();
    }
  };

  const handleExitKeepTimerActive = () => {
    console.log('Exit keeping timer active');
    // Session is already being saved automatically - no toast needed
    setShowExitConfirmation(false);
    // Don't disconnect WebSocket or stop audio - keep them running
    onClose();
    // Navigate back to chat modal
    if (onBackToChat) {
      onBackToChat();
    }
  };

  const handleFinishCooking = () => {
    if (!recipe) return;

    // Mark recipe as completed
    const completedRecipe = {
      recipeId: recipe.id,
      completedAt: new Date().getTime(),
      completedSteps: completedSteps,
      totalSteps: instructions.length
    };
    localStorage.setItem(`completed-recipe-${recipe.id}`, JSON.stringify(completedRecipe));

    // Remove the cooking session so it doesn't show as "in progress"
    localStorage.removeItem(`cooking-session-${recipe.id}`);

    // Clear chat history when recipe is completed
    clearChatHistory();

    // Send finish message to WebSocket if connected
    if (isWebSocketConnected) {
      wsSendMessage({
        event: 'text',
        data: { message: 'I finished the recipe' },
      });
    }

    // Cleanup WebSocket and audio
    audioCapture.stopCapture();
    audioPlayback.cleanup();
    wsDisconnect();

    // Show completion modal instead of toast
    setShowCompletionModal(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Nav */}
      <div className="bg-white rounded-bl-[16px] rounded-br-[16px] h-[56px] shrink-0">
        <div className="mx-auto grid grid-cols-3 items-center px-4" style={{ width: '600px', height: '100%', boxSizing: 'border-box' }}>
        {/* Close Button */}
          <div className="flex items-center">
        <button
          onClick={onClose}
              className="size-[24px] flex items-center justify-center z-10"
        >
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6L18 18" stroke="#327179" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        </button>
          </div>
          {/* Logo - Centered */}
          <div className="flex items-center justify-center">
            <img
              src={jamieLogo}
              alt="Jamie Oliver"
              className="h-6 w-auto object-contain"
              style={{ maxWidth: '165px' }}
            />
          </div>
          {/* Mic Control */}
          <div className="flex items-center justify-end">
              <button
              onClick={toggleVoiceListening}
                className="inline-flex rounded-full transition-colors"
                style={{
                  padding: '0 0 0 12px',
                  height: '42px',
                  width: '93px',
                  borderRadius: '999px',
                  boxShadow: '0 2px 9px rgba(0, 0, 0, 0.08)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 0,
                  backgroundColor: '#F9FAFB',
                }}
                title={
                  voicePausedByVisibility
                    ? 'Voice paused – tap to continue with Jamie'
                    : !isWebSocketConnected
                      ? `WebSocket not connected - ${wsError || 'Click to reconnect'}`
                      : isMicMuted
                        ? 'Microphone muted - tap to enable'
                        : 'Microphone active - tap to mute'
                }
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={micIconSrc}
                    alt={micIconAlt}
                    style={{ width: '18px', height: '18px' }}
                  />
              </div>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 'auto',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={micRingSrc}
                    alt={isMicMuted ? 'Microphone muted' : 'Microphone active'}
                    style={{ display: 'block' }}
                  />
                </div>
              </button>
            </div>
          </div>
      </div>

      {/* NEU-467: Banner when voice was paused because user left the app */}
      {voicePausedByVisibility && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20"
          style={{ paddingLeft: 'clamp(16px, 24px)', paddingRight: 'clamp(16px, 24px)' }}
        >
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Voice paused because you left the app. Tap the mic to continue with Jamie.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-500/50 text-amber-700 hover:bg-amber-500/20"
            onClick={resumeVoiceAfterVisibility}
          >
            Continue
          </Button>
        </div>
      )}

      {/* Scrollable Content */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {/* Recipe Card Section */}
        <div style={{ paddingTop: '16px', paddingBottom: 'clamp(16px, calc(100vw * 24 / 390), 24px)', paddingLeft: 'clamp(16px, calc(100vw * 24 / 390), 24px)', paddingRight: 'clamp(16px, calc(100vw * 24 / 390), 24px)', boxSizing: 'border-box' }}>
          <div className="w-full flex items-center justify-center">
            <div className="pointer-events-none select-none flex items-center justify-center" style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
              <RecipeCard recipe={recipe} onClick={() => {}} variant="cooking" />
            </div>
          </div>

        {/* Recipe Title - Outside RecipeCard, 24px below image */}
        <div className="w-full flex items-center justify-center" style={{ marginTop: '24px', paddingLeft: 'clamp(16px, calc(100vw * 24 / 390), 24px)', paddingRight: 'clamp(16px, calc(100vw * 24 / 390), 24px)', boxSizing: 'border-box' }}>
          <h2 className="text-lg font-semibold text-foreground">{recipe.title}</h2>
        </div>
        </div>
      </div>

      {/* Timer section - when step has timer or timer is running */}
      {shouldShowTimer && (
        <div className="p-6 border-t border-border/30">
          <TimerPanel
            timers={activeTimers}
            onTimerCancel={cancelBackendTimer}
          />
          {/* Timer Controls - Clean and minimal */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button
              onClick={subtractMinute}
              variant="ghost"
              size="sm"
              disabled={timerSeconds === 0}
              className="size-10 p-0"
            >
              <Minus className="size-4" />
            </Button>

            {!timerRunning ? (
              <Button
                onClick={startTimer}
                size="lg"
                className="gap-2 bg-[#0A7E6C] hover:bg-[#0A7E6C]/90"
              >
                <Play className="size-5" />
                {timerSeconds === 0 ? 'Start Timer' : 'Resume'}
              </Button>
            ) : (
              <Button
                onClick={pauseTimer}
                size="lg"
                className="gap-2"
                variant="outline"
              >
                <Pause className="size-5" />
                Pause
              </Button>
            )}

            <Button
              onClick={addMinute}
              variant="ghost"
              size="sm"
              className="size-10 p-0"
            >
              <Plus className="size-4" />
            </Button>

            <Button
              onClick={resetTimer}
              variant="ghost"
              size="sm"
              className="size-10 p-0"
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Tap +/− to adjust time by minute
          </p>

          {/* Backend Timer Start - for parallel cooking */}
          {(() => {
            const backendStep = recipe?.backendSteps?.[currentStep];
            const isTimerStep = backendStep?.type === 'timer' ||
                               (backendStep?.duration && parseIsoDurationToSeconds(backendStep.duration) > 0);
            const hasActiveBackendTimer = backendStep && activeTimers.some(t => t.step_id === backendStep.id);

            if (isTimerStep && !hasActiveBackendTimer) {
              return (
                <div className="mt-6 pt-6 border-t border-border/30">
                  <Button
                    onClick={() => startBackendTimer()}
                    variant="outline"
                    size="lg"
                    className="w-full gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                  >
                    <Bell className="size-4" />
                    Start Step Timer (runs in background)
                  </Button>
                  <p className="text-center text-xs text-muted-foreground mt-2">
                    Timer will continue while you work on other steps
                  </p>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {/* Main Content */}
      <div className="p-6">
        {/* Current Step - Editorial redesign */}
        <div className="max-w-3xl mx-auto mb-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className="mb-8 flex flex-col items-center"
                style={{ gap: '24px', marginTop: '24px' }}
              >
                <div className="w-full max-w-[420px] flex gap-2">
            {instructions.map((_, idx) => {
              const hasTimer = stepHasActiveTimer(idx);
              const isCurrentStep = idx === currentStep;
              const isCompleted = completedSteps.includes(idx);

              return (
                <button
                  key={idx}
                  onClick={() => setCurrentStep(idx)}
                  className={`relative h-1 flex-1 rounded-full transition-colors ${
                    isCurrentStep
                      ? 'bg-[#0A7E6C]'
                      : isCompleted
                        ? 'bg-[#81EB67]'
                        : hasTimer
                          ? 'bg-amber-500'
                          : 'bg-muted-foreground/20'
                  }`}
                  aria-label={`Go to step ${idx + 1}${hasTimer ? ' (timer running)' : ''}`}
                >
                  {/* Pulsing indicator for steps with active timers */}
                  {hasTimer && !isCurrentStep && (
                    <span className="absolute inset-0 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
                <div className="w-full max-w-[420px]">
                  <div
                    className="rounded-full bg-[#0A7E6C]/10 px-4 py-3"
                    style={{ width: '100%', textAlign: 'center' }}
                  >
                    <span className="text-sm font-medium text-[#0A7E6C]">
                      Step {currentStep + 1} of {totalSteps}
                    </span>
                  </div>
          </div>

                {/* Step Instructions - Clean and prominent */}
                <div className="w-full max-w-[420px]">
                  <p className="text-xl leading-relaxed text-foreground/90">
                    {instructions[currentStep]}
                  </p>
                </div>
                <div className="mt-6">
                  <Button onClick={toggleStepComplete} variant={isCurrentStepCompleted ? 'outline' : 'default'} className="w-full">
                    {isCurrentStepCompleted ? 'Mark step incomplete' : 'Mark step complete'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
