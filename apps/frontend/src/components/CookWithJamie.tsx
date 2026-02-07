import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Recipe } from '../data/recipes';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Minus,
  Mic,
  Volume2,
  X,
  AlertCircle,
  RefreshCw,
  Save,
  Trash2,
  MicOff,
  ArrowRight,
  Bell
} from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { useWebSocket, type RecipeState, type ActiveTimerInfo } from '../hooks/useWebSocket';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { RecipeCard } from './RecipeCard';
import { TimerPanel, type ActiveTimer } from './TimerPanel';
import { clearChatHistory } from './ChatView';
// @ts-ignore - handled by Vite
import jamieLogoImport from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';
const jamieLogo = typeof jamieLogoImport === 'string' ? jamieLogoImport : (jamieLogoImport as any).src || jamieLogoImport;

interface CookWithJamieProps {
  recipe: Recipe | null;
  onClose: () => void;
  onBackToChat?: () => void;
  onExploreRecipes?: () => void;
}

export function CookWithJamie({ recipe, onClose, onBackToChat, onExploreRecipes }: CookWithJamieProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([] as number[]);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  // Timer states
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(10); // Default timer

  // Active timers from backend (parallel cooking support)
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);

  // Session tracking - only save when user has made deliberate progress
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
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
      // Sync state from backend
      syncRecipeStateFromBackend(state);
    },
    onRecipeMessage: (message) => {
      // Keep logs for debugging but avoid UI interruptions
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
      // Convert to ActiveTimer format for TimerPanel
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
    onAudio: (base64Audio) => {
      // Play audio response from backend
      console.log('🎵 Received audio from backend, length:', base64Audio?.length || 0);
      if (base64Audio) {
        audioPlayback.playAudio(base64Audio).catch((err) => {
          console.error('Error playing audio:', err);
        });
      } else {
        console.warn('Received empty audio data');
      }
    },
    onControl: handleControl,
    onStop: () => {
      // Backend requested stop
      handleSaveAndExit();
    },
  });

  useEffect(() => {
    if (sessionInfo) {
      console.log('[WebSocket] Session info received:', sessionInfo);
    }
  }, [sessionInfo]);

  // Audio capture hook - only send audio when mic is active
  const audioCapture = useAudioCapture({
    sampleRate: 16000,
    onAudioData: (base64Audio) => {
      // Send audio to WebSocket only when the connection is open and mic is active
      if (!canStreamAudioRef.current) {
        return;
      }
      wsSendAudio(base64Audio);
    },
  });

  useEffect(() => {
    canStreamAudioRef.current = isWebSocketConnected && !isMicMuted;
  }, [isWebSocketConnected, isMicMuted]);

  useEffect(() => {
    if (!recipe) return;
    const backendStep = recipe.backendSteps?.[currentStep];
    const candidateSeconds =
      parseIsoDurationToSeconds(backendStep?.duration) ||
      extractSecondsFromInstruction(backendStep?.instructions) ||
      extractSecondsFromInstruction(instructions[currentStep]);

    if (
      candidateSeconds > 0 &&
      lastAutoTimerStepRef.current !== currentStep
    ) {
      setTimerSeconds(candidateSeconds);
      setTimerMinutes(Math.max(1, Math.round(candidateSeconds / 60) || 1));
      setTimerRunning(false);
      lastAutoTimerStepRef.current = currentStep;
    }
  }, [
    recipe,
    currentStep,
    instructions,
    parseIsoDurationToSeconds,
    extractSecondsFromInstruction,
  ]);

  // Sync recipe state from backend WebSocket
  const syncRecipeStateFromBackend = useCallback((state: RecipeState) => {
    if (!state || !recipe) return;

    // CRITICAL: Only apply state if it's for the current recipe
    // This prevents ghost sessions from stale backend state
    const currentRecipeId = recipe.backendId || String(recipe.id);
    if (state.recipe_id && state.recipe_id !== currentRecipeId) {
      console.warn('[CookWithJamie] Ignoring state for different recipe:', state.recipe_id, 'vs', currentRecipeId);
      return;
    }

    const resolveStepIndex = (stepId?: string, descr?: string): number | null => {
      if (stepId && stepIdToIndex.has(stepId)) {
        return stepIdToIndex.get(stepId)!;
      }
      if (descr && recipe.backendSteps?.length) {
        const descrMatch = recipe.backendSteps.findIndex(
          (step) => step.descr.toLowerCase() === descr.toLowerCase()
        );
        if (descrMatch >= 0) {
          return descrMatch;
        }
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
          setCurrentStep((prev) => {
            if (prev === 0 || stepIndex > prev) {
              return stepIndex;
            }
            return prev;
          });
        }
      }

      const completedIndices = stepsArray
        .filter(step => step.status === 'completed')
        .map(step => resolveStepIndex(step.id, step.descr))
        .filter((idx): idx is number => idx !== null);

        setCompletedSteps(completedIndices);

      const stepWithTimer = stepsArray.find(step => step.timer && (step.status === 'active' || step.status === 'waiting_ack'));
      if (stepWithTimer?.timer) {
        const { remaining_secs, end_ts, duration_secs } = stepWithTimer.timer;
        const remaining = typeof remaining_secs === 'number'
          ? remaining_secs
          : end_ts
            ? Math.max(0, Math.floor(end_ts - Date.now() / 1000))
            : duration_secs ?? 0;
        setTimerSeconds(remaining);
        setTimerRunning(remaining > 0);
      } else if (!state.timers || state.timers.length === 0) {
        setTimerRunning(false);
      }
    } else if (Array.isArray(state.completed_steps)) {
      const completedIndices = state.completed_steps
        .map(step => {
          if (typeof step === 'number') {
            return step;
          }
          return resolveStepIndex(String(step));
        })
        .filter((idx): idx is number => typeof idx === 'number' && idx >= 0);
      setCompletedSteps(completedIndices);
    }

    if (state.current_step !== undefined && state.current_step >= 0) {
      const boundedIndex = instructions.length > 0
        ? Math.min(state.current_step, instructions.length - 1)
        : 0;
      setCurrentStep((prev) => {
        if (prev === 0 || boundedIndex > prev) {
          return boundedIndex;
        }
        return prev;
      });
    }

    if (state.timers && state.timers.length > 0) {
      const activeTimer = state.timers[0];
      if (activeTimer.remaining !== undefined) {
        setTimerSeconds(activeTimer.remaining);
        setTimerRunning(activeTimer.remaining > 0);
      }
    }
  }, [instructions, recipe, stepIdToIndex]);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  // Mic UI assets switch based on mute state
  const micIconSrc = isMicMuted ? '/assets/tabler-icon-microphone-off.svg' : '/assets/tabler-icon-microphone.svg';
  const micRingSrc = isMicMuted ? '/assets/Ellipse-red.svg' : '/assets/Ellipse-green.svg';
  const micIconAlt = isMicMuted ? 'Mic off' : 'Mic on';

  // Load saved session on mount
  useEffect(() => {
    if (recipe) {
      const savedSession = localStorage.getItem(`cooking-session-${recipe.id}`);
      if (savedSession) {
        const session = JSON.parse(savedSession);
        const now = new Date().getTime();
        const sessionAge = now - session.timestamp;

        // Only restore if session is less than 24 hours old
        if (sessionAge < 24 * 60 * 60 * 1000) {
          // Verify the session is for this recipe (extra safety check)
          if (session.recipeId !== recipe.id) {
            console.warn('[CookWithJamie] Session recipeId mismatch, clearing:', session.recipeId, 'vs', recipe.id);
            localStorage.removeItem(`cooking-session-${recipe.id}`);
            return;
          }

          // Automatically restore session without toast - user already clicked "Continue Cooking"
          setCurrentStep(session.currentStep);
          setCompletedSteps(session.completedSteps);

          // Mark as interacted since user is continuing a previous session
          setHasUserInteracted(true);

          // Handle timer restoration - check if timer was kept active
          if (session.timerEndTime && session.timerEndTime > now) {
            // Timer was running in background and still has time left
            const remainingSeconds = Math.ceil((session.timerEndTime - now) / 1000);
            setTimerSeconds(remainingSeconds);
            setTimerRunning(true);
            toast.success('Timer restored', {
              description: `Still running - ${formatTime(remainingSeconds)} remaining`,
              duration: 3000
            });
          } else if (session.timerEndTime && session.timerEndTime <= now) {
            // Timer finished while user was away
            setTimerSeconds(0);
            setTimerRunning(false);
            toast.info('Timer finished!', {
              description: 'Your timer completed while you were away',
              duration: 5000
            });
          } else {
            // Timer was paused
            setTimerSeconds(session.timerSeconds || 0);
            setTimerRunning(false);
          }
        } else {
          // Clear old session
          localStorage.removeItem(`cooking-session-${recipe.id}`);
        }
      }
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
        // This is critical - AudioContext must be resumed after user interaction
        // Since this runs in useEffect after mount (which happens after user click), it should work
        try {
          console.log('🔊 Initializing AudioContext for playback...');
          const audioContext = await audioPlayback.initAudioContext();
          console.log('✅ AudioContext initialized, state:', audioContext?.state);
          if (audioContext && audioContext.state === 'suspended') {
            console.log('⏸️ AudioContext is suspended, attempting to resume...');
            await audioContext.resume();
            console.log('✅ AudioContext resumed, new state:', audioContext.state);
          } else {
            console.log('✅ AudioContext is already running');
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
          console.log('✅ Audio capture started successfully');
          // Ensure mic is not muted (active by default)
          setIsMicMuted(false);
          audioCapture.setMuted(false);
          console.log('✅ Microphone is active (not muted)');
          console.log('🔌 WebSocket connection status:', {
            connected: isWebSocketConnected,
            connecting: isWebSocketConnecting,
            error: wsError,
            recipeId: recipeId,
          });

          // If WebSocket is not connected, try to connect manually
          if (!isWebSocketConnected && !isWebSocketConnecting) {
            console.log('⚠️ WebSocket not connected, attempting manual connection...');
            wsConnect();
          }
        } catch (err: any) {
          console.error('❌ Error starting audio capture:', err);
          setVoiceError('Failed to start audio capture');
        }
      } catch (err: any) {
        console.error('❌ Microphone permission error:', err);
        setVoiceError('Microphone permission denied');
        // Don't block the UI - user can still use text chat
        // Mic will remain muted/inactive
        setIsMicMuted(true);
      }
    };

    // Use a small timeout to ensure the component is fully mounted
    // This helps ensure the AudioContext can be resumed after user interaction
    const timeoutId = setTimeout(() => {
      initializeAudio();
    }, 100);

    // Cleanup on unmount
    return () => {
      clearTimeout(timeoutId);
      if (audioCaptureStartedRef.current) {
        audioCapture.stopCapture();
      }
      audioPlayback.cleanup();
      wsDisconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe]); // Only depend on recipe, not on hooks to avoid loops

  // Update mic mute state (also mute when WS disconnects to avoid spam)
  useEffect(() => {
    if (!audioCaptureStartedRef.current) return;
    const shouldMute = isMicMuted || !isWebSocketConnected;
    audioCapture.setMuted(shouldMute);
  }, [isMicMuted, isWebSocketConnected, audioCapture]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setTimerRunning(false);
            // Timer finished - backend agent will announce via voice
            // Don't use speakText here to avoid audio clash with ElevenLabs
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
        // Silently handle permission denied and user aborted errors
        if (event.error === 'not-allowed' || event.error === 'aborted') {
          setIsListening(false);
          setVoiceError('');
          return;
        }

        // Only show error for other types
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        setVoiceError(event.error);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setVoiceSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleMicMute = () => {
    setIsMicMuted(!isMicMuted);
    if (!isMicMuted) {
      toast.info('Microphone muted', { duration: 2000 });
    } else {
      toast.info('Microphone active', { duration: 2000 });
    }
  };

  const toggleVoiceListening = async () => {
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
          // Don't revert local state - the user action should still "feel" complete
        }
      } else {
        // If no backend step ID, try sending via WebSocket as a text message
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
      console.error('Error starting backend timer:', error);
      toast.error('Timer error', {
        description: 'Could not connect to server.',
        duration: 3000,
      });
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
      className="fixed inset-0 z-50 bg-background"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Sticky Header - Back, Logo, Mic */}
      <header
        style={{
          flexShrink: 0,
          backgroundColor: 'white',
          zIndex: 10,
          paddingTop: 'clamp(16px, calc(100vw * 24 / 390), 24px)',
          paddingBottom: '12px',
          paddingLeft: 'clamp(16px, calc(100vw * 24 / 390), 24px)',
          paddingRight: 'clamp(16px, calc(100vw * 24 / 390), 24px)',
          boxSizing: 'border-box',
        }}
      >
        <div className="grid grid-cols-3 items-center gap-3" style={{ width: '100%', maxWidth: '600px', boxSizing: 'border-box', margin: '0 auto' }}>
          {/* Back Button */}
          <div className="flex items-center">
            <button
              onClick={handleExitClick}
              className="inline-flex items-center justify-center"
              style={{ padding: 0, background: 'transparent' }}
              aria-label="Back"
            >
              <img
                src="/assets/Back.svg"
                alt="Back"
                style={{ width: '24px', height: '24px', display: 'block' }}
              />
            </button>
          </div>
          {/* Logo - Centered (consistent 24px height across all layouts) */}
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
                  !isWebSocketConnected
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
      </header>

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
          <div
            style={{
              width: '100%',
              maxWidth: '600px',
              textAlign: 'left',
              margin: '0 auto'
            }}
          >
            <h3
              style={{
                color: '#2C5F5D',
                fontFamily: 'Poppins, sans-serif',
                fontSize: 'clamp(20px, calc(100vw * 26 / 390), 26px)',
                fontWeight: 700,
                letterSpacing: '0.087px',
                lineHeight: '24px',
                textTransform: 'uppercase',
                margin: 0,
              }}
            >
              {recipe.title}
            </h3>
          </div>
        </div>
      </div>

      {/* Active Timers Panel (Parallel Cooking Support) */}
      {activeTimers.length > 0 && (
        <div className="px-6 py-4">
          <div className="max-w-2xl mx-auto">
            <TimerPanel
              timers={activeTimers}
              onTimerComplete={(timer) => {
                toast.info('Timer Complete!', {
                  description: `${timer.label} is done!`,
                  duration: 5000,
                });
              }}
              onTimerCancel={(timerId) => {
                // Cancel timer via backend API
                cancelBackendTimer(timerId);
              }}
              onTimerSelect={(timer) => {
                // Navigate to the step if it has one
                if (timer.step_id && recipe) {
                  const stepIndex = stepIdToIndex.get(timer.step_id);
                  if (stepIndex !== undefined && stepIndex !== currentStep) {
                    setCurrentStep(stepIndex);
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Timer Section - Redesigned */}
      {shouldShowTimer && (
        <div className="px-6 py-8 border-b border-border/50">
          <div className="max-w-2xl mx-auto">
          {/* Timer Display */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Timer className={`size-5 transition-colors ${
                timerRunning ? 'text-[#0A7E6C]' : 'text-muted-foreground'
              }`} />
              <span className="text-sm text-muted-foreground">Kitchen Timer</span>
            </div>
            <div className={`text-7xl tabular-nums transition-colors ${
              timerRunning ? 'text-[#0A7E6C]' : 'text-foreground'
            }`}>
              {formatTime(timerSeconds)}
            </div>
          </div>

          {/* Timer Controls - Clean and minimal */}
          <div className="flex items-center justify-center gap-3">
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
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Mark Complete */}
          <Button
            onClick={toggleStepComplete}
            variant="ghost"
            size="lg"
            className="mb-8 flex items-center justify-center gap-2"
            style={{
              marginTop: '24px',
              height: '48px',
              padding: '14px 26px',
              gap: '9px',
              borderRadius: '33554400px',
              border: isCurrentStepCompleted ? '2px solid #007AFF' : '2px solid #3D6E6C',
              backgroundColor: isCurrentStepCompleted ? 'rgba(0, 122, 255, 0.1)' : 'transparent',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            <CheckCircle2
              className="size-5"
                style={{ color: isCurrentStepCompleted ? '#007AFF' : '#3D6E6C' }}
            />
              <span style={{ color: isCurrentStepCompleted ? '#007AFF' : '#3D6E6C' }}>
                {isCurrentStepCompleted ? 'COMPLETED' : 'MARK COMPLETE'}
              </span>
          </Button>

          {/* Navigation Buttons - Clean */}
          <div className="flex items-center justify-between gap-3">
            <Button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              variant="ghost"
              size="lg"
              className="gap-2 text-[14px]"
              style={{
                display: 'flex',
                height: '48px',
                padding: '14px 24px',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '9px',
                borderRadius: '33554400px',
                opacity: 0.5,
              }}
            >
              <ChevronLeft className="size-5" />
              Previous
            </Button>

            {currentStep === totalSteps - 1 ? (
              <Button
                onClick={handleFinishCooking}
                size="lg"
                className="gap-2 bg-[#3D6E6C] hover:bg-[#2c5654] text-[14px]"
                style={{
                  display: 'flex',
                  height: '48px',
                  padding: '14px 25px 14px 24px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '33554400px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  backgroundColor: '#3D6E6C',
                  color: '#FFFFFF',
                }}
              >
                Finish Cooking
                <CheckCircle2 className="size-5" />
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                size="lg"
                className="gap-2 bg-[#3D6E6C] hover:bg-[#2c5654] text-[14px]"
                style={{
                  display: 'flex',
                  height: '48px',
                  padding: '14px 25px 14px 24px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '33554400px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  backgroundColor: '#3D6E6C',
                  color: '#FFFFFF',
                }}
              >
                Next Step
                <ChevronRight className="size-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Completion Celebration */}
      {currentStep === totalSteps - 1 && completedSteps.length === totalSteps && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-6"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#0A7E6C]/10 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-[#0A7E6C]" />
            </div>
            <h2 className="text-2xl font-bold text-[#2C5F5D] mb-2">
              Brilliant! You Did It!
            </h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Your <span className="font-medium">{recipe.title}</span> is ready to serve.
              Enjoy your delicious creation!
            </p>
            <div className="flex flex-col gap-3">
              <Button
                onClick={onClose}
                size="lg"
                className="w-full bg-[#3D6E6C] hover:bg-[#2c5654] rounded-full h-12"
              >
                Done
              </Button>
              <Button
                onClick={onClose}
                variant="ghost"
                size="lg"
                className="w-full text-gray-500 rounded-full h-12"
              >
                Cook again
            </Button>
          </div>
          </motion.div>
        </motion.div>
      )}
      </div>
      {/* End Scrollable Content */}

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {timerRunning && timerSeconds > 0
                ? `Active timer: ${formatTime(timerSeconds)}`
                : 'Leave cooking session?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {timerRunning && timerSeconds > 0
                ? 'Your timer is still running. What would you like to do?'
                : 'Would you like to save your progress for later?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 mt-4">
            {timerRunning && timerSeconds > 0 ? (
              <>
                <Button
                  onClick={handleExitKeepTimerActive}
                  style={{ backgroundColor: 'var(--jamie-primary-dark)' }}
                  className="w-full"
                >
                  Keep timer running
                </Button>
                <Button
                  onClick={handleSaveAndExit}
                  variant="outline"
                  className="w-full"
                >
                  Pause timer & save
                </Button>
                <Button
                  onClick={handleExitWithoutSaving}
                  variant="ghost"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Discard session
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleSaveAndExit}
                  style={{ backgroundColor: 'var(--jamie-primary-dark)' }}
                  className="w-full"
                >
                  Save & exit
                </Button>
                <Button
                  onClick={handleExitWithoutSaving}
                  variant="outline"
                  className="w-full"
                >
                  Exit without saving
                </Button>
              </>
            )}
            <Button
              onClick={() => setShowExitConfirmation(false)}
              variant="ghost"
              className="w-full"
            >
              Keep cooking
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Completion Modal */}
      <AnimatePresence>
        {showCompletionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background flex flex-col"
          >
            {/* Header */}
            <div className="px-6 pt-8 pb-6 flex-shrink-0">
              <div className="flex items-center justify-center w-full" style={{ paddingLeft: 'clamp(16px, calc(100vw * 24 / 390), 24px)', paddingRight: 'clamp(16px, calc(100vw * 24 / 390), 24px)', boxSizing: 'border-box' }}>
                <div className="grid grid-cols-3 items-start gap-3" style={{ width: '100%', maxWidth: '600px', boxSizing: 'border-box', margin: '0 auto' }}>
                  {/* Close Button */}
                  <div className="flex items-start">
                    <button
                      onClick={() => {
                        setShowCompletionModal(false);
                        onClose();
                        if (onExploreRecipes) {
                          onExploreRecipes();
                        }
                      }}
                      className="inline-flex items-center justify-center"
                      style={{ marginTop: '16px', padding: 0, background: 'transparent' }}
                      aria-label="Close"
                    >
                      <svg className="block size-6" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
                        <path d="M18 6L6 18M6 6L18 18" stroke="#327179" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </div>
                  {/* Logo - Centered */}
                  <div className="flex items-center justify-center">
                    <div
                      className="flex items-center justify-center"
                      style={{
                        marginTop: '17px',
                        height: 'clamp(20px, calc(100vw * 24 / 390), 24px)',
                        width: 'clamp(140px, calc(100vw * 171.75 / 390), 171.75px)',
                        maxWidth: '171.75px'
                      }}
                    >
                      <img
                        src={jamieLogo}
                        alt="Jamie Oliver"
                        className="h-full w-full object-contain"
                        style={{ maxWidth: '100%', maxHeight: '100%' }}
                      />
                    </div>
                  </div>
                  {/* Mic Control */}
                  <div className="flex items-start justify-end">
                    <button
                      onClick={toggleVoiceListening}
                      className="inline-flex rounded-full transition-colors"
                      title={isMicMuted ? 'Microphone muted - tap to enable' : 'Microphone active - tap to mute'}
                      style={{
                        marginTop: '7px',
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
            </div>

            {/* Content - Centered vertically */}
            <div className="flex-1 flex items-center justify-center px-6">
              <div style={{ width: '300px', boxSizing: 'border-box' }}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                  className="text-center"
                >
                  <h2
                    style={{
                      color: '#2C5F5D',
                      fontFamily: 'Poppins, sans-serif',
                      fontSize: '32px',
                      fontWeight: 700,
                      lineHeight: '1.2',
                      marginBottom: '16px',
                    }}
                  >
                    WELL DONE!
                  </h2>
                  <p
                    style={{
                      color: '#2C5F5D',
                      fontFamily: 'Poppins, sans-serif',
                      fontSize: '16px',
                      fontWeight: 400,
                      lineHeight: '1.5',
                      textAlign: 'left',
                      marginBottom: '32px',
                    }}
                  >
                    You've just finished the recipe. Thanks for cooking with Jamie — hope you enjoyed every step.
                  </p>
                  <button
                    onClick={() => {
                      setShowCompletionModal(false);
                      onClose();
                      if (onExploreRecipes) {
                        onExploreRecipes();
                      }
                    }}
                    className="w-full inline-flex items-center justify-between text-white font-semibold uppercase rounded-full transition-opacity"
                    style={{
                      height: '50px',
                      padding: '9px 14px 9px 24px',
                      borderRadius: '24px',
                      backgroundColor: '#3D6A6C',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.9';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                  >
                    <span>EXPLORE MORE RECIPES</span>
                    <span
                      className="inline-flex items-center justify-center"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '9px',
                        background: '#29514F',
                      }}
                    >
                      <ArrowRight className="size-4" />
                    </span>
                  </button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
