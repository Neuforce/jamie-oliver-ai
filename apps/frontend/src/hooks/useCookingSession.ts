/**
 * Custom hook for managing cooking session state.
 * 
 * NOTE: This hook is currently UNUSED. The session management logic is 
 * implemented directly in CookWithJamie.tsx. This hook exists as a potential 
 * refactoring target to consolidate session management into a reusable hook.
 * 
 * Before using this hook, consider:
 * 1. It doesn't include the `hasUserInteracted` flag for preventing ghost sessions
 * 2. It doesn't validate recipe ID from backend state
 * 3. The CookWithJamie component has more complex timer restoration logic
 * 
 * Handles:
 * - Step navigation and completion
 * - Session persistence to localStorage
 * - Syncing with backend recipe state
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Recipe } from '../data/recipes';
import type { RecipeState } from './useWebSocket';

interface UseCookingSessionOptions {
  recipe: Recipe | null;
  onSessionRestored?: (session: SavedSession) => void;
}

interface SavedSession {
  recipeId: number;
  currentStep: number;
  completedSteps: number[];
  timerSeconds: number;
  timerRunning: boolean;
  timestamp: number;
  timerEndTime: number | null;
}

interface UseCookingSessionReturn {
  // Step state
  currentStep: number;
  setCurrentStep: (step: number | ((prev: number) => number)) => void;
  completedSteps: number[];
  setCompletedSteps: (steps: number[] | ((prev: number[]) => number[])) => void;
  
  // Derived state
  totalSteps: number;
  progress: number;
  isCurrentStepCompleted: boolean;
  isLastStep: boolean;
  
  // Instructions
  instructions: string[];
  
  // Step ID mapping
  stepIdToIndex: Map<string, number>;
  
  // Navigation
  handleNext: () => void;
  handlePrevious: () => void;
  toggleStepComplete: () => void;
  
  // Backend sync
  syncRecipeStateFromBackend: (state: RecipeState) => void;
  
  // Session management
  saveSession: (timerSeconds: number, timerRunning: boolean) => void;
  clearSession: () => void;
  
  // Refs
  currentStepRef: React.RefObject<number>;
}

const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useCookingSession(options: UseCookingSessionOptions): UseCookingSessionReturn {
  const { recipe, onSessionRestored } = options;
  
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const currentStepRef = useRef(0);

  // Keep ref in sync
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  // Compute instructions from recipe
  const instructions = useMemo(() => {
    if (!recipe) return [];
    if (recipe.backendSteps?.length) {
      return recipe.backendSteps.map((step) => step.instructions);
    }
    return recipe.instructions;
  }, [recipe]);

  // Step ID to index mapping
  const stepIdToIndex = useMemo(() => {
    if (!recipe?.backendSteps?.length) {
      return new Map<string, number>();
    }
    return recipe.backendSteps.reduce<Map<string, number>>((map, step, index) => {
      map.set(step.id, index);
      return map;
    }, new Map<string, number>());
  }, [recipe]);

  // Derived state
  const totalSteps = instructions.length;
  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const isCurrentStepCompleted = completedSteps.includes(currentStep);
  const isLastStep = currentStep === totalSteps - 1;

  // Load saved session on mount
  useEffect(() => {
    if (!recipe) return;
    
    const savedSession = localStorage.getItem(`cooking-session-${recipe.id}`);
    if (savedSession) {
      try {
        const session: SavedSession = JSON.parse(savedSession);
        const now = Date.now();
        const sessionAge = now - session.timestamp;

        if (sessionAge < SESSION_EXPIRY_MS) {
          setCurrentStep(session.currentStep);
          setCompletedSteps(session.completedSteps);
          onSessionRestored?.(session);
        } else {
          localStorage.removeItem(`cooking-session-${recipe.id}`);
        }
      } catch (e) {
        console.error('Failed to parse saved session:', e);
        localStorage.removeItem(`cooking-session-${recipe.id}`);
      }
    }
  }, [recipe, onSessionRestored]);

  // Navigation handlers
  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep, totalSteps]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const toggleStepComplete = useCallback(() => {
    if (completedSteps.includes(currentStep)) {
      setCompletedSteps(completedSteps.filter(s => s !== currentStep));
    } else {
      setCompletedSteps([...completedSteps, currentStep]);
    }
  }, [completedSteps, currentStep]);

  // Sync from backend
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
    } else if (Array.isArray(state.completed_steps)) {
      const completedIndices = state.completed_steps
        .map(step => {
          if (typeof step === 'number') return step;
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
  }, [instructions, recipe, stepIdToIndex]);

  // Session persistence
  const saveSession = useCallback((timerSeconds: number, timerRunning: boolean) => {
    if (!recipe) return;
    
    const hasProgress = currentStep > 0 || completedSteps.length > 0 || timerRunning || timerSeconds > 0;
    
    if (hasProgress) {
      const session: SavedSession = {
        recipeId: recipe.id,
        currentStep,
        completedSteps,
        timerSeconds,
        timerRunning,
        timestamp: Date.now(),
        timerEndTime: timerRunning ? Date.now() + timerSeconds * 1000 : null
      };
      localStorage.setItem(`cooking-session-${recipe.id}`, JSON.stringify(session));
    }
  }, [recipe, currentStep, completedSteps]);

  const clearSession = useCallback(() => {
    if (recipe) {
      localStorage.removeItem(`cooking-session-${recipe.id}`);
    }
  }, [recipe]);

  return {
    currentStep,
    setCurrentStep,
    completedSteps,
    setCompletedSteps,
    totalSteps,
    progress,
    isCurrentStepCompleted,
    isLastStep,
    instructions,
    stepIdToIndex,
    handleNext,
    handlePrevious,
    toggleStepComplete,
    syncRecipeStateFromBackend,
    saveSession,
    clearSession,
    currentStepRef,
  };
}
