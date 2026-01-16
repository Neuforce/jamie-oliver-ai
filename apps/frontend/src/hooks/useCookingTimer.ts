/**
 * Custom hook for managing cooking timers.
 * 
 * Handles:
 * - Kitchen timer countdown
 * - Timer controls (start, pause, reset, adjust)
 * - Multiple active timers from backend (parallel cooking)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ActiveTimer } from '../components/TimerPanel';

interface UseCookingTimerOptions {
  defaultMinutes?: number;
  onTimerComplete?: () => void;
}

interface UseCookingTimerReturn {
  // Timer state
  timerSeconds: number;
  timerRunning: boolean;
  timerMinutes: number;
  
  // Active timers (from backend)
  activeTimers: ActiveTimer[];
  setActiveTimers: (timers: ActiveTimer[]) => void;
  
  // Timer controls
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  addMinute: () => void;
  subtractMinute: () => void;
  
  // Backend timer control
  applyBackendTimerControl: (action: string, payload?: { seconds?: number }) => void;
  
  // Set timer from step duration
  setTimerFromDuration: (durationSeconds: number) => void;
  
  // Utility
  formatTime: (seconds: number) => string;
}

export function useCookingTimer(options: UseCookingTimerOptions = {}): UseCookingTimerReturn {
  const { defaultMinutes = 10, onTimerComplete } = options;
  
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(defaultMinutes);
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  
  // Track if we've already called onTimerComplete for this countdown
  const completedRef = useRef(false);

  // Countdown effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (timerRunning && timerSeconds > 0) {
      completedRef.current = false;
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setTimerRunning(false);
            if (!completedRef.current && onTimerComplete) {
              completedRef.current = true;
              onTimerComplete();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds, onTimerComplete]);

  const startTimer = useCallback(() => {
    if (timerSeconds === 0) {
      setTimerSeconds(timerMinutes * 60);
    }
    setTimerRunning(true);
  }, [timerSeconds, timerMinutes]);

  const pauseTimer = useCallback(() => {
    setTimerRunning(false);
  }, []);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setTimerSeconds(timerMinutes * 60);
  }, [timerMinutes]);

  const addMinute = useCallback(() => {
    setTimerSeconds(prev => prev + 60);
  }, []);

  const subtractMinute = useCallback(() => {
    setTimerSeconds(prev => Math.max(0, prev - 60));
  }, []);

  const setTimerFromDuration = useCallback((durationSeconds: number) => {
    if (durationSeconds > 0) {
      setTimerSeconds(durationSeconds);
      setTimerMinutes(Math.max(1, Math.round(durationSeconds / 60)));
      setTimerRunning(false);
    }
  }, []);

  const applyBackendTimerControl = useCallback(
    (action: string, payload?: { seconds?: number }) => {
      const parsedSeconds =
        typeof payload?.seconds === 'number'
          ? Math.max(0, Math.round(payload.seconds))
          : null;

      if (action === 'timer_start' || action === 'timer_resume') {
        setTimerSeconds((prev) => 
          parsedSeconds !== null ? parsedSeconds : (prev > 0 ? prev : timerMinutes * 60)
        );
        setTimerRunning(true);
        return;
      }

      if (action === 'timer_pause') {
        setTimerRunning(false);
        return;
      }

      if (action === 'timer_reset') {
        setTimerRunning(false);
        setTimerSeconds(parsedSeconds ?? timerMinutes * 60);
      }
    },
    [timerMinutes]
  );

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    timerSeconds,
    timerRunning,
    timerMinutes,
    activeTimers,
    setActiveTimers,
    startTimer,
    pauseTimer,
    resetTimer,
    addMinute,
    subtractMinute,
    applyBackendTimerControl,
    setTimerFromDuration,
    formatTime,
  };
}
