import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Recipe } from '../data/recipes';
import { RecipeCarousel } from './RecipeCarousel';
import { MealPlanCard } from './MealPlanCard';
import { RecipeQuickView } from './RecipeQuickView';
import { ShoppingListCard } from './ShoppingListCard';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlowEffect } from '../design-system/components/GlowEffect';
import { AvatarWithGlow } from '../design-system/components/AvatarWithGlow';
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
import { transformRecipeMatch, loadRecipeFromLocal } from '../data/recipeTransformer';
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
}

interface ChatViewProps {
  initialMessage?: string;
  onRecipeClick: (recipe: Recipe) => void;
  onPromptClick: (prompt: string) => void;
  onClearInitialMessage: () => void;
}

const CHAT_STORAGE_KEY = 'jamie-oliver-chat-messages';
const SESSION_ID_KEY = 'jamie-oliver-chat-session';

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

  const hasMessages = messages.length > 0;

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

  // Auto-focus input when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

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

    const sessionId = getOrCreateSessionId();
    let fullResponse = '';
    let agentRecipes: Recipe[] = []; // Recipes from agent's tool call (exact matches)

    try {
      // Stream response from chat agent
      for await (const event of chatWithAgent(text, sessionId)) {
        if (event.type === 'text_chunk') {
          fullResponse += event.content;
          
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
            setThinkingStatus("Searching for recipes...");
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
          
          // Transform to Recipe format for display
          for (const r of recipeData) {
            try {
              // Load full recipe details for proper card display
              const localRecipe = await loadRecipeFromLocal(r.recipe_id);
              if (localRecipe) {
                const transformed = transformRecipeMatch(
                  { 
                    recipe_id: r.recipe_id, 
                    title: r.title,
                    similarity_score: r.similarity_score || 0.8,
                    combined_score: r.similarity_score || 0.8,
                    file_path: '',
                    match_explanation: '',
                    matching_chunks: [],
                  },
                  localRecipe,
                  agentRecipes.length
                );
                agentRecipes.push(transformed);
              }
            } catch (e) {
              console.error('Error loading recipe:', r.recipe_id, e);
            }
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
        } else if (event.type === 'done') {
          // Finalize the message
          setThinkingStatus(null);
          setIsTyping(false);
          
          // Only show recipes that came from the agent's tool call
          // Don't do fallback searches - they often return irrelevant results
          // when the agent is asking clarifying questions
          const recipes = agentRecipes;
          
          console.log('Final recipe count:', recipes.length);
          
          // Update message to final state with all accumulated data
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageId 
              ? { 
                  ...msg, 
                  content: fullResponse, 
                  isStreaming: false, 
                  recipes: recipes.length > 0 ? recipes : msg.recipes,
                  // Keep any meal_plan, recipe_detail, shopping_list that was already set
                }
              : msg
          ));
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
        setThinkingStatus("Searching for recipes...");
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
    <div className="flex flex-col flex-1 min-h-0 bg-white relative">
      {/* Empty State with Landing-style prompts */}
      {!hasMessages && !isTyping ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
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
                    maxWidth: '307px',
                  }}
                >
                  Hello there! I'm Jamie Oliver, and I'm here to help you discover amazing recipes. Tell me what you're in the mood for!
                </p>
              </motion.div>

              {/* Prompt Suggestions */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="flex flex-col items-center gap-3 mb-6 max-w-md mx-auto"
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
          className="flex-1 min-h-0 overflow-y-auto px-5 py-4"
        >
          <div className="max-w-[380px] mx-auto space-y-4">
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
                    
                    {/* Recipe Carousel */}
                    {message.recipes && message.recipes.length > 0 && (
                      <div className="mt-4">
                        <RecipeCarousel
                          recipes={message.recipes}
                          onRecipeClick={(recipe) => onRecipeClick(recipe)}
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

      {/* Chat Input - Always at bottom */}
      <div 
        className="px-5 py-3 bg-white border-t border-black/5 shrink-0"
      >
        <div className="max-w-[380px] mx-auto">
          <div 
            className="bg-white relative rounded-full border border-black/10"
            style={{
              boxShadow: '0px 2px 5px 0px rgba(0,0,0,0.06), 0px 9px 9px 0px rgba(0,0,0,0.01)',
            }}
          >
            <div className="flex items-center gap-3 p-3">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Tell me what you're craving..."
                disabled={isTyping}
                className="flex-1 text-base bg-transparent outline-none disabled:opacity-50 placeholder:text-gray-400"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '15px',
                  lineHeight: '24px',
                  color: 'var(--jamie-text-body)',
                }}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatView;
