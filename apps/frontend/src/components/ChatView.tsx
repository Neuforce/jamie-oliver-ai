import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Recipe } from '../data/recipes';
import { RecipeCarousel } from './RecipeCarousel';
import { MealPlanCard } from './MealPlanCard';
import { RecipeQuickView } from './RecipeQuickView';
import { ShoppingListCard } from './ShoppingListCard';
import { ArrowUp, ArrowDown, MessageCircle, Square, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OnboardingEmptyState } from './OnboardingEmptyState';
import { ProcessCard, selectFeatured } from './ProcessCard';
import type { ProcessCardState, ProcessStep, ToolName, FeaturedPayload } from './ProcessCardTypes';
import { TOOL_STEP_DISPLAY } from './ProcessCardTypes';
import { JamieHeart } from './JamieHeart';
import { VoiceModeRoller } from './VoiceModeRoller';
import { VoiceFooter } from './VoiceFooter';
import type { RollerMessage, StackRole } from './VoiceModeRoller';
import { VoiceModeButton, StopGenerationButton } from './VoiceModeIndicator';
import { useVoiceChat } from '../hooks/useVoiceChat';
// @ts-expect-error - Vite resolves figma:asset imports
import imgJamieAvatar from 'figma:asset/dbe757ff22db65b8c6e8255fc28d6a6a29240332.png';
import {
  chatWithAgent,
  generateSessionId,
  clearChatSession,
  searchRecipes,
  type MealPlanData,
  type RecipeDetailData,
  type ShoppingListData,
} from '../lib/api';
import { transformRecipeMatch, transformRecipeFromSummary, loadRecipeFromLocal, type BackendRecipeSummary } from '../data/recipeTransformer';
import type { JamieOliverRecipe } from '../data/recipeTransformer';

interface Message {
  id: string;
  type: 'user' | 'jamie';
  content: string;
  recipes?: Recipe[];
  mealPlan?: MealPlanData;
  recipeDetail?: RecipeDetailData;
  shoppingList?: ShoppingListData;
  timestamp: Date;
  isStreaming?: boolean;
  process?: ProcessCardState;
}

interface ChatViewProps {
  initialMessage?: string;
  onRecipeClick: (recipe: Recipe) => void;
  onPromptClick: (prompt: string) => void;
  onClearInitialMessage: () => void;
}

const CHAT_STORAGE_KEY = 'jamie-oliver-chat-messages';
const SESSION_ID_KEY = 'jamie-oliver-chat-session';
const IGNORED_VOICE_TRANSCRIPTS = new Set(['[Connection restored]']);

/** Max width for chat content; matches TabNav for consistent layout (NEU-470). */
const CHAT_CONTENT_MAX_WIDTH = 600;

// Export function to clear chat history (used when recipe is completed)
export const clearChatHistory = async () => {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    const sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (sessionId) {
      try {
        await clearChatSession(sessionId);
      } catch (e) {
        console.warn('Failed to clear backend session:', e);
      }
      localStorage.removeItem(SESSION_ID_KEY);
    }
  } catch (error) {
    console.error('Error clearing chat history:', error);
  }
};


// Helper function to get or create session ID
const getOrCreateSessionId = (): string => {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
};

// Helper function to load messages from localStorage
const loadMessagesFromStorage = (): Message[] => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
        isStreaming: false,
      }));
    }
  } catch (error) {
    console.error('Error loading chat messages from storage:', error);
  }
  return [];
};

/*
 * We used to run a client-side "tool-dominant" policy here that replaced
 * Jamie's actual prose with a generic one-liner ("Here are some great
 * options for you.") whenever a tool was invoked. That, combined with the
 * matching 240-char cap on the backend, silently truncated mid-sentence
 * responses like "...Gourmet Beef Burger - A" and made Jamie look broken.
 *
 * The new rule is simple: whatever the model says, the user sees. The
 * card and tool payloads sit alongside the text, not in place of it.
 */

// Helper function to save messages to localStorage
const saveMessagesToStorage = (messages: Message[]) => {
  try {
    // Don't save streaming messages
    const serializable = messages
      .filter(msg => !msg.isStreaming)
      .map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString(),
      }));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('Error saving chat messages to storage:', error);
  }
};

// Try to extract recipe IDs from agent response for loading
const extractRecipeIds = (text: string): string[] => {
  // Look for patterns like recipe_id: "slug" or **Recipe Name**
  const patterns = [
    /"recipe_id":\s*"([^"]+)"/gi,
    /\*\*([A-Za-z\s-]+)\*\*/g,
  ];

  const ids: string[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      ids.push(match[1].toLowerCase().replace(/\s+/g, '-'));
    }
  }
  return [...new Set(ids)];
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

export function ChatView({
  initialMessage,
  onRecipeClick,
  onPromptClick,
  onClearInitialMessage
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>(loadMessagesFromStorage);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [displayedThinkingText, setDisplayedThinkingText] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Shared session ID for both text and voice chat (ensures unified experience)
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  // Voice mode state
  const voiceMessageRef = useRef<string | null>(null);
  const voiceMessageIdRef = useRef<string | null>(null);
  const voiceResponseAccumulatorRef = useRef<string>('');

  /*
   * Mute toggle for the mic in voice mode. We expose this as a click-target
   * on the Jamie avatar inside the floating voice dock so the user can
   * silence their mic without leaving the conversation (e.g. to say
   * something out loud in the room without Jamie hearing it). The useVoiceChat
   * hook owns the actual MediaStream gating via `setMicMuted`.
   */
  const [isMicMuted, setIsMicMuted] = useState(false);

  const hasMessages = messages.length > 0;

  // Voice chat hook - uses same sessionId as text chat for unified experience
  const {
    state: voiceState,
    isConnected: isVoiceConnected,
    currentTranscript,
    toggleVoiceMode,
    interrupt,
    cancel: cancelVoice,
    disconnect: disconnectVoice,
    isListening,
    isProcessing,
    isSpeaking,
    isActive: isVoiceActive,
    isPausedByVisibility,
    resumeFromVisibility,
    setMicMuted,
  } = useVoiceChat({
    sessionId,  // Share session ID between voice and text chat
    onTranscript: (text, isFinal) => {
      console.log('🎤 Transcript received:', { text, isFinal });

      const normalizedText = text.trim();
      if (IGNORED_VOICE_TRANSCRIPTS.has(normalizedText)) {
        console.warn('Ignoring synthetic voice transcript marker:', normalizedText);
        return;
      }

      if (isFinal && normalizedText) {
        // Create user message from voice transcript
        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          content: normalizedText,
          timestamp: new Date(),
        };

        // Create streaming message placeholder for Jamie's response
        const streamingId = (Date.now() + 1).toString();
        voiceMessageIdRef.current = streamingId;
        voiceResponseAccumulatorRef.current = '';

        console.log('🎤 Created voice message placeholder:', streamingId);

        const streamingMessage: Message = {
          id: streamingId,
          type: 'jamie',
          content: '',
          timestamp: new Date(),
          isStreaming: true,
        };

        setMessages(prev => [...prev, userMessage, streamingMessage]);
        setIsTyping(true);
        setThinkingStatus("Listening...");
      }
    },
    onTextChunk: (text) => {
      // Accumulate voice response text
      voiceResponseAccumulatorRef.current += text;

      console.log('🎤 Text chunk received:', {
        chunk: text.substring(0, 50),
        totalLength: voiceResponseAccumulatorRef.current.length,
        messageId: voiceMessageIdRef.current
      });

      if (voiceMessageIdRef.current) {
        setMessages(prev => prev.map(msg =>
          msg.id === voiceMessageIdRef.current
            ? { ...msg, content: voiceResponseAccumulatorRef.current }
            : msg
        ));
      }

      // Clear thinking status once we get text
      if (thinkingStatus) {
        setThinkingStatus(null);
      }
    },
    onRecipes: (data) => {
      console.log('🎤 Recipes received:', { count: data?.recipes?.length, messageId: voiceMessageIdRef.current });

      // Transform backend recipe summaries to Recipe format for display
      const recipeData = data?.recipes || [];
      const recipes: Recipe[] = recipeData.map((r: BackendRecipeSummary, index: number) =>
        transformRecipeFromSummary(r, index)
      );

      console.log('🎤 Transformed recipes for voice:', recipes.length);

      if (voiceMessageIdRef.current && recipes.length > 0) {
        setMessages(prev => prev.map(msg =>
          msg.id === voiceMessageIdRef.current
            ? { ...msg, recipes }
            : msg
        ));
      }
    },
    onMealPlan: (data) => {
      console.log('🎤 Meal plan received:', { hasData: !!data?.meal_plan, messageId: voiceMessageIdRef.current });

      if (voiceMessageIdRef.current && data?.meal_plan) {
        setMessages(prev => prev.map(msg =>
          msg.id === voiceMessageIdRef.current
            ? { ...msg, mealPlan: data.meal_plan }
            : msg
        ));
      }
    },
    onRecipeDetail: (data) => {
      console.log('🎤 Recipe detail received:', { hasData: !!data?.recipe, messageId: voiceMessageIdRef.current });

      if (voiceMessageIdRef.current && data?.recipe) {
        setMessages(prev => prev.map(msg =>
          msg.id === voiceMessageIdRef.current
            ? { ...msg, recipeDetail: data.recipe }
            : msg
        ));
      }
    },
    onShoppingList: (data) => {
      console.log('🎤 Shopping list received:', { hasData: !!data?.shopping_list, messageId: voiceMessageIdRef.current });

      if (voiceMessageIdRef.current && data?.shopping_list) {
        setMessages(prev => prev.map(msg =>
          msg.id === voiceMessageIdRef.current
            ? { ...msg, shoppingList: data.shopping_list }
            : msg
        ));
      }
    },
    onDone: () => {
      // Finalize the voice message
      if (voiceMessageIdRef.current) {
        const messageId = voiceMessageIdRef.current;
        const accumulatedText = voiceResponseAccumulatorRef.current;

        console.log('🎤 Voice response done:', { messageId, textLength: accumulatedText.length });

        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId) {
            const content =
              msg.content ||
              accumulatedText ||
              "I'm here to help! What would you like to cook today?";
            return { ...msg, content, isStreaming: false };
          }
          return msg;
        }));
      }
      voiceMessageIdRef.current = null;
      voiceResponseAccumulatorRef.current = '';
      setIsTyping(false);
      setThinkingStatus(null);
    },
    onError: (error) => {
      console.error('Voice chat error:', error);
      if (voiceMessageIdRef.current) {
        setMessages(prev => prev.map(msg =>
          msg.id === voiceMessageIdRef.current
            ? { ...msg, content: "Sorry, I had trouble hearing you. Please try again!", isStreaming: false }
            : msg
        ));
      }
      voiceMessageIdRef.current = null;
      voiceResponseAccumulatorRef.current = '';
      setIsTyping(false);
      setThinkingStatus(null);
    },
  });

  const voiceFooterDetail = isMicMuted
    ? 'Mic muted — tap Jamie to unmute'
    : isProcessing
    ? 'Working on your request'
    : isSpeaking
      ? 'Jamie is responding'
      : currentTranscript
        ? `"${currentTranscript}"`
        : 'Waiting for your voice';

  /*
   * Derive the visual state for the Jamie avatar in the voice dock. The
   * priority order matters: muted > speaking > listening > connecting.
   * When muted we intentionally stop rendering the speaking/listening
   * glows even if the hook reports those states — the UI is telling the
   * user that their mic is off, which is the information they care about.
   */
  const avatarState: 'muted' | 'speaking' | 'listening' | 'idle' =
    isMicMuted
      ? 'muted'
      : isSpeaking
        ? 'speaking'
        : isListening || isProcessing
          ? 'listening'
          : 'idle';

  const toggleMicMute = useCallback(() => {
    setIsMicMuted(prev => {
      const next = !prev;
      setMicMuted(next);
      return next;
    });
  }, [setMicMuted]);

  useEffect(() => {
    if (!isVoiceActive && isMicMuted) {
      setIsMicMuted(false);
      setMicMuted(false);
    }
  }, [isVoiceActive, isMicMuted, setMicMuted]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom && scrollHeight > clientHeight);
  }, []);

  // Save messages to localStorage whenever they change (excluding streaming)
  useEffect(() => {
    const nonStreamingMessages = messages.filter(m => !m.isStreaming);
    if (nonStreamingMessages.length > 0) {
      saveMessagesToStorage(messages);
    }
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Auto-focus input when component mounts or becomes visible
  useEffect(() => {
    // Use a longer delay to ensure the component is fully rendered and visible
    // This accounts for the animation when switching from recipes view
    const timer = setTimeout(() => {
      if (inputRef.current && !isVoiceActive) {
        inputRef.current.focus();
      }
    }, 300); // Longer delay to account for AnimatePresence animation (200ms transition + buffer)
    return () => clearTimeout(timer);
  }, []); // Empty deps - only on mount

  // Also focus when input becomes enabled (e.g., after voice mode ends)
  useEffect(() => {
    if (!isVoiceActive && !isTyping && inputRef.current) {
      // Small delay to ensure the input is visible and enabled
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isVoiceActive, isTyping]);

  // Process initial message if provided
  useEffect(() => {
    if (initialMessage && initialMessage.trim()) {
      handleSendMessage(initialMessage);
      onClearInitialMessage();
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
      }, 30);
      return () => clearInterval(typeInterval);
    } else {
      setDisplayedThinkingText('');
    }
  }, [thinkingStatus]);

  // Load recipes using the exact search query the agent used
  const loadRecipesForQuery = useCallback(async (query: string): Promise<Recipe[]> => {
    try {
      console.log('Loading recipes for query:', query);
      const searchResponse = await searchRecipes(query, {
        include_full_recipe: true,
        top_k: 5,
        include_chunks: false,
        similarity_threshold: 0.3,
      });

      const recipes: Recipe[] = [];
      for (let i = 0; i < Math.min(searchResponse.results.length, 5); i++) {
        const match = searchResponse.results[i];
        try {
          let fullRecipe;
          if (match.full_recipe) {
            fullRecipe = match.full_recipe as unknown as JamieOliverRecipe;
          } else {
            const localRecipe = await loadRecipeFromLocal(match.recipe_id);
            if (!localRecipe) continue;
            fullRecipe = localRecipe;
          }
          const transformed = transformRecipeMatch(match, fullRecipe, i);
          recipes.push(transformed);
        } catch (error) {
          console.error(`Error transforming recipe ${match.recipe_id}:`, error);
        }
      }
      console.log('Loaded recipes:', recipes.length);
      return recipes;
    } catch (e) {
      console.error('Failed to load recipes:', e);
      return [];
    }
  }, []);

  // Stop generation - cancel the current streaming response
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTyping(false);
    setThinkingStatus(null);

    // Mark any streaming messages as complete
    setMessages(prev => prev.map(msg =>
      msg.isStreaming ? { ...msg, isStreaming: false } : msg
    ));
  }, []);

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || inputValue.trim();
    if (!text) return;

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date(),
    };

    // Create streaming message placeholder
    const streamingMessageId = (Date.now() + 1).toString();
    const streamingMessage: Message = {
      id: streamingMessageId,
      type: 'jamie',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, streamingMessage]);
    setInputValue('');
    setIsTyping(true);
    setThinkingStatus("Thinking...");

    // Use the shared sessionId (same for text and voice chat)
    let fullResponse = '';
    let agentRecipes: Recipe[] = []; // Recipes from agent's tool call (exact matches)

    try {
      // Stream response from chat agent
      for await (const event of chatWithAgent(text, sessionId)) {
        if (event.type === 'text_chunk') {
          const chunk = event.content;
          fullResponse += chunk;

          // Update streaming message with new content
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? { ...msg, content: fullResponse }
              : msg
          ));

          // Clear thinking status once we start receiving text
          if (thinkingStatus) {
            setThinkingStatus(null);
          }
        } else if (event.type === 'tool_call') {
          const toolName = event.content as ToolName;
          console.log('Tool call:', toolName, event.metadata?.arguments);

          const knownTools: ToolName[] = [
            'search_recipes',
            'suggest_recipes_for_mood',
            'get_recipe_details',
            'plan_meal',
            'create_shopping_list',
          ];
          if (knownTools.includes(toolName)) {
            // ProcessCard owns the executing label — clear thinkingStatus immediately
            setThinkingStatus(null);
            const toolDisplay = TOOL_STEP_DISPLAY[toolName];
            const stepId =
              (event.metadata?.tool_call_id as string | undefined) ??
              `${toolName}-${Date.now()}`;
            setMessages(prev => prev.map(msg => {
              if (msg.id !== streamingMessageId) return msg;
              /*
               * Each real `tool_call` event appends a real step to the
               * card. We never fabricate steps — the list the user sees
               * is the list the agent actually executed.
               *
               * When a new tool starts, any still-executing step flips
               * to done (the agent has moved on) and the fresh tool
               * becomes the active step.
               */
              const prevSteps = msg.process?.steps ?? [];
              const closedSteps: ProcessStep[] = prevSteps.map(s =>
                s.status === 'executing' ? { ...s, status: 'done' } : s,
              );
              const newStep: ProcessStep = {
                id: stepId,
                tool: toolName,
                label: toolDisplay.executingLabel,
                icon: toolDisplay.icon,
                status: 'executing',
              };
              return {
                ...msg,
                process: {
                  // Keep the primary tool as the first one so selectFeatured
                  // stays deterministic across subsequent tool calls.
                  tool: msg.process?.tool ?? toolName,
                  status: 'executing',
                  quote: msg.process?.quote,
                  featured: msg.process?.featured,
                  steps: [...closedSteps, newStep],
                },
              };
            }));
          } else {
            if (toolName === 'search_recipes') {
              setThinkingStatus("looking through my recipes...");
            } else if (toolName === 'suggest_recipes_for_mood') {
              setThinkingStatus("Finding recipes for your mood...");
            } else if (toolName === 'get_recipe_details') {
              setThinkingStatus("Getting recipe details...");
            } else if (toolName === 'plan_meal') {
              setThinkingStatus("Planning your meal...");
            } else if (toolName === 'create_shopping_list') {
              setThinkingStatus("Creating shopping list...");
            }
          }
        } else if (event.type === 'recipes') {
          // Recipes from agent's tool call - these are the EXACT recipes Jamie mentioned
          console.log('Received recipes from agent:', event.metadata?.recipes);
          const recipeData = event.metadata?.recipes || [];

          // Transform backend recipe summaries to Recipe format for display
          for (const r of recipeData) {
            const transformed = transformRecipeFromSummary(r as BackendRecipeSummary, agentRecipes.length);
            agentRecipes.push(transformed);
          }
          console.log('Transformed', agentRecipes.length, 'recipes for display');

          // Update process card featured payload
          setMessages(prev => prev.map(msg => {
            if (msg.id !== streamingMessageId || !msg.process) return msg;
            const featured = selectFeatured({ tool: msg.process.tool, recipes: agentRecipes });
            return { ...msg, process: { ...msg.process, featured } };
          }));
        } else if (event.type === 'meal_plan') {
          // Meal plan from plan_meal tool
          console.log('Received meal plan:', event.metadata?.meal_plan);
          if (event.metadata?.meal_plan) {
            setMessages(prev => prev.map(msg => {
              if (msg.id !== streamingMessageId) return msg;
              const featured = msg.process
                ? selectFeatured({ tool: msg.process.tool, mealPlan: event.metadata!.meal_plan })
                : undefined;
              return {
                ...msg,
                mealPlan: event.metadata!.meal_plan,
                process: msg.process ? { ...msg.process, featured } : msg.process,
              };
            }));
          }
        } else if (event.type === 'recipe_detail') {
          // Recipe detail from get_recipe_details tool
          console.log('Received recipe detail:', event.metadata?.recipe);
          if (event.metadata?.recipe) {
            setMessages(prev => prev.map(msg => {
              if (msg.id !== streamingMessageId) return msg;
              const featured = msg.process
                ? selectFeatured({ tool: msg.process.tool, recipeDetail: event.metadata!.recipe })
                : undefined;
              return {
                ...msg,
                recipeDetail: event.metadata!.recipe,
                process: msg.process ? { ...msg.process, featured } : msg.process,
              };
            }));
          }
        } else if (event.type === 'shopping_list') {
          // Shopping list from create_shopping_list tool
          console.log('Received shopping list:', event.metadata?.shopping_list);
          if (event.metadata?.shopping_list) {
            setMessages(prev => prev.map(msg => {
              if (msg.id !== streamingMessageId) return msg;
              const featured = msg.process
                ? selectFeatured({ tool: msg.process.tool, shoppingList: event.metadata!.shopping_list })
                : undefined;
              return {
                ...msg,
                shoppingList: event.metadata!.shopping_list,
                process: msg.process ? { ...msg.process, featured } : msg.process,
              };
            }));
          }
        } else if (event.type === 'done') {
          // Finalize the message
          setThinkingStatus(null);
          setIsTyping(false);

          // Only show recipes that came from the agent's tool call
          const recipes = agentRecipes;

          // Update message to final state with all accumulated data.
          // `fullResponse` is the canonical Jamie prose — no rewriting,
          // no truncation, no replacement with a generic intro. The
          // ProcessCard (when present) mirrors the same text as its quote.
          setMessages(prev => prev.map(msg => {
            if (msg.id !== streamingMessageId) return msg;
            const updated = {
              ...msg,
              content: fullResponse,
              isStreaming: false,
              recipes: recipes.length > 0 ? recipes : msg.recipes,
            };

            if (updated.process) {
              const finalizedSteps: ProcessStep[] = updated.process.steps.map(s =>
                s.status === 'executing' ? { ...s, status: 'done' } : s,
              );
              updated.process = {
                ...updated.process,
                status: 'done',
                quote: fullResponse,
                steps: finalizedSteps,
              };
            }

            return updated;
          }));
        } else if (event.type === 'error') {
          console.error('Chat error:', event.content);
          setMessages(prev => prev.map(msg => {
            if (msg.id !== streamingMessageId) return msg;
            if (!msg.process) {
              return {
                ...msg,
                content: "Sorry, something went wrong. Please try again!",
                isStreaming: false,
              };
            }
            // Mark the step that was in flight when things broke as errored;
            // earlier steps that already completed stay done.
            const finalizedSteps: ProcessStep[] = msg.process.steps.map(s =>
              s.status === 'executing' ? { ...s, status: 'error' } : s,
            );
            return {
              ...msg,
              content: "Sorry, something went wrong. Please try again!",
              isStreaming: false,
              process: {
                ...msg.process,
                status: 'error',
                quote: "Something went wrong. Let me try again.",
                steps: finalizedSteps,
              },
            };
          }));
          setThinkingStatus(null);
          setIsTyping(false);
        }
      }
    } catch (error) {
      console.error('Error chatting with agent:', error);
      setThinkingStatus(null);
      setIsTyping(false);

      // Check if it's a connection error - fall back to simple search
      const isConnectionError = error instanceof Error &&
        (error.message.includes('connect') || error.message.includes('fetch') || error.message.includes('Failed'));

      if (isConnectionError) {
        // Fall back to simple recipe search using the user's query directly
        setThinkingStatus("looking through my recipes...");
        try {
          const recipes = await loadRecipesForQuery(text);

          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? {
                  ...msg,
                  content: recipes.length > 0
                    ? "Here are some recipes you might enjoy:"
                    : "I couldn't find any recipes matching your request. Try describing what you're looking for differently!",
                  isStreaming: false,
                  recipes: recipes.length > 0 ? recipes : undefined,
                }
              : msg
          ));
          setThinkingStatus(null);
        } catch (searchError) {
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? {
                  ...msg,
                  content: "I'm having trouble connecting. Please make sure the backend is running and try again!",
                  isStreaming: false
                }
              : msg
          ));
          setThinkingStatus(null);
        }
      } else {
        setMessages(prev => prev.map(msg =>
          msg.id === streamingMessageId
            ? {
                ...msg,
                content: "Sorry, something went wrong. Please try again!",
                isStreaming: false
              }
            : msg
        ));
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePromptButtonClick = (prompt: string) => {
    handleSendMessage(prompt);
  };

  const renderFeaturedPayload = useCallback((payload: FeaturedPayload, options?: {
    voiceMode?: boolean;
    voiceRole?: StackRole;
    recipes?: Recipe[];
  }) => {
    switch (payload.kind) {
      case 'recipe':
        return (
          <RecipeCarousel
            recipes={options?.recipes?.length ? options.recipes : [payload.recipe]}
            onRecipeClick={async (recipe) => {
              const completeRecipe = await ensureRecipeHasPayload(recipe);
              onRecipeClick(completeRecipe);
            }}
            singleSlide
            voiceMode={options?.voiceMode}
            voiceRole={options?.voiceRole}
          />
        );
      case 'meal_plan':
        return (
          <MealPlanCard
            mealPlan={payload.mealPlan}
            onViewRecipe={async (recipeId) => {
              const localRecipe = await loadRecipeFromLocal(recipeId);
              if (localRecipe) {
                const transformed = transformRecipeMatch(
                  { recipe_id: recipeId, title: localRecipe.recipe?.title || recipeId, similarity_score: 1, combined_score: 1, file_path: '', match_explanation: '', matching_chunks: [] },
                  localRecipe, 0
                );
                onRecipeClick(transformed);
              }
            }}
            onCookRecipe={async (recipeId) => {
              const localRecipe = await loadRecipeFromLocal(recipeId);
              if (localRecipe) {
                const transformed = transformRecipeMatch(
                  { recipe_id: recipeId, title: localRecipe.recipe?.title || recipeId, similarity_score: 1, combined_score: 1, file_path: '', match_explanation: '', matching_chunks: [] },
                  localRecipe, 0
                );
                onRecipeClick(transformed);
              }
            }}
          />
        );
      case 'shopping_list':
        return <ShoppingListCard shoppingList={payload.shoppingList} />;
      case 'recipe_detail':
        return (
          <div
            className="bg-white overflow-hidden"
            style={{ borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          >
            <div style={{ padding: '16px 20px 12px' }}>
              <h3 style={{ fontFamily: 'var(--font-display, Poppins, sans-serif)', fontSize: '16px', fontWeight: 700, color: 'var(--jamie-text-heading, #2C5F5D)', textTransform: 'uppercase', margin: 0 }}>
                {payload.recipe.title}
              </h3>
            </div>
            {payload.recipe.description && (
              <div style={{ padding: '0 20px 16px' }}>
                <p style={{ fontFamily: 'var(--font-display, Poppins, sans-serif)', fontSize: '14px', color: 'var(--jamie-text-primary, #234252)', margin: 0, lineHeight: 1.55 }}>
                  {payload.recipe.description}
                </p>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  }, [onRecipeClick]);

  const renderMessageContent = useCallback((message: Message, options?: {
    voiceMode?: boolean;
    voiceRole?: StackRole;
  }) => {
    const voiceMode = options?.voiceMode ?? false;

    if (message.type === 'jamie') {
      return (
        <>
          {message.process ? (
            <ProcessCard
              state={message.process}
              renderFeatured={(payload) => renderFeaturedPayload(payload, {
                voiceMode,
                voiceRole: options?.voiceRole,
                recipes: message.recipes,
              })}
              className={voiceMode ? 'process-card--embedded' : undefined}
            />
          ) : (
            /*
             * Non-process Jamie turn: render intro text, any attached tool
             * payloads (recipes / meal plan / shopping list), and the
             * collapsible "full response" disclosure as ONE unified card.
             *
             * Previously each of these lived as a sibling of the text
             * bubble, which produced the "small Jamie card with an orphan
             * recipe gallery hanging underneath" look — a mismatch with
             * `Jamie_05.png`, where the recipe sits inside the same white
             * surface as Jamie's quote. Wrapping them all in one card
             * keeps the visual identity consistent with ProcessCard's
             * featured layout, too.
             */
            (() => {
              /*
               * Design rule: the RESPONSE text is always visible. Only
               * "thinking steps" (surfaced by ProcessCard) are collapsible.
               * We therefore do NOT render the old "Show full response"
               * disclosure here — `message.content` is the canonical reply
               * and it's always on screen.
               */
              const hasRecipes = !!(message.recipes && message.recipes.length > 0);
              const hasMealPlan = !!message.mealPlan;
              const hasShopping = !!message.shoppingList;
              const hasAnyBody =
                !!message.content || hasRecipes || hasMealPlan || hasShopping;
              if (!hasAnyBody) return null;

              const cardClassName = voiceMode
                ? 'jamie-voice-message'
                : 'jamie-thread-card jamie-thread-card--jamie';

              return (
                <div className={cardClassName}>
                  {/*
                   * Speaker badge — mint-teal heart glyph + "JAMIE" wordmark.
                   * Matches ProcessCard and the design mocks (`Jamie_03.png`,
                   * `Jamie_04.png`, `Jamie_05.png`) so a conversational reply
                   * and a tool-driven reply share one identity.
                   */}
                  <div className="jamie-thread-speaker">
                    <JamieHeart className="jamie-thread-speaker__heart" />
                    <span>Jamie</span>
                  </div>

                  {message.content && (
                    <div className="jamie-thread-markdown prose prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h3 className="text-lg font-bold mt-4 mb-2" style={{ color: 'var(--jamie-text-heading)' }}>{children}</h3>,
                          h2: ({ children }) => <h4 className="text-base font-bold mt-3 mb-2" style={{ color: 'var(--jamie-text-heading)' }}>{children}</h4>,
                          h3: ({ children }) => <h5 className="text-base font-semibold mt-3 mb-1" style={{ color: 'var(--jamie-text-heading)' }}>{children}</h5>,
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold" style={{ color: 'var(--jamie-text-heading)' }}>{children}</strong>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                          hr: () => <hr className="my-3 border-black/10" />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                      {message.isStreaming && (
                        <motion.span
                          animate={{ opacity: [1, 0, 1] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          className="inline-block ml-0.5"
                        >
                          ▊
                        </motion.span>
                      )}
                    </div>
                  )}

                  {hasRecipes && (
                    <div className={voiceMode ? 'mt-3' : 'jamie-thread-card__payload'}>
                      <RecipeCarousel
                        recipes={message.recipes!}
                        onRecipeClick={async (recipe) => {
                          const completeRecipe = await ensureRecipeHasPayload(recipe);
                          onRecipeClick(completeRecipe);
                        }}
                        singleSlide
                        voiceMode={voiceMode}
                        voiceRole={options?.voiceRole}
                      />
                    </div>
                  )}

                  {hasMealPlan && (
                    <div className="jamie-thread-card__payload">
                      <MealPlanCard
                        mealPlan={message.mealPlan!}
                        onViewRecipe={async (recipeId) => {
                          const localRecipe = await loadRecipeFromLocal(recipeId);
                          if (localRecipe) {
                            const transformed = transformRecipeMatch({ recipe_id: recipeId, title: localRecipe.recipe?.title || recipeId, similarity_score: 1, combined_score: 1, file_path: '', match_explanation: '', matching_chunks: [] }, localRecipe, 0);
                            onRecipeClick(transformed);
                          }
                        }}
                        onCookRecipe={async (recipeId) => {
                          const localRecipe = await loadRecipeFromLocal(recipeId);
                          if (localRecipe) {
                            const transformed = transformRecipeMatch({ recipe_id: recipeId, title: localRecipe.recipe?.title || recipeId, similarity_score: 1, combined_score: 1, file_path: '', match_explanation: '', matching_chunks: [] }, localRecipe, 0);
                            onRecipeClick(transformed);
                          }
                        }}
                      />
                    </div>
                  )}

                  {hasShopping && (
                    <div className="jamie-thread-card__payload">
                      <ShoppingListCard shoppingList={message.shoppingList!} />
                    </div>
                  )}
                </div>
              );
            })()
          )}
          {/*
           * Note: we used to render a "secondary recipes carousel" here
           * alongside ProcessCard when the tool returned more than one
           * recipe. That carousel lived *outside* the card, which broke
           * the design promise that everything Jamie says/shows stays
           * within a single surface (see `Jamie_05.png`).
           *
           * The full list already flows through `renderFeaturedPayload`
           * via its `recipes` option — ProcessCard's featured slot shows
           * the entire gallery inside the card, so no sibling carousel is
           * needed.
           */}
        </>
      );
    }

    return (
      <div className="jamie-thread-card jamie-thread-card--user">
        <p
          className="jamie-thread-card__user-text"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {message.content}
        </p>
      </div>
    );
  }, [renderFeaturedPayload, imgJamieAvatar, onRecipeClick]);

  return (
    <div className="relative jamie-view-shell" data-voice-active={isVoiceActive || undefined}>
      {/* Empty State */}
      {!hasMessages && !isTyping ? (
        <OnboardingEmptyState onStart={handlePromptButtonClick} />
      ) : isVoiceActive ? (
        /*
         * Voice Mode — stacked roller of "alive" cards.
         *
         * We intentionally DO NOT wrap this in `.jamie-scroll-area`: the
         * roller owns navigation via pointer drag (`touch-action: none`).
         * A scrollable ancestor would steal the gesture on phones and give
         * a confusing "I can scroll up but not down" feel, because the
         * native scroll consumes vertical movement before the roller's
         * pointer handlers can process it.
         */
        <div className="jamie-voice-stage">
          <div className="jamie-shell-width jamie-voice-stage__inner">
            <VoiceModeRoller
              messages={messages as RollerMessage[]}
              renderMessage={(msg, role) =>
                renderMessageContent(msg as Message, { voiceMode: true, voiceRole: role })
              }
            />
          </div>
        </div>
      ) : (
        /* Messages Container - Scrollable */
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="jamie-scroll-area"
        >
          <div className="jamie-shell-width jamie-thread-stack">
            {messages.map((message, index) => (
              <div key={message.id}>
                {/* Separator */}
                {index > 0 && (
                  <div className="h-px w-full bg-[rgba(35,66,82,0.06)] my-4" />
                )}
                {renderMessageContent(message)}
              </div>
            ))}


            {/* Typing Indicator */}
            {isTyping && thinkingStatus && (
              <>
                <div className="h-px w-full bg-[rgba(35,66,82,0.06)] my-4" />
                <div className="flex gap-3 items-start">
                  <div className="relative shrink-0 size-8">
                    <img alt="" className="block size-full rounded-full" src={imgJamieAvatar} />
                  </div>
                  <div className="flex items-center gap-0 pt-1">
                    <span
                      className="text-sm italic"
                      style={{
                        fontFamily: 'var(--font-chat)',
                        color: 'var(--jamie-text-body)',
                      }}
                    >
                      {displayedThinkingText}
                    </span>
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="text-sm ml-0.5"
                      style={{ color: 'var(--jamie-text-body)' }}
                    >
                      |
                    </motion.span>
                  </div>
                </div>
              </>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Scroll to Bottom Button */}
      <AnimatePresence>
        {showScrollButton && hasMessages && !isVoiceActive && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            onClick={scrollToBottom}
            className="absolute z-10"
            style={{
              left: '50%',
              bottom: '90px',
              transform: 'translateX(-50%)',
              width: '40px',
              height: '40px',
              borderRadius: '20px',
              background: 'white',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ArrowDown className="size-5" style={{ color: 'var(--jamie-text-muted)' }} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* NEU-467: Banner when voice was paused because user left the app */}
      {isPausedByVisibility && (
        <div className="flex items-center justify-between gap-3 px-5 py-2 bg-amber-500/10 border-t border-amber-500/20" style={{ flexShrink: 0 }}>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Voice paused because you left the app. Tap the voice button or Continue to talk to Jamie again.
          </p>
          <button
            type="button"
            onClick={resumeFromVisibility}
            className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-full border border-amber-500/50 text-amber-700 hover:bg-amber-500/20 transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* Voice Mode Footer */}
      <AnimatePresence>
        {isVoiceActive && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="jamie-voice-dock-shell"
            style={{ flexShrink: 0 }}
          >
            <div className="jamie-shell-width">
              {/*
               * Shared VoiceFooter — same component CookWithJamie uses.
               * In chat-mode voice, the ghost slot drops the user back
               * into the text composer and the Stop button is
               * icon-only (no trailing label) per the mocks.
               */}
              <VoiceFooter
                avatarSrc={imgJamieAvatar}
                avatarState={avatarState}
                isMicMuted={isMicMuted}
                onToggleMute={toggleMicMute}
                onStop={isProcessing || isSpeaking ? cancelVoice : disconnectVoice}
                stopLabel={
                  isProcessing || isSpeaking
                    ? 'Stop Jamie'
                    : 'End voice conversation'
                }
                stopDetail={voiceFooterDetail}
                stopVariant="icon"
                ghostAction={{
                  icon: <MessageCircle className="size-5" />,
                  onClick: () => {
                    disconnectVoice();
                    window.setTimeout(() => inputRef.current?.focus(), 0);
                  },
                  ariaLabel: 'Return to text chat',
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stop Generation Button - Shows when text is streaming */}
      <AnimatePresence>
        {isTyping && !isVoiceActive && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex justify-center px-5 py-2"
            style={{ flexShrink: 0 }}
          >
            <StopGenerationButton onClick={handleStopGeneration} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Input - Always at bottom */}
      {!isVoiceActive && (
        <div className="jamie-composer-shell">
          <div className="jamie-shell-width">
            <div className="jamie-composer">
              <div className="flex min-h-14 items-center gap-2 w-full">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Reply Jamie..."
                  disabled={isTyping || isVoiceActive}
                  className="flex-1 text-base bg-transparent outline-none disabled:opacity-50"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '15px',
                    lineHeight: '24px',
                    color: 'var(--jamie-text-body)',
                  }}
                />

                {/*
                 * Composer actions order (per design):
                 *   1. Send arrow — subtle gray, activates only when there's text.
                 *   2. Voice button — teal CTA, always present at the far right.
                 * Voice sits last because it's the primary, always-available CTA.
                 */}
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() || isTyping}
                  aria-label="Send message"
                  className="shrink-0 flex items-center justify-center transition-colors disabled:opacity-50"
                  style={{
                    width: 36,
                    height: 36,
                    minWidth: 36,
                    minHeight: 36,
                    borderRadius: '9999px',
                    aspectRatio: '1 / 1',
                    padding: 0,
                    border: 0,
                    backgroundColor: inputValue.trim() && !isTyping ? 'var(--jamie-primary)' : '#E5E5E5',
                  }}
                >
                  <ArrowUp
                    size={18}
                    strokeWidth={2}
                    style={{ color: inputValue.trim() && !isTyping ? '#FFFFFF' : '#A3A3A3' }}
                  />
                </button>

                <VoiceModeButton
                  isActive={isVoiceActive || isPausedByVisibility}
                  isConnecting={voiceState === 'connecting'}
                  onClick={isPausedByVisibility ? resumeFromVisibility : toggleVoiceMode}
                  disabled={isTyping && !isVoiceActive && !isPausedByVisibility}
                />
              </div>
            </div>

            {!hasMessages && !isPausedByVisibility && (
              <p
                className="text-center mt-2 text-xs"
                style={{
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                Tap to talk to Jamie
              </p>
            )}
            {isPausedByVisibility && (
              <p
                className="text-center mt-2 text-xs text-amber-700 dark:text-amber-300"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Voice paused — tap to resume talking to Jamie
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatView;
