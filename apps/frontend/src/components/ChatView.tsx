import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Recipe } from '../data/recipes';
import { RecipeCarousel } from './RecipeCarousel';
import { MealPlanCard } from './MealPlanCard';
import { RecipeQuickView } from './RecipeQuickView';
import { ShoppingListCard } from './ShoppingListCard';
import { ArrowUp, ArrowDown, Clock, Users, ChefHat, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlowEffect } from '../design-system/components/GlowEffect';
import { AvatarWithGlow } from '../design-system/components/AvatarWithGlow';
import { VoiceModeButton, VoiceModeIndicator, AudioWaveform, StopGenerationButton } from './VoiceModeIndicator';
import { useVoiceChat } from '../hooks/useVoiceChat';
// @ts-expect-error - Vite resolves figma:asset imports
import imgJamieAvatar from 'figma:asset/dbe757ff22db65b8c6e8255fc28d6a6a29240332.png';
// @ts-expect-error - Vite handles image imports
import jamieAvatarLarge from 'figma:asset/9998d3c8aa18fde4e634353cc1af4c783bd57297.png';
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
  originalContent?: string; // Preserve original streaming text before tool-dominant copy replacement
  recipes?: Recipe[];
  mealPlan?: MealPlanData;
  recipeDetail?: RecipeDetailData;
  shoppingList?: ShoppingListData;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatViewProps {
  initialMessage?: string;
  onRecipeClick: (recipe: Recipe) => void;
  onPromptClick: (prompt: string) => void;
  onClearInitialMessage: () => void;
}

const CHAT_STORAGE_KEY = 'jamie-oliver-chat-messages';
const SESSION_ID_KEY = 'jamie-oliver-chat-session';
const TOOL_INTRO_MAX_CHARS = 240;

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

// Prompt suggestions for empty state
const PROMPT_SUGGESTIONS = [
  "I've had a long day",
  "I just need something easy",
  "Cook something you love",
  "My energy is at 2%"
];

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

const hasToolPayload = (message: Message) =>
  Boolean(message.recipes?.length || message.mealPlan || message.recipeDetail || message.shoppingList);

const getToolIntroForMessage = (message: Message) => {
  if (message.mealPlan) return "Here's a meal plan I put together for you.";
  if (message.recipeDetail) return "Here are the details for that recipe.";
  if (message.shoppingList) return "Here's your shopping list.";
  return "Here are some great options for you.";
};

const applyToolDominantCopy = (message: Message, content: string) => {
  if (!hasToolPayload(message)) return content;
  if (!content.trim()) return getToolIntroForMessage(message);

  const normalized = content.trim();
  const lineCount = normalized.split('\n').length;
  const looksLikeList = /^[\s>*-]*\d+\.|^[\s>*-]*[-*•]/m.test(normalized);

  if (normalized.length > TOOL_INTRO_MAX_CHARS || lineCount > 2 || looksLikeList) {
    return getToolIntroForMessage(message);
  }

  return content;
};

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
  const [expandedOriginalContent, setExpandedOriginalContent] = useState<Set<string>>(new Set());
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
  } = useVoiceChat({
    sessionId,  // Share session ID between voice and text chat
    onTranscript: (text, isFinal) => {
      console.log('🎤 Transcript received:', { text, isFinal });

      if (isFinal && text.trim()) {
        // Create user message from voice transcript
        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          content: text,
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
            let content = msg.content || accumulatedText;
            if (!content) {
              content = hasToolPayload(msg)
                ? getToolIntroForMessage(msg)
                : "I'm here to help! What would you like to cook today?";
            }
            // Preserve original content if tool dominant copy will change it
            const finalContent = applyToolDominantCopy(msg, content);
            const updated = { ...msg, content: finalContent, isStreaming: false };
            if (hasToolPayload(updated) && finalContent !== content && content.trim()) {
              updated.originalContent = content;
            }
            return updated;
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
          // Show what tool is being called
          const toolName = event.content;
          console.log('Tool call:', toolName, event.metadata?.arguments);

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
        } else if (event.type === 'recipes') {
          // Recipes from agent's tool call - these are the EXACT recipes Jamie mentioned
          console.log('Received recipes from agent:', event.metadata?.recipes);
          const recipeData = event.metadata?.recipes || [];

          // Transform backend recipe summaries to Recipe format for display
          // Uses summary data directly - no need to re-fetch full recipes
          for (const r of recipeData) {
            const transformed = transformRecipeFromSummary(r as BackendRecipeSummary, agentRecipes.length);
            agentRecipes.push(transformed);
          }
          console.log('Transformed', agentRecipes.length, 'recipes for display');
        } else if (event.type === 'meal_plan') {
          // Meal plan from plan_meal tool
          console.log('Received meal plan:', event.metadata?.meal_plan);
          if (event.metadata?.meal_plan) {
            // Update message with meal plan data immediately
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessageId
                ? { ...msg, mealPlan: event.metadata!.meal_plan }
                : msg
            ));
          }
        } else if (event.type === 'recipe_detail') {
          // Recipe detail from get_recipe_details tool
          console.log('Received recipe detail:', event.metadata?.recipe);
          if (event.metadata?.recipe) {
            // Update message with recipe detail data immediately
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessageId
                ? { ...msg, recipeDetail: event.metadata!.recipe }
                : msg
            ));
          }
        } else if (event.type === 'shopping_list') {
          // Shopping list from create_shopping_list tool
          console.log('Received shopping list:', event.metadata?.shopping_list);
          if (event.metadata?.shopping_list) {
            // Update message with shopping list data immediately
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessageId
                ? { ...msg, shoppingList: event.metadata!.shopping_list }
                : msg
            ));
          }
        } else if (event.type === 'original_content') {
          // Backend sent the full original content (when tool-dominant copy was truncated)
          // Update the message with the full original content
          setMessages(prev => prev.map(msg => {
            if (msg.id !== streamingMessageId) return msg;
            return { ...msg, originalContent: event.content };
          }));
        } else if (event.type === 'done') {
          // Finalize the message
          setThinkingStatus(null);
          setIsTyping(false);

          // Only show recipes that came from the agent's tool call
          // Don't do fallback searches - they often return irrelevant results
          // when the agent is asking clarifying questions
          const recipes = agentRecipes;

          // Update message to final state with all accumulated data
          setMessages(prev => prev.map(msg => {
            if (msg.id !== streamingMessageId) return msg;
            const updated = {
              ...msg,
              content: fullResponse,
              isStreaming: false,
              recipes: recipes.length > 0 ? recipes : msg.recipes,
            };
            // Preserve original content if tool dominant copy will change it
            // Only set originalContent if it wasn't already set by the backend's original_content event
            const finalContent = applyToolDominantCopy(updated, updated.content);
            if (!updated.originalContent && hasToolPayload(updated) && finalContent !== fullResponse && fullResponse.trim()) {
              updated.originalContent = fullResponse;
            }
            return { ...updated, content: finalContent };
          }));
        } else if (event.type === 'error') {
          console.error('Chat error:', event.content);
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? {
                  ...msg,
                  content: "Sorry, something went wrong. Please try again!",
                  isStreaming: false
                }
              : msg
          ));
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

  return (
    <div
      className="bg-white relative"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* Empty State with Landing-style prompts */}
      {!hasMessages && !isTyping ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          <div className="relative">
            <GlowEffect />
            <div className="relative z-10 px-5 py-6">
              {/* Jamie's Avatar */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center mb-6"
              >
                <AvatarWithGlow
                  src={jamieAvatarLarge}
                  alt="Jamie Oliver"
                  size={140}
                />
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="text-center mt-4"
                >
                  <h1
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: '28px',
                      lineHeight: 1,
                      textTransform: 'uppercase',
                      color: 'var(--jamie-text-heading)',
                    }}
                  >
                    COOK WITH JAMIE
                  </h1>
                </motion.div>
              </motion.div>

              {/* Welcome Message */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="flex justify-center mb-6"
              >
                <p
                  className="text-center"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 400,
                    fontSize: '16px',
                    lineHeight: 1.5,
                    color: 'var(--jamie-text-primary)',
                    maxWidth: CHAT_CONTENT_MAX_WIDTH,
                  }}
                >
                  Hi - I'm jAImie, Jamie Oliver's AI cooking companion. I'll walk or talk you through recipes step-by-step. What are you in the mood for?
                </p>
              </motion.div>

              {/* Prompt Suggestions */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="flex flex-col items-center gap-3 mb-6 mx-auto"
            style={{ maxWidth: CHAT_CONTENT_MAX_WIDTH }}
              >
                {PROMPT_SUGGESTIONS.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handlePromptButtonClick(prompt)}
                    className="w-full rounded-full border border-gray-300 px-4 text-left transition-colors hover:bg-gray-50 hover:border-gray-400"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '16px',
                      color: 'var(--jamie-text-primary)',
                      height: 'var(--touch-target-min)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      ) : (
        /* Messages Container - Scrollable */
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="px-5 py-4"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          <div className="mx-auto space-y-4" style={{ maxWidth: CHAT_CONTENT_MAX_WIDTH }}>
            {messages.map((message, index) => (
              <div key={message.id}>
                {/* Separator */}
                {index > 0 && (
                  <div className="h-px w-full bg-black/5 my-4" />
                )}

                {message.type === 'jamie' ? (
                  <>
                    {message.content && (
                      <div className="flex gap-3 items-start">
                        <div className="relative shrink-0 size-8">
                          <img
                            alt="Jamie"
                            className="block size-full rounded-full"
                            src={imgJamieAvatar}
                          />
                        </div>
                        <div
                          className="flex-1 text-base prose prose-sm max-w-none"
                          style={{
                            fontFamily: 'var(--font-chat)',
                            lineHeight: 1.5,
                            color: 'var(--jamie-text-body)',
                          }}
                        >
                          <ReactMarkdown
                            components={{
                              // Headings
                              h1: ({ children }) => (
                                <h3 className="text-lg font-bold mt-4 mb-2" style={{ color: 'var(--jamie-text-heading)' }}>
                                  {children}
                                </h3>
                              ),
                              h2: ({ children }) => (
                                <h4 className="text-base font-bold mt-3 mb-2" style={{ color: 'var(--jamie-text-heading)' }}>
                                  {children}
                                </h4>
                              ),
                              h3: ({ children }) => (
                                <h5 className="text-base font-semibold mt-3 mb-1" style={{ color: 'var(--jamie-text-heading)' }}>
                                  {children}
                                </h5>
                              ),
                              // Paragraphs
                              p: ({ children }) => (
                                <p className="mb-2 last:mb-0">{children}</p>
                              ),
                              // Strong/bold
                              strong: ({ children }) => (
                                <strong className="font-semibold" style={{ color: 'var(--jamie-text-heading)' }}>
                                  {children}
                                </strong>
                              ),
                              // Lists
                              ul: ({ children }) => (
                                <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
                              ),
                              li: ({ children }) => (
                                <li className="mb-1">{children}</li>
                              ),
                              // Horizontal rule
                              hr: () => (
                                <hr className="my-3 border-black/10" />
                              ),
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
                      </div>
                    )}

                    {/* Collapsible Original Content */}
                    {message.originalContent &&
                     message.originalContent !== message.content &&
                     hasToolPayload(message) && (
                      <div className="mt-2">
                        <button
                          onClick={() => {
                            setExpandedOriginalContent(prev => {
                              const next = new Set(prev);
                              if (next.has(message.id)) {
                                next.delete(message.id);
                              } else {
                                next.add(message.id);
                              }
                              return next;
                            });
                          }}
                          className="flex items-center gap-1.5 text-sm italic"
                          style={{
                            fontFamily: 'var(--font-chat)',
                            color: 'var(--jamie-text-muted, #717182)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px 0',
                          }}
                        >
                          {expandedOriginalContent.has(message.id) ? (
                            <>
                              <ChevronUp className="size-3" />
                              <span>Hide full response</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-3" />
                              <span>Show full response</span>
                            </>
                          )}
                        </button>
                        {expandedOriginalContent.has(message.id) && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="mt-2 pt-2"
                            style={{
                              borderTop: '1px solid rgba(0, 0, 0, 0.05)',
                              overflow: 'visible',
                              maxHeight: 'none',
                              height: 'auto',
                            }}
                          >
                            <div
                              className="text-sm prose prose-sm max-w-none"
                              style={{
                                fontFamily: 'var(--font-chat)',
                                lineHeight: 1.5,
                                color: 'var(--jamie-text-body)',
                                overflow: 'visible',
                                maxHeight: 'none',
                                height: 'auto',
                                wordWrap: 'break-word',
                                overflowWrap: 'break-word',
                              }}
                            >
                              <ReactMarkdown
                                components={{
                                  // Headings
                                  h1: ({ children }) => (
                                    <h3 className="text-lg font-bold mt-4 mb-2" style={{ color: 'var(--jamie-text-heading)' }}>
                                      {children}
                                    </h3>
                                  ),
                                  h2: ({ children }) => (
                                    <h4 className="text-base font-bold mt-3 mb-2" style={{ color: 'var(--jamie-text-heading)' }}>
                                      {children}
                                    </h4>
                                  ),
                                  h3: ({ children }) => (
                                    <h5 className="text-base font-semibold mt-3 mb-1" style={{ color: 'var(--jamie-text-heading)' }}>
                                      {children}
                                    </h5>
                                  ),
                                  // Paragraphs
                                  p: ({ children }) => (
                                    <p className="mb-2 last:mb-0">{children}</p>
                                  ),
                                  // Strong/bold
                                  strong: ({ children }) => (
                                    <strong className="font-semibold" style={{ color: 'var(--jamie-text-heading)' }}>
                                      {children}
                                    </strong>
                                  ),
                                  // Lists
                                  ul: ({ children }) => (
                                    <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
                                  ),
                                  li: ({ children }) => (
                                    <li className="mb-1">{children}</li>
                                  ),
                                  // Horizontal rule
                                  hr: () => (
                                    <hr className="my-3 border-black/10" />
                                  ),
                                }}
                              >
                                {message.originalContent}
                              </ReactMarkdown>
                            </div>
                          </motion.div>
                        )}
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
                          }}
                          singleSlide={true}
                        />
                      </div>
                    )}

                    {/* Meal Plan Card */}
                    {message.mealPlan && (
                      <div className="mt-4">
                        <MealPlanCard
                          mealPlan={message.mealPlan}
                          onViewRecipe={async (recipeId) => {
                            // Load and show recipe
                            const localRecipe = await loadRecipeFromLocal(recipeId);
                            if (localRecipe) {
                              const transformed = transformRecipeMatch(
                                {
                                  recipe_id: recipeId,
                                  title: localRecipe.recipe?.title || recipeId,
                                  similarity_score: 1,
                                  combined_score: 1,
                                  file_path: '',
                                  match_explanation: '',
                                  matching_chunks: [],
                                },
                                localRecipe,
                                0
                              );
                              onRecipeClick(transformed);
                            }
                          }}
                          onCookRecipe={async (recipeId) => {
                            // Load and start cooking
                            const localRecipe = await loadRecipeFromLocal(recipeId);
                            if (localRecipe) {
                              const transformed = transformRecipeMatch(
                                {
                                  recipe_id: recipeId,
                                  title: localRecipe.recipe?.title || recipeId,
                                  similarity_score: 1,
                                  combined_score: 1,
                                  file_path: '',
                                  match_explanation: '',
                                  matching_chunks: [],
                                },
                                localRecipe,
                                0
                              );
                              onRecipeClick(transformed);
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Recipe Detail Card - Inline display */}
                    {message.recipeDetail && (
                      <div className="mt-4">
                        <div
                          className="bg-white overflow-hidden"
                          style={{
                            borderRadius: '24px',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                          }}
                        >
                          {/* Header */}
                          <div style={{ padding: '20px 24px' }}>
                            <h3
                              style={{
                                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                                fontSize: '18px',
                                fontWeight: 700,
                                color: 'var(--jamie-text-heading, #2C5F5D)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                margin: 0,
                                lineHeight: 1.3,
                              }}
                            >
                              {message.recipeDetail.title}
                            </h3>

                            {/* Meta info */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                marginTop: '12px',
                                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                                fontSize: '14px',
                                color: 'var(--jamie-text-muted, #717182)',
                              }}
                            >
                              {message.recipeDetail.estimated_time && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Clock className="size-4" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
                                  {message.recipeDetail.estimated_time.replace('PT', '').replace('H', 'h ').replace('M', 'm').trim() || message.recipeDetail.estimated_time}
                                </span>
                              )}
                              {message.recipeDetail.servings && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Users className="size-4" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
                                  {message.recipeDetail.servings}
                                </span>
                              )}
                              {message.recipeDetail.difficulty && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <ChefHat className="size-4" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
                                  {message.recipeDetail.difficulty}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Description */}
                          {message.recipeDetail.description && (
                            <div style={{ padding: '0 24px 20px' }}>
                              <p
                                style={{
                                  fontFamily: 'var(--font-display, Poppins, sans-serif)',
                                  fontSize: '15px',
                                  lineHeight: 1.6,
                                  color: 'var(--jamie-text-primary, #234252)',
                                  margin: 0,
                                }}
                              >
                                {message.recipeDetail.description}
                              </p>
                            </div>
                          )}

                          {/* Ingredients preview */}
                          {message.recipeDetail.ingredients && message.recipeDetail.ingredients.length > 0 && (
                            <div style={{ padding: '0 24px 20px' }}>
                              <h4
                                style={{
                                  fontFamily: 'var(--font-display, Poppins, sans-serif)',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: 'var(--jamie-text-muted, #717182)',
                                  letterSpacing: '0.1em',
                                  textTransform: 'uppercase',
                                  marginBottom: '12px',
                                }}
                              >
                                {message.recipeDetail.ingredients.length} Ingredients
                              </h4>
                              <p
                                style={{
                                  fontFamily: 'var(--font-display, Poppins, sans-serif)',
                                  fontSize: '14px',
                                  color: 'var(--jamie-text-muted, #717182)',
                                  lineHeight: 1.5,
                                  margin: 0,
                                }}
                              >
                                {message.recipeDetail.ingredients.slice(0, 5).join(' · ')}
                                {message.recipeDetail.ingredients.length > 5 && ` · +${message.recipeDetail.ingredients.length - 5} more`}
                              </p>
                            </div>
                          )}

                          {/* View Full Recipe button */}
                          <div style={{ padding: '0 24px 24px' }}>
                            <button
                              onClick={async () => {
                                const recipeId = message.recipeDetail!.recipe_id;
                                const localRecipe = await loadRecipeFromLocal(recipeId);
                                if (localRecipe) {
                                  const transformed = transformRecipeMatch(
                                    {
                                      recipe_id: recipeId,
                                      title: localRecipe.recipe?.title || recipeId,
                                      similarity_score: 1,
                                      combined_score: 1,
                                      file_path: '',
                                      match_explanation: '',
                                      matching_chunks: [],
                                    },
                                    localRecipe,
                                    0
                                  );
                                  onRecipeClick(transformed);
                                }
                              }}
                              style={{
                                width: '100%',
                                height: '50px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0 14px 0 24px',
                                borderRadius: '24px',
                                border: 'none',
                                background: '#29514F',
                                color: 'white',
                                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                                fontSize: '15px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'background 0.2s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#1f423f')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = '#29514F')}
                            >
                              <span>View Full Recipe</span>
                              <span
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '9px',
                                  background: 'rgba(255,255,255,0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <ArrowRight className="size-4" />
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Shopping List Card */}
                    {message.shoppingList && (
                      <div className="mt-4">
                        <ShoppingListCard
                          shoppingList={message.shoppingList}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className="bg-[#f5f5f5] rounded-2xl p-4"
                    style={{ borderRadius: '16px' }}
                  >
                    <p
                      className="text-base"
                      style={{
                        fontFamily: 'var(--font-chat)',
                        lineHeight: 1.5,
                        color: 'var(--jamie-text-body)',
                      }}
                    >
                      {message.content}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && thinkingStatus && (
              <>
                <div className="h-px w-full bg-black/5 my-4" />
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
        {showScrollButton && hasMessages && (
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
            Voice paused because you left the app. Tap the mic or Continue to talk to Jamie again.
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

      {/* Voice Mode Indicator - Shows when voice is active */}
      <AnimatePresence>
        {isVoiceActive && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="px-5 py-3 bg-white border-t border-black/5"
            style={{ flexShrink: 0 }}
          >
            <div className="mx-auto" style={{ maxWidth: CHAT_CONTENT_MAX_WIDTH }}>
              <VoiceModeIndicator
                state={voiceState}
                transcript={currentTranscript}
                onCancel={cancelVoice}
                onExit={disconnectVoice}
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
      <div
        className="px-5 py-3 bg-white border-t border-black/5"
        style={{
          flexShrink: 0,
        }}
      >
        <div className="mx-auto" style={{ maxWidth: CHAT_CONTENT_MAX_WIDTH }}>
          <div
            className="bg-white relative rounded-full border border-black/10"
            style={{
              boxShadow: '0px 2px 5px 0px rgba(0,0,0,0.06), 0px 9px 9px 0px rgba(0,0,0,0.01)',
            }}
          >
            <div className="flex items-center gap-2 p-2 pl-3">
              {/* Text Input - Hidden when voice mode is active and listening */}
              {!isVoiceActive || voiceState === 'idle' ? (
                <>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Tell me what you're craving..."
                    disabled={isTyping || isVoiceActive}
                    className="flex-1 text-base bg-transparent outline-none disabled:opacity-50 placeholder:text-gray-400"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '15px',
                      lineHeight: '24px',
                      color: 'var(--jamie-text-body)',
                    }}
                  />

                  {/* Voice Mode Button */}
                  <VoiceModeButton
                    isActive={isVoiceActive || isPausedByVisibility}
                    isConnecting={voiceState === 'connecting'}
                    onClick={isPausedByVisibility ? resumeFromVisibility : toggleVoiceMode}
                    disabled={isTyping && !isVoiceActive && !isPausedByVisibility}
                    className="shrink-0"
                  />

                  {/* Send Button */}
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isTyping}
                    className="shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
                    style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: inputValue.trim() && !isTyping ? 'var(--jamie-primary)' : '#E5E5E5',
                    }}
                  >
                    <ArrowUp
                      className="size-5"
                      strokeWidth={2}
                      style={{ color: inputValue.trim() && !isTyping ? '#FFFFFF' : '#A3A3A3' }}
                    />
                  </button>
                </>
              ) : (
                /* Voice Mode Active - Show waveform */
                <div className="flex-1 flex items-center justify-center py-2">
                  <AudioWaveform isActive={isListening || isSpeaking} bars={7} />
                </div>
              )}
            </div>
          </div>

          {/* Voice mode hint */}
          {!isVoiceActive && !hasMessages && !isPausedByVisibility && (
            <p
              className="text-center mt-2 text-xs"
              style={{
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-display)',
              }}
            >
              Tap the mic to talk to Jamie
            </p>
          )}
          {isPausedByVisibility && (
            <p
              className="text-center mt-2 text-xs text-amber-700 dark:text-amber-300"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Voice paused – tap the mic or Continue above to resume
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatView;
