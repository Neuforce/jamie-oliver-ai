import React, { useState, useRef, useEffect } from 'react';
import { Recipe } from '../data/recipes';
import { RecipeCarousel } from './RecipeCarousel';
import { ArrowUp } from 'lucide-react';
import { motion } from 'motion/react';
// @ts-expect-error - Vite resolves figma:asset imports via alias configuration
import imgImage11 from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';
// @ts-expect-error - Vite resolves figma:asset imports via alias configuration
import imgJamieAvatar from 'figma:asset/dbe757ff22db65b8c6e8255fc28d6a6a29240332.png';
import { searchRecipes } from '../lib/api';
import { transformRecipeMatch, loadRecipeFromLocal } from '../data/recipeTransformer';
import type { RecipeMatchResponse } from '../lib/api';
import type { JamieOliverRecipe } from '../data/recipeTransformer';

interface Message {
  id: string;
  type: 'user' | 'jamie';
  content: string;
  recipes?: Recipe[];
  timestamp: Date;
}

interface ChatWithJamieProps {
  onClose: () => void;
  onRecipeClick: (recipe: Recipe) => void;
  initialMessage?: string;
  onRecipesClick?: () => void;
}

const CHAT_STORAGE_KEY = 'jamie-oliver-chat-messages';

// Export function to clear chat history (used when recipe is completed)
export const clearChatHistory = () => {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing chat history:', error);
  }
};

// Helper function to load messages from localStorage
const loadMessagesFromStorage = (): Message[] => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert timestamp strings back to Date objects
      return parsed.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
    }
  } catch (error) {
    console.error('Error loading chat messages from storage:', error);
  }
  // Return default initial message if nothing is stored
  return [
    {
      id: '1',
      type: 'jamie' as const,
      content: "Hi - I'm jAImie, Jamie Oliver's AI cooking companion. I'll walk or talk you through recipes step-by-step. What are you in the mood for?",
      timestamp: new Date(),
    },
  ];
};

// Helper function to save messages to localStorage
const saveMessagesToStorage = (messages: Message[]) => {
  try {
    // Convert Date objects to ISO strings for storage
    const serializable = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
    }));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('Error saving chat messages to storage:', error);
  }
};

// Helper function to ensure recipe has full payload before passing to RecipeModal
const ensureRecipeHasPayload = async (recipe: Recipe): Promise<Recipe> => {
  // If recipe already has rawRecipePayload, return as-is
  if (recipe.rawRecipePayload && recipe.backendId) {
    return recipe;
  }

  // If no backendId, can't load the recipe
  if (!recipe.backendId) {
    console.warn('Recipe missing backendId, cannot load full payload:', recipe.id);
    return recipe;
  }

  // Load full recipe from local JSON files
  try {
    const fullRecipe = await loadRecipeFromLocal(recipe.backendId);
    if (!fullRecipe) {
      console.warn(`Could not load recipe ${recipe.backendId} from local files`);
      return recipe;
    }

    // Transform to get complete recipe with rawRecipePayload
    const transformed = transformRecipeMatch(
      {
        recipe_id: recipe.backendId,
        title: recipe.title,
        similarity_score: 1,
        combined_score: 1,
        file_path: '',
        match_explanation: '',
        matching_chunks: [],
      },
      fullRecipe,
      recipe.id - 1 // Use existing numeric ID
    );

    return transformed;
  } catch (error) {
    console.error(`Error loading full recipe for ${recipe.backendId}:`, error);
    return recipe;
  }
};

export function ChatWithJamie({ onClose, onRecipeClick, initialMessage, onRecipesClick }: ChatWithJamieProps) {
  const [messages, setMessages] = useState<Message[]>(loadMessagesFromStorage);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState(null as string | null);
  const [displayedThinkingText, setDisplayedThinkingText] = useState('');
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [error, setError] = useState(null as string | null);
  const messagesEndRef = useRef(null as HTMLDivElement | null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Save messages to localStorage whenever they change
  useEffect(() => {
    saveMessagesToStorage(messages);
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);
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

  // Auto-focus input when component mounts
  useEffect(() => {
    // Small delay to ensure the modal animation completes
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Auto-send initial message if provided
  useEffect(() => {
    if (initialMessage && initialMessage.trim()) {
      // Set input value and send message after a short delay
      setInputValue(initialMessage);
      const timer = setTimeout(async () => {
        // Create user message
        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          content: initialMessage,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsTyping(true);
        setError(null);
        setThinkingStatus("looking through my recipes...");
        setLoadingRecipes(true);

        try {
          // Call semantic search API
          const searchResponse = await searchRecipes(initialMessage, {
            include_full_recipe: true,
            top_k: 10,
            include_chunks: false,
            similarity_threshold: 0.7,
          });

          setThinkingStatus(null);
          setLoadingRecipes(false);

          if (searchResponse.results.length === 0) {
            const noResultsMessage: Message = {
              id: (Date.now() + 1).toString(),
              type: 'jamie',
              content: "I couldn't find any recipes matching your search. Try describing what you're looking for in a different way!",
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, noResultsMessage]);
            setIsTyping(false);
            return;
          }

          // Transform all recipe matches to Recipe format
          const transformedRecipes: Recipe[] = [];

          for (let i = 0; i < searchResponse.results.length; i++) {
            const match = searchResponse.results[i];

            try {
              let fullRecipe;

              // Check if full_recipe is available in the response
              if (match.full_recipe) {
                fullRecipe = match.full_recipe as unknown as JamieOliverRecipe;
              } else {
                // Fallback: load from local JSON files
                const localRecipe = await loadRecipeFromLocal(match.recipe_id);
                if (!localRecipe) {
                  console.warn(`Could not load recipe ${match.recipe_id} from local files`);
                  continue;
                }
                fullRecipe = localRecipe;
              }

              const transformed = transformRecipeMatch(match, fullRecipe, i);
              transformedRecipes.push(transformed);
            } catch (error) {
              console.error(`Error transforming recipe ${match.recipe_id}:`, error);
              // Continue with other recipes
            }
          }

          if (transformedRecipes.length === 0) {
            // All recipes failed to transform
            const errorMessage: Message = {
              id: (Date.now() + 1).toString(),
              type: 'jamie',
              content: "I found some recipes, but there was an error loading them. Please try again!",
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
            setIsTyping(false);
            return;
          }

          // Add message with recipes
          const jamieMessage: Message = {
            id: (Date.now() + 2).toString(),
            type: 'jamie',
            content: `I found ${transformedRecipes.length} recipe${transformedRecipes.length > 1 ? 's' : ''} for you!`,
            recipes: transformedRecipes,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, jamieMessage]);
          setIsTyping(false);
        } catch (err) {
          console.error('Error searching recipes:', err);
          setError('Failed to search recipes. Please try again.');
          setThinkingStatus(null);
          setLoadingRecipes(false);
          setIsTyping(false);

          const errorMessage: Message = {
            id: (Date.now() + 3).toString(),
            type: 'jamie',
            content: "Sorry, I encountered an error while looking through my recipes. Please try again!",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMessage]);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [initialMessage]);

  // Animate thinking status text letter by letter
  useEffect(() => {
    if (thinkingStatus) {
      setDisplayedThinkingText('');
      let currentIndex = 0;

      const typeInterval = setInterval(() => {
        if (currentIndex < thinkingStatus.length) {
          setDisplayedThinkingText(thinkingStatus.substring(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(typeInterval);
        }
      }, 50); // 50ms per character for smooth typing effect

      return () => clearInterval(typeInterval);
    } else {
      setDisplayedThinkingText('');
    }
  }, [thinkingStatus]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    const savedInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    setError(null);
    setThinkingStatus("looking through my recipes...");
    setLoadingRecipes(true);

    try {
      // Call semantic search API
      const searchResponse = await searchRecipes(savedInput, {
        include_full_recipe: true,
        top_k: 10,
        include_chunks: false,
        similarity_threshold: 0.7, // Umbral mínimo de similitud (0.0-1.0). Solo retorna resultados con score >= threshold
      });

      setThinkingStatus(null);
      setLoadingRecipes(false);

      if (searchResponse.results.length === 0) {
        // No results found
        const noResultsMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'jamie',
          content: "I couldn't find any recipes matching your search. Try describing what you're looking for in a different way!",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, noResultsMessage]);
        setIsTyping(false);
        return;
      }

      // Transform all recipe matches to Recipe format
      const transformedRecipes: Recipe[] = [];

      for (let i = 0; i < searchResponse.results.length; i++) {
        const match = searchResponse.results[i];

        try {
          let fullRecipe;

          // Check if full_recipe is available in the response
          if (match.full_recipe) {
            fullRecipe = match.full_recipe as unknown as JamieOliverRecipe;
        } else {
            // Fallback: load from local JSON files
            const localRecipe = await loadRecipeFromLocal(match.recipe_id);
            if (!localRecipe) {
              console.warn(`Could not load recipe ${match.recipe_id} from local files`);
              continue;
            }
            fullRecipe = localRecipe;
          }

          const transformed = transformRecipeMatch(match, fullRecipe, i);
          transformedRecipes.push(transformed);
        } catch (error) {
          console.error(`Error transforming recipe ${match.recipe_id}:`, error);
          // Continue with other recipes
        }
      }
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

      if (transformedRecipes.length === 0) {
        // All recipes failed to transform
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'jamie',
          content: "I found some recipes, but there was an error loading them. Please try again!",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsTyping(false);
        return;
      }

      // Add message with recipes (no text content, just recipes)
          const jamieMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'jamie',
        content: '', // No text content, only recipes
        recipes: transformedRecipes,
            timestamp: new Date(),
          };

          setMessages(prev => [...prev, jamieMessage]);
      setIsTyping(false);
    } catch (error) {
      console.error('Error searching recipes:', error);
      setThinkingStatus(null);
              setLoadingRecipes(false);
      setError(error instanceof Error ? error.message : 'An error occurred while looking through my recipes');

      // Show error message to user
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'jamie',
        content: error instanceof Error && error.message.includes('connect')
          ? "I'm having trouble connecting to the recipe search service. Please make sure the backend is running and try again!"
          : "Sorry, something went wrong while looking through my recipes. Please try again!",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
            setIsTyping(false);
          }
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

  const handleKeyPress = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1] // Custom easing for smooth spring-like motion
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
      className="fixed inset-0 bg-white z-50 flex flex-col"
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
          <div
            className="flex items-center justify-center"
            style={{
              height: 'clamp(20px, calc(100vw * 24 / 390), 24px)',
              maxWidth: '171.75px'
            }}
          >
            <img
              alt="Jamie Oliver"
              className="h-full w-auto object-contain pointer-events-none"
              src={imgImage11}
              style={{ maxWidth: '100%' }}
            />
        </div>

        {/* Recipes Button */}
          <div className="flex items-center justify-end">
        <button
          type="button"
              onClick={() => {
                onClose();
                onRecipesClick?.();
              }}
              className="z-10 inline-flex items-center justify-center"
          style={{
            padding: 0,
            background: '#FFFFFF',
            borderRadius: '999px',
            width: '48px',
            height: '48px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
            border: '1px solid rgba(232,235,237,0.8)',
          }}
        >
          <img
            src="/assets/Recipes.svg"
            alt="Recipes"
            style={{ width: '24px', height: '24px', display: 'block' }}
          />
        </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-[20px] py-4">
        <div className="max-w-[350px] mx-auto space-y-4">
          {messages.map((message, index) => (
            <div key={message.id}>
              {/* Separator */}
              {index > 0 && (
                <div className="h-px w-full bg-black/5 my-4" />
              )}

              {message.type === 'jamie' ? (
                message.content && (
                <div className="flex gap-4 items-start">
                  {/* Avatar */}
                  <div className="relative shrink-0 size-[31.875px]">
                    <img alt="" className="block size-full rounded-full" src={imgJamieAvatar} />
                  </div>

                  {/* Message Content */}
                  <p className="flex-1 font-['Work_Sans',sans-serif] leading-[1.5] text-[#2c2c2c] text-base whitespace-pre-wrap">
                    {message.content}
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
                )
              ) : (
                <div className="bg-[#f5f5f5] rounded-[16px] p-4">
                  <p className="font-['Work_Sans',sans-serif] leading-[24px] text-[#090909] text-base">
                    {message.content}
                  </p>
                </div>
              )}

              {/* Recipe Carousel */}
              {message.recipes && message.recipes.length > 0 && (
                <div className="mt-4">
                  <RecipeCarousel
                    recipes={message.recipes}
                    onRecipeClick={async (recipe) => {
                      // Ensure recipe has full payload before passing to RecipeModal
                      const completeRecipe = await ensureRecipeHasPayload(recipe);
                      onRecipeClick(completeRecipe);
                      onClose();
                    }}
                    singleSlide={true}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator with Contextual Status */}
          {isTyping && thinkingStatus && (
            <>
              <div className="h-px w-full bg-black/5 my-4" />
              <div className="flex gap-4 items-start">
                <div className="relative shrink-0 size-[31.875px]">
                  <img alt="" className="block size-full rounded-full" src={imgJamieAvatar} />
                </div>
                <div className="flex items-center gap-0 pt-1">
                  {/* Status text with blinking cursor */}
                  <span className="text-sm font-['Work_Sans',sans-serif] text-[#2c2c2c] italic">
                    {displayedThinkingText}
                  </span>
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="text-sm font-['Work_Sans',sans-serif] text-[#2c2c2c] ml-0.5"
                  >
                    |
                  </motion.span>
                </div>
              </div>
            </>
          )}

          {/* Loading Recipes Card with Spinner */}
          {loadingRecipes && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-white rounded-2xl border border-black/5 shadow-sm p-8"
            >
              <div className="flex items-center justify-center">
                <div className="relative">
                  {/* Small spinning ring */}
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="size-6 rounded-full border-2 border-[#46BEA8]/20 border-t-[#46BEA8]"
                  />
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
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input - Fixed at bottom */}
      <div className="px-[20px] py-3 shrink-0">
        <div className="max-w-[350px] mx-auto">
          <div className="bg-white relative rounded-[32px] border border-black/10 shadow-[0px_2px_5px_0px_rgba(0,0,0,0.06),0px_9px_9px_0px_rgba(0,0,0,0.01)]">
            <div className="flex items-center gap-5 p-3">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask your question…"
                className="flex-1 font-['Inter',sans-serif] text-base leading-[24px] text-[#8e8e93] placeholder:text-[#8e8e93] bg-transparent outline-none"
              />

              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className={`shrink-0 size-9 rounded-full flex items-center justify-center transition-colors ${
                  inputValue.trim()
                    ? 'bg-[#46BEA8] hover:bg-[#327179]'
                    : 'bg-[#b4b4b4]'
                }`}
              >
                <ArrowUp className="size-6 text-white" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
