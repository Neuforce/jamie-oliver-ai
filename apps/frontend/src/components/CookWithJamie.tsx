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
  Info,
  Save,
  Trash2,
  MicOff
} from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
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
import { useWebSocket, type RecipeState } from '../hooks/useWebSocket';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAudioPlayback } from '../hooks/useAudioPlayback';

interface CookWithJamieProps {
  recipe: Recipe | null;
  onClose: () => void;
}

export function CookWithJamie({ recipe, onClose }: CookWithJamieProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([] as number[]);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  
  // Timer states
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(10); // Default timer
  
  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef(null as any);
  const [showTimerInfoBanner, setShowTimerInfoBanner] = useState(false);
  
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

  const parseIsoDurationToSeconds = useCallback((duration?: string | null) => {
    if (!duration) return 0;
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
      const parsedSeconds =
        typeof payload?.seconds === 'number'
          ? Math.max(0, Math.round(payload.seconds))
          : null;

      if (action === 'timer_start' || action === 'timer_resume') {
        setTimerSeconds((prev) => {
          if (parsedSeconds !== null) {
            return parsedSeconds;
          }
          if (prev > 0) {
            return prev;
          }
          return timerMinutes * 60;
        });
        setTimerRunning(true);
        setShowTimerInfoBanner(true);
        return;
      }

      if (action === 'timer_pause') {
        setTimerRunning(false);
        return;
      }

      if (action === 'timer_reset') {
        setTimerRunning(false);
        setTimerSeconds(parsedSeconds ?? timerMinutes * 60);
        setShowTimerInfoBanner(false);
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

  const handleControl = useCallback(
    (action: string, data?: any) => {
      if (action === 'clear') {
        audioPlayback.stopAllAudio();
        return;
      }

      if (action?.startsWith('timer_')) {
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
      setShowTimerInfoBanner(false);
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
          // Automatically restore session without toast - user already clicked "Continue Cooking"
          setCurrentStep(session.currentStep);
          setCompletedSteps(session.completedSteps);
          
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

  // Save session periodically
  useEffect(() => {
    if (recipe) {
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
        console.log('Saving session to localStorage:', session);
        localStorage.setItem(`cooking-session-${recipe.id}`, JSON.stringify(session));
      }
    }
  }, [currentStep, completedSteps, timerSeconds, timerRunning, recipe]);

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
            // Timer finished - could add sound/notification
            speakText("Time's up! Your timer is done.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds]);

  // Show helpful banner when timer starts running (first time in session)
  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      // Check if user has seen this tip before
      const hasSeenTimerTip = localStorage.getItem('has-seen-timer-tip');
      if (!hasSeenTimerTip) {
        setShowTimerInfoBanner(true);
        localStorage.setItem('has-seen-timer-tip', 'true');
        
        // Auto-hide after 8 seconds
        setTimeout(() => {
          setShowTimerInfoBanner(false);
        }, 8000);
      }
    }
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

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const toggleStepComplete = () => {
    if (completedSteps.includes(currentStep)) {
      setCompletedSteps(completedSteps.filter(s => s !== currentStep));
    } else {
      setCompletedSteps([...completedSteps, currentStep]);
    }
  };

  const startTimer = () => {
    if (timerSeconds === 0) {
      setTimerSeconds(timerMinutes * 60);
    }
    setTimerRunning(true);
  };

  const pauseTimer = () => {
    setTimerRunning(false);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(timerMinutes * 60);
  };

  const addMinute = () => {
    setTimerSeconds(prev => prev + 60);
  };

  const subtractMinute = () => {
    setTimerSeconds(prev => Math.max(0, prev - 60));
  };

  const [shouldShowTimer, setShouldShowTimer] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    setShouldShowTimer(timerSeconds > 0 || timerRunning);
  }, [timerSeconds, timerRunning]);

  const handleExitClick = () => {
    console.log('Exit clicked - currentStep:', currentStep, 'completedSteps:', completedSteps, 'timerRunning:', timerRunning, 'timerSeconds:', timerSeconds);
    
    // Check if there's any progress: moved from step 0, completed steps, or has active/running timer
    const hasProgress = currentStep > 0 || 
                       completedSteps.length > 0 || 
                       timerRunning || 
                       timerSeconds > 0;
    
    if (!hasProgress) {
      console.log('No progress, exiting directly');
      onClose();
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
    toast.info('Sesión eliminada', {
      description: 'Tu progreso no se ha guardado'
    });
    setShowExitConfirmation(false);
    onClose();
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
  };

  const handleExitKeepTimerActive = () => {
    console.log('Exit keeping timer active');
    // Session is already being saved automatically - no toast needed
    setShowExitConfirmation(false);
    // Don't disconnect WebSocket or stop audio - keep them running
    onClose();
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
    
    // Send finish message to WebSocket if connected
    if (isWebSocketConnected) {
      wsSendMessage({
        event: 'text',
        message: 'I finished the recipe',
      });
    }
    
    toast.success('Recipe completed!', {
      description: `Great job completing ${recipe.title}!`,
      duration: 3000
    });
    
    // Cleanup WebSocket and audio
    audioCapture.stopCapture();
    audioPlayback.cleanup();
    wsDisconnect();
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Header Image - Full Width */}
      <div className="relative h-[40vh] min-h-[280px] overflow-hidden">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-full object-cover"
        />
        
        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
        
        {/* Back Button - Minimalist */}
        <button
          onClick={handleExitClick}
          className="absolute top-6 left-6 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all"
        >
          <ArrowLeft className="size-5 text-white" />
        </button>

        {/* Header Content - Over image */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pb-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-[#0A7E6C]/90 backdrop-blur-sm">
              <div className="size-6 rounded-full bg-white/20 overflow-hidden flex items-center justify-center">
                <img 
                  src="https://images.unsplash.com/photo-1759521296047-89338c8e083d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqYW1pZSUyMG9saXZlciUyMGNoZWYlMjBwb3J0cmFpdHxlbnwxfHx8fDE3NjU1NTY4MjF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" 
                  alt="Jamie"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-white/90 text-sm">Cooking with Jamie</span>
            </div>
            <h1 className="text-white text-4xl mb-3">{recipe.title}</h1>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <span>Step {currentStep + 1} of {totalSteps}</span>
              <span className="text-white/40">•</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar - Minimal */}
      <div className="h-1 bg-black/5">
        <div 
          className="h-full bg-gradient-to-r from-[#0A7E6C] to-[#81EB67] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

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
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="p-6">
        {/* Timer Info Banner */}
        <AnimatePresence>
          {showTimerInfoBanner && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="mb-6"
            >
              <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50">
                <div className="flex items-start gap-3">
                  <Info className="size-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <AlertTitle className="text-green-900 dark:text-green-100 mb-1">
                      💡 Tip: Your session continues in the background
                    </AlertTitle>
                    <AlertDescription className="text-green-800 dark:text-green-200 text-sm">
                      You can freely exit to view other recipes. Your progress and timer are automatically saved and continue running.
                    </AlertDescription>
                  </div>
                  <button
                    onClick={() => setShowTimerInfoBanner(false)}
                    className="p-1 hover:bg-green-100 dark:hover:bg-green-900/50 rounded transition-colors flex-shrink-0"
                    aria-label="Close"
                  >
                    <X className="size-4 text-green-600 dark:text-green-400" />
                  </button>
                </div>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>


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
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-[#0A7E6C]/10">
                  <span className="text-sm text-[#0A7E6C]">Step {currentStep + 1} of {totalSteps}</span>
                </div>
                <p className="text-2xl leading-relaxed text-foreground">{instructions[currentStep]}</p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Mark Complete */}
          <Button
            onClick={toggleStepComplete}
            variant={completedSteps.includes(currentStep) ? "default" : "outline"}
            size="lg"
            className={`gap-2 mb-8 ${
              completedSteps.includes(currentStep) ? 'bg-[#81EB67] hover:bg-[#81EB67]/90 text-white' : ''
            }`}
          >
            <CheckCircle2 className="size-5" />
            {completedSteps.includes(currentStep) ? "Completed" : "Mark complete"}
          </Button>

          {/* Step Indicators - Minimal */}
          <div className="flex justify-center gap-2 mb-8">
            {instructions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`h-1 rounded-full transition-all ${
                  idx === currentStep
                    ? 'bg-[#0A7E6C] w-12'
                    : completedSteps.includes(idx)
                    ? 'bg-[#81EB67] w-8'
                    : 'bg-muted-foreground/20 w-8'
                }`}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          {/* Navigation Buttons - Clean */}
          <div className="flex items-center justify-between gap-4">
            <Button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              variant="ghost"
              size="lg"
              className="gap-2"
            >
              <ChevronLeft className="size-5" />
              Previous
            </Button>

            {currentStep === totalSteps - 1 ? (
              <Button 
                onClick={handleFinishCooking} 
                size="lg" 
                className="gap-2 bg-[#0A7E6C] hover:bg-[#0A7E6C]/90"
              >
                Finish Cooking
                <CheckCircle2 className="size-5" />
              </Button>
            ) : (
              <Button 
                onClick={handleNext} 
                size="lg"
                className="gap-2 bg-[#0A7E6C] hover:bg-[#0A7E6C]/90"
              >
                Next Step
                <ChevronRight className="size-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons - Right side at bottom */}
      <div className="fixed bottom-6 right-6 flex items-center gap-3 z-40">
        {/* Voice Button - Controls mic mute/unmute */}
        <Button
          onClick={toggleVoiceListening}
          size="lg"
          className={`size-14 rounded-full shadow-lg ${
            !isMicMuted && isWebSocketConnected ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''
          } ${!isWebSocketConnected ? 'bg-yellow-500 hover:bg-yellow-600' : ''}`}
          variant={!isMicMuted && isWebSocketConnected ? "default" : "secondary"}
          disabled={isWebSocketConnecting}
          title={
            !isWebSocketConnected 
              ? `WebSocket not connected - ${wsError || 'Click to reconnect'}`
              : isWebSocketConnecting
                ? 'Connecting to backend...'
                : isMicMuted 
                  ? 'Microphone muted - Click to unmute (text mode)' 
                  : 'Microphone active - Click to mute (audio mode)'
          }
        >
          {!isWebSocketConnected ? (
            <MicOff className="size-6" />
          ) : isMicMuted ? (
            <MicOff className="size-6" />
          ) : (
            <Mic className="size-6" />
          )}
        </Button>
      </div>


      {/* Completion Celebration */}
      {currentStep === totalSteps - 1 && completedSteps.length === totalSteps && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-6"
        >
          <div className="text-center text-white p-8 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 max-w-md">
            <CheckCircle2 className="size-24 mx-auto mb-4" />
            <h2 className="text-white mb-4">Brilliant! You Did It!</h2>
            <p className="text-white/90 mb-6">
              Your {recipe.title} is ready to serve. Enjoy your delicious creation!
            </p>
            <Button onClick={onClose} size="lg" className="bg-white text-green-600 hover:bg-white/90">
              Close
            </Button>
          </div>
        </motion.div>
      )}

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {timerRunning && timerSeconds > 0 
                ? `Active timer: ${formatTime(timerSeconds)}` 
                : 'Exit?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your progress will be saved automatically
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowExitConfirmation(false)}>
              Keep cooking
            </AlertDialogCancel>
            
            {timerRunning && timerSeconds > 0 ? (
              <>
                <Button 
                  onClick={handleSaveAndExit}
                  variant="outline"
                >
                  Pause timer
                </Button>
                <Button 
                  onClick={handleExitKeepTimerActive}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Keep active
                </Button>
              </>
            ) : (
              <Button 
                onClick={handleSaveAndExit}
              >
                Save & exit
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}