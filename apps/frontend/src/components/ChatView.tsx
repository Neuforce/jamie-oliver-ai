import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { createPortal } from 'react-dom';
import { Recipe } from '../data/recipes';
import { RecipeCarousel } from './RecipeCarousel';
import { MealPlanCard } from './MealPlanCard';
import { ShoppingListCard } from './ShoppingListCard';
import { ArrowUp, ArrowDown, MessageCircle, Square, MicOff, Mic, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OnboardingEmptyState } from './OnboardingEmptyState';
import { ProcessCard, selectFeatured } from './ProcessCard';
import type { ProcessCardState, ProcessStep, ToolName, FeaturedPayload } from './ProcessCardTypes';
import { TOOL_STEP_DISPLAY } from './ProcessCardTypes';
import { JamieHeart } from './JamieHeart';
import { SpendMandateConsentInline } from './SpendMandateConsentInline';
import { VoiceModeRoller } from './VoiceModeRoller';
import { VoiceFooter } from './VoiceFooter';
import type { RollerMessage, StackRole, RollerRenderContext } from './VoiceModeRoller';
import { VoiceRichCardPreview } from './VoiceRichCardPreview';
import {
  getVoiceRichCardPreview,
  isVoiceExpandableMessage,
  resolveVoiceFeatured,
} from '../lib/voiceRichCard';
import { VoiceModeButton, StopGenerationButton } from './VoiceModeIndicator';
import { VoiceThinkingBubble } from './VoiceThinkingBubble';
import { useVoiceChat } from '../hooks/useVoiceChat';
// @ts-expect-error - Vite resolves figma:asset imports
import imgJamieAvatar from 'figma:asset/dbe757ff22db65b8c6e8255fc28d6a6a29240332.png';
import {
  chatWithAgent,
  generateSessionId,
  getRecipeById,
  searchRecipes,
  type MealPlanData,
  type RecipeDetailData,
  type ShoppingListData,
} from '../lib/api';
import { transformRecipeMatch, transformRecipeFromSummary, loadRecipeFromLocal, type BackendRecipeSummary } from '../data/recipeTransformer';
import type { JamieOliverRecipe } from '../data/recipeTransformer';
import {
  getRecipeDetailForOpenIntent,
  backendSummaryFromRecipeDetail,
  userAffirmsGoToFullRecipe,
  shouldOpenRecipeFromVoiceUtterance,
} from '../lib/discoveryFullRecipeGate';
import {
  createChatTurnStreamState,
  legacyFieldsFromStreamState,
  reduceChatStreamEvent,
  type ChatTurnStreamState,
  type ToolInvocationPart,
} from '../lib/chatStream';
import type { ChatEvent } from '../lib/api';
import { CHAT_STORAGE_KEY, SESSION_ID_KEY } from '../lib/chatStorage';
import { markAppLoadStage } from '../lib/appLoadMetrics';
import type { RecipeAccessResponse } from '../lib/api';
import {
  getRecipeCommerceBadge,
  RECIPE_COMMERCE_BADGE_STYLES,
  type RecipeCommerceBadge,
} from '../lib/recipeAccessDisplay';

interface Message {
  id: string;
  type: 'user' | 'jamie';
  content: string;
  toolParts?: ToolInvocationPart[];
  responseId?: string;
  recipes?: Recipe[];
  mealPlan?: MealPlanData;
  recipeDetail?: RecipeDetailData;
  shoppingList?: ShoppingListData;
  timestamp: Date;
  isStreaming?: boolean;
  process?: ProcessCardState;
}

function messagePatchFromStreamState(state: ChatTurnStreamState): Partial<Message> {
  const legacy = legacyFieldsFromStreamState(state);
  return {
    content: state.text,
    toolParts: state.parts,
    responseId: state.responseId,
    recipes: legacy.recipes,
    recipeDetail: legacy.recipeDetail,
    mealPlan: legacy.mealPlan,
    shoppingList: legacy.shoppingList,
  };
}

interface ChatViewProps {
  initialMessage?: string;
  onRecipeClick: (recipe: Recipe) => void;
  onPromptClick: (prompt: string) => void;
  onClearInitialMessage: () => void;
  onScrollStateChange?: (scrolled: boolean) => void;
  isChatVisible?: boolean;
  /** True when App has a recipe sheet (modal) open — voice dock portals above it. */
  recipeModalOpen?: boolean;
  focusedRecipeBackendId?: string | null;
  /** True while RecipeModal is open — bottom padding for portaled launcher or voice dock. */
  onRecipeModalVoiceDockOverlapChange?: (overlap: boolean) => void;
  onVoiceRecipePaywallRequested?: (backendRecipeId: string) => void;
  /** Notifies parent when discovery voice mode is connected (keeps ChatView mounted across tabs). */
  onDiscoveryVoiceSessionChange?: (active: boolean) => void;
  recipeAccessMap?: Record<string, RecipeAccessResponse>;
  recipeAccessLoadingId?: string | null;
  onPrefetchChatRecipeAccess?: (backendIds: string[]) => void;
}

const IGNORED_VOICE_TRANSCRIPTS = new Set(['[Connection restored]']);
const JAMIE_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 520;

/** Max width for chat content; matches TabNav for consistent layout (NEU-470). */
const CHAT_CONTENT_MAX_WIDTH = 600;


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

  // Prefer the backend recipe endpoint because it reflects the same source of
  // truth as the 251 recipes loaded from Supabase. The local JSON bundle is
  // only a partial fallback and misses many of the newer slugs.
  try {
    const response = await getRecipeById(recipe.backendId);
    if (response.full_recipe && 'recipe' in response.full_recipe) {
      return transformRecipeMatch(
        {
          recipe_id: recipe.backendId,
          title: response.title || recipe.title,
          similarity_score: 1,
          combined_score: 1,
          file_path: response.file_path || '',
          match_explanation: '',
          matching_chunks: [],
        },
        response.full_recipe as JamieOliverRecipe,
        recipe.id - 1
      );
    }
  } catch (error) {
    console.warn(`Could not load recipe ${recipe.backendId} from API, trying local fallback`, error);
  }

  // Final fallback for older bundled recipes.
  try {
    const fullRecipe = await loadRecipeFromLocal(recipe.backendId);
    if (!fullRecipe) {
      console.warn(`Could not load recipe ${recipe.backendId} from API or local files`);
      return recipe;
    }

    return transformRecipeMatch(
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
      recipe.id - 1
    );
  } catch (error) {
    console.error(`Error loading full recipe for ${recipe.backendId}:`, error);
    return recipe;
  }
};

const loadRecipeForSelection = async (recipeId: string): Promise<Recipe | null> => {
  try {
    const response = await getRecipeById(recipeId);
    if (response.full_recipe && 'recipe' in response.full_recipe) {
      return transformRecipeMatch(
        {
          recipe_id: recipeId,
          title: response.title || recipeId,
          similarity_score: 1,
          combined_score: 1,
          file_path: response.file_path || '',
          match_explanation: '',
          matching_chunks: [],
        },
        response.full_recipe as JamieOliverRecipe,
        0
      );
    }
  } catch (error) {
    console.warn(`Could not load recipe ${recipeId} from API, trying local fallback`, error);
  }

  const localRecipe = await loadRecipeFromLocal(recipeId);
  if (!localRecipe) {
    return null;
  }

  return transformRecipeMatch(
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
};

export function ChatView({
  initialMessage,
  onRecipeClick,
  onPromptClick,
  onClearInitialMessage,
  onScrollStateChange,
  isChatVisible = true,
  recipeModalOpen = false,
  focusedRecipeBackendId = null,
  onRecipeModalVoiceDockOverlapChange,
  onVoiceRecipePaywallRequested,
  onDiscoveryVoiceSessionChange,
  recipeAccessMap = {},
  recipeAccessLoadingId = null,
  onPrefetchChatRecipeAccess,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>(loadMessagesFromStorage);
  const rollerMessages = useMemo<RollerMessage[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        type: message.type,
        content: message.content,
        isStreaming: message.isStreaming,
        voiceExpandable: isVoiceExpandableMessage(message),
      })),
    [messages],
  );
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [displayedThinkingText, setDisplayedThinkingText] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Fresh messages for voice callbacks without stale closures (NEU-620). */
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  /** Set after hook init so transcripts can invoke interrupt without reordering deps. */
  const interruptVoiceRef = useRef<() => void>(() => {});

  // Shared session ID for both text and voice chat (ensures unified experience)
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  const visibleChatRecipeBackendIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      message.recipes?.forEach((recipe) => {
        if (recipe.backendId) {
          ids.add(recipe.backendId);
        }
      });
      if (message.recipeDetail?.recipe_id) {
        ids.add(message.recipeDetail.recipe_id);
      }
      const featured = message.process?.featured;
      if (featured?.kind === 'recipe' && featured.recipe.backendId) {
        ids.add(featured.recipe.backendId);
      }
    }
    return [...ids];
  }, [messages]);

  const onPrefetchChatRecipeAccessRef = useRef(onPrefetchChatRecipeAccess);
  onPrefetchChatRecipeAccessRef.current = onPrefetchChatRecipeAccess;

  useEffect(() => {
    if (visibleChatRecipeBackendIds.length === 0) {
      return;
    }
    onPrefetchChatRecipeAccessRef.current?.(visibleChatRecipeBackendIds);
  }, [visibleChatRecipeBackendIds]);

  const resolveCommerceBadgeForBackendId = useCallback((backendId?: string | null): RecipeCommerceBadge | null => {
    if (!backendId) {
      return null;
    }
    const access = recipeAccessMap[backendId] ?? null;
    const isLoading = recipeAccessLoadingId === backendId;
    return getRecipeCommerceBadge(access, isLoading);
  }, [recipeAccessMap, recipeAccessLoadingId]);

  const resolveCommerceBadgeForRecipe = useCallback((recipe: Recipe): RecipeCommerceBadge | null => {
    return resolveCommerceBadgeForBackendId(recipe.backendId ?? null);
  }, [resolveCommerceBadgeForBackendId]);

  const renderCommerceBadgeChip = useCallback((badge: RecipeCommerceBadge | null) => {
    if (!badge) {
      return null;
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-white text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{
          height: '24px',
          padding: '4px 10px',
          borderRadius: '999px',
          ...RECIPE_COMMERCE_BADGE_STYLES[badge.tone],
        }}
      >
        {badge.label}
      </span>
    );
  }, []);

  const openRecipeModalFromDetail = useCallback(
    async (detail: RecipeDetailData) => {
      const stub = transformRecipeFromSummary(backendSummaryFromRecipeDetail(detail), 0);
      const complete = await ensureRecipeHasPayload(stub);
      onRecipeClick(complete);
    },
    [onRecipeClick],
  );

  const openRecipeModalFromDetailRef = useRef(openRecipeModalFromDetail);
  openRecipeModalFromDetailRef.current = openRecipeModalFromDetail;

  // Voice mode state
  const voiceMessageRef = useRef<string | null>(null);
  const voiceMessageIdRef = useRef<string | null>(null);
  const voiceResponseAccumulatorRef = useRef<string>('');
  const voiceStreamStateRef = useRef(createChatTurnStreamState());
  const [voiceAutoExpandMessageId, setVoiceAutoExpandMessageId] = useState<string | null>(null);

  const applyStreamToVoiceMessage = useCallback((event: ChatEvent) => {
    const messageId = voiceMessageIdRef.current;
    if (!messageId) return;
    voiceStreamStateRef.current = reduceChatStreamEvent(voiceStreamStateRef.current, event);
    const patch = messagePatchFromStreamState(voiceStreamStateRef.current);
    if (patch.recipes?.length || patch.recipeDetail?.recipe_id) {
      setVoiceAutoExpandMessageId(messageId);
    }
    setMessages(prev =>
      prev.map(msg => (msg.id === messageId ? { ...msg, ...patch } : msg)),
    );
  }, []);

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
    notifyFocusedRecipe,
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
        const openDetail = getRecipeDetailForOpenIntent(
          messagesRef.current,
          normalizedText,
        );
        if (openDetail && shouldOpenRecipeFromVoiceUtterance(normalizedText)) {
          interruptVoiceRef.current();
          const userMessage: Message = {
            id: Date.now().toString(),
            type: 'user',
            content: normalizedText,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, userMessage]);
          setIsTyping(false);
          setThinkingStatus(null);
          void openRecipeModalFromDetailRef.current(openDetail);
          return;
        }

        // Finalize any in-flight Jamie turn before starting a new one. Without
        // this, barge-in leaves the prior message stuck at isStreaming:true
        // and later tool payloads can attach to the wrong turn.
        const previousStreamingId = voiceMessageIdRef.current;
        if (previousStreamingId) {
          const accumulatedText = voiceResponseAccumulatorRef.current;
          setMessages(prev => prev.map(msg => {
            if (msg.id !== previousStreamingId) return msg;
            const content = (msg.content || accumulatedText || '').trim();
            return { ...msg, content, isStreaming: false };
          }));
        }

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
        voiceStreamStateRef.current = createChatTurnStreamState();

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
      voiceResponseAccumulatorRef.current += text;
      applyStreamToVoiceMessage({
        type: 'text_chunk',
        content: text,
      });
      if (thinkingStatus) {
        setThinkingStatus(null);
      }
    },
    onRecipes: (data) => {
      applyStreamToVoiceMessage({
        type: 'recipes',
        content: '',
        metadata: (data ?? {}) as ChatEvent['metadata'],
      });
    },
    onMealPlan: (data) => {
      applyStreamToVoiceMessage({
        type: 'meal_plan',
        content: '',
        metadata: (data ?? {}) as ChatEvent['metadata'],
      });
    },
    onRecipeDetail: (data) => {
      applyStreamToVoiceMessage({
        type: 'recipe_detail',
        content: '',
        metadata: (data ?? {}) as ChatEvent['metadata'],
      });
    },
    onShoppingList: (data) => {
      applyStreamToVoiceMessage({
        type: 'shopping_list',
        content: '',
        metadata: (data ?? {}) as ChatEvent['metadata'],
      });
    },
    onRecipePaywallRequested: (payload) => {
      if (payload.backend_recipe_id) {
        applyStreamToVoiceMessage({
          type: 'recipe_paywall_requested',
          content: '',
          metadata: {
            backend_recipe_id: payload.backend_recipe_id,
            tool_call_id: payload.tool_call_id,
            response_id: payload.response_id,
          },
        });
        onVoiceRecipePaywallRequested?.(payload.backend_recipe_id);
      }
    },
    onSpendMandateConsentRequested: (payload) => {
      applyStreamToVoiceMessage({
        type: 'spend_mandate_consent_requested',
        content: '',
        metadata: {
          backend_recipe_id: payload.backend_recipe_id,
          tool_call_id: payload.tool_call_id,
          response_id: payload.response_id,
          price_amount: payload.price_amount,
          currency_code: payload.currency_code,
          ceiling_amount: payload.ceiling_amount,
        },
      });
    },
    onDone: () => {
      // Finalize the voice message
      if (voiceMessageIdRef.current) {
        const messageId = voiceMessageIdRef.current;
        const accumulatedText = voiceResponseAccumulatorRef.current;

        console.log('🎤 Voice response done:', { messageId, textLength: accumulatedText.length });

        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId) {
            const content = (msg.content || accumulatedText || '').trim();
            return { ...msg, content, isStreaming: false };
          }
          return msg;
        }));
      }
      voiceMessageIdRef.current = null;
      voiceResponseAccumulatorRef.current = '';
      voiceStreamStateRef.current = createChatTurnStreamState();
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
      voiceStreamStateRef.current = createChatTurnStreamState();
      setIsTyping(false);
      setThinkingStatus(null);
    },
  });
  interruptVoiceRef.current = interrupt;

  useEffect(() => {
    // Reserve RecipeModal scroll space whenever the sheet is open — launcher strip or active dock.
    onRecipeModalVoiceDockOverlapChange?.(Boolean(recipeModalOpen));
  }, [recipeModalOpen, onRecipeModalVoiceDockOverlapChange]);

  useEffect(() => {
    onDiscoveryVoiceSessionChange?.(isVoiceActive);
  }, [isVoiceActive, onDiscoveryVoiceSessionChange]);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        markAppLoadStage('chat_shell_ready');
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    return () => {
      onDiscoveryVoiceSessionChange?.(false);
    };
  }, [onDiscoveryVoiceSessionChange]);

  useEffect(() => {
    if (!isVoiceConnected) return;
    notifyFocusedRecipe(
      recipeModalOpen && focusedRecipeBackendId ? focusedRecipeBackendId : null,
    );
  }, [
    isVoiceConnected,
    recipeModalOpen,
    focusedRecipeBackendId,
    notifyFocusedRecipe,
  ]);

  useEffect(() => {
    if (!isChatVisible && (isVoiceConnected || isVoiceActive || isPausedByVisibility)) {
      disconnectVoice();
    }
  }, [
    disconnectVoice,
    isChatVisible,
    isPausedByVisibility,
    isVoiceActive,
    isVoiceConnected,
  ]);

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
  const avatarState: 'muted' | 'speaking' | 'listening' | 'thinking' | 'idle' =
    isMicMuted
      ? 'muted'
      : isSpeaking
        ? 'speaking'
        : isProcessing
          ? 'thinking'
          : isListening
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
    onScrollStateChange?.(scrollTop > 10);
  }, [onScrollStateChange]);

  useEffect(() => {
    if (!hasMessages || isVoiceActive) {
      onScrollStateChange?.(false);
    }
  }, [hasMessages, isVoiceActive, onScrollStateChange]);

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

    if (userAffirmsGoToFullRecipe(text)) {
      const focusedDetail = getRecipeDetailForOpenIntent(messages, text);
      if (focusedDetail) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setIsTyping(false);
        setThinkingStatus(null);

        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          content: text,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        await openRecipeModalFromDetail(focusedDetail);
        return;
      }
    }

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
    let streamState = createChatTurnStreamState();

    try {
      for await (const event of chatWithAgent(text, sessionId, {
        focusedRecipeBackendId:
          recipeModalOpen && focusedRecipeBackendId ? focusedRecipeBackendId : undefined,
      })) {
        streamState = reduceChatStreamEvent(streamState, event);
        const streamPatch = messagePatchFromStreamState(streamState);
        fullResponse = streamState.text;

        if (event.type === 'text_chunk') {
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? { ...msg, ...streamPatch }
              : msg
          ));
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
        } else if (
          event.type === 'recipes'
          || event.type === 'meal_plan'
          || event.type === 'recipe_detail'
          || event.type === 'shopping_list'
          || event.type === 'spend_mandate_consent_requested'
          || event.type === 'recipe_paywall_requested'
        ) {
          if (event.type === 'recipe_paywall_requested') {
            const backendId = (event.metadata?.backend_recipe_id as string | undefined)?.trim();
            if (backendId) {
              onVoiceRecipePaywallRequested?.(backendId);
            }
          }
          setMessages(prev => prev.map(msg => {
            if (msg.id !== streamingMessageId) return msg;
            const featured = msg.process
              ? selectFeatured({
                  tool: msg.process.tool,
                  recipes: streamPatch.recipes,
                  mealPlan: streamPatch.mealPlan,
                  recipeDetail: streamPatch.recipeDetail,
                  shoppingList: streamPatch.shoppingList,
                })
              : undefined;
            return {
              ...msg,
              ...streamPatch,
              process: msg.process ? { ...msg.process, featured } : msg.process,
            };
          }));
        } else if (event.type === 'done') {
          setThinkingStatus(null);
          setIsTyping(false);

          setMessages(prev => prev.map(msg => {
            if (msg.id !== streamingMessageId) return msg;
            const updated: Message = {
              ...msg,
              ...streamPatch,
              isStreaming: false,
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
                featured: selectFeatured({
                  tool: updated.process.tool,
                  recipes: streamPatch.recipes,
                  mealPlan: streamPatch.mealPlan,
                  recipeDetail: streamPatch.recipeDetail,
                  shoppingList: streamPatch.shoppingList,
                }),
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

  const toggleMessageExpansion = useCallback((messageId: string) => {
    setExpandedMessageIds((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }, []);

  const renderFeaturedPayload = useCallback((payload: FeaturedPayload, options?: {
    voiceMode?: boolean;
    voiceRole?: StackRole;
    voiceExpanded?: boolean;
    recipes?: Recipe[];
  }) => {
    switch (payload.kind) {
      case 'recipe':
        return (
          <div data-voice-expandable-card="true">
            <RecipeCarousel
              recipes={options?.recipes?.length ? options.recipes : [payload.recipe]}
              onRecipeClick={async (recipe) => {
                const completeRecipe = await ensureRecipeHasPayload(recipe);
                onRecipeClick(completeRecipe);
              }}
              singleSlide
              voiceMode={options?.voiceMode}
              voiceRole={options?.voiceRole}
              voiceCardExpanded={options?.voiceExpanded}
              resolveCommerceBadge={resolveCommerceBadgeForRecipe}
            />
          </div>
        );
      case 'meal_plan':
        return (
          <div data-voice-expandable-card="true">
            <MealPlanCard
              mealPlan={payload.mealPlan}
              onViewRecipe={async (recipeId) => {
                const transformed = await loadRecipeForSelection(recipeId);
                if (transformed) {
                  onRecipeClick(transformed);
                }
              }}
              onCookRecipe={async (recipeId) => {
                const transformed = await loadRecipeForSelection(recipeId);
                if (transformed) {
                  onRecipeClick(transformed);
                }
              }}
            />
          </div>
        );
      case 'shopping_list':
        return (
          <div data-voice-expandable-card="true">
            <ShoppingListCard shoppingList={payload.shoppingList} />
          </div>
        );
      case 'recipe_detail':
        return (
          <div
            className="bg-white overflow-hidden"
            data-voice-expandable-card="true"
            style={{ borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          >
            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <h3 style={{ fontFamily: 'var(--font-display, Poppins, sans-serif)', fontSize: '16px', fontWeight: 700, color: 'var(--jamie-text-heading, #2C5F5D)', textTransform: 'uppercase', margin: 0, flex: 1 }}>
                {payload.recipe.title}
              </h3>
              {renderCommerceBadgeChip(
                resolveCommerceBadgeForBackendId(payload.recipe.recipe_id),
              )}
            </div>
            {Boolean(
              payload.recipe.estimated_time ||
              payload.recipe.difficulty ||
              payload.recipe.ingredient_count ||
              payload.recipe.step_count,
            ) && (
              <div
                style={{
                  padding: '0 20px 12px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                {payload.recipe.estimated_time && (
                  <span className="jamie-chip">{payload.recipe.estimated_time}</span>
                )}
                {payload.recipe.difficulty && (
                  <span className="jamie-chip">{payload.recipe.difficulty}</span>
                )}
                {payload.recipe.ingredient_count ? (
                  <span className="jamie-chip">
                    {payload.recipe.ingredient_count} ingredients
                  </span>
                ) : null}
                {payload.recipe.step_count ? (
                  <span className="jamie-chip">{payload.recipe.step_count} steps</span>
                ) : null}
              </div>
            )}
            {payload.recipe.description && (
              <div style={{ padding: '0 20px 16px' }}>
                <p style={{ fontFamily: 'var(--font-display, Poppins, sans-serif)', fontSize: '14px', color: 'var(--jamie-text-primary, #234252)', margin: 0, lineHeight: 1.55 }}>
                  {payload.recipe.description}
                </p>
              </div>
            )}
            <div style={{ padding: '0 20px 20px' }}>
              <button
                type="button"
                className="jamie-recipe-modal__header-pill"
                aria-label="View full recipe details"
                onClick={() => void openRecipeModalFromDetail(payload.recipe)}
              >
                View full recipe
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  }, [openRecipeModalFromDetail, onRecipeClick, renderCommerceBadgeChip, resolveCommerceBadgeForBackendId, resolveCommerceBadgeForRecipe]);

  const renderMessageContent = useCallback((message: Message, options?: {
    voiceMode?: boolean;
    voiceContext?: RollerRenderContext;
  }) => {
    const voiceMode = options?.voiceMode ?? false;
    const voiceRole = options?.voiceContext?.role;
    const voiceExpanded = options?.voiceContext?.expanded ?? false;
    const onVoiceToggleExpand = options?.voiceContext?.onToggleExpand;

    if (voiceMode && message.type === 'jamie') {
      const richPreview = getVoiceRichCardPreview(message);
      const isRichCard = isVoiceExpandableMessage(message);
      const hasRecipePayload = Boolean(
        (message.recipes && message.recipes.length > 0)
        || (message.recipeDetail?.recipe_id && message.recipeDetail.title),
      );
      // Recipe results must stay visible on the top card — collapsing them into
      // the tiny preview bubble hid cards users thought were missing entirely.
      const showCompactPreview =
        isRichCard &&
        richPreview &&
        !hasRecipePayload &&
        (voiceRole !== 'top' || !voiceExpanded);

      if (showCompactPreview) {
        const primaryBackendId =
          message.recipes?.[0]?.backendId
          ?? message.recipeDetail?.recipe_id
          ?? null;
        const commerceBadge = resolveCommerceBadgeForBackendId(primaryBackendId);
        const previewWithCommerce = commerceBadge
          ? {
              ...richPreview,
              chips: [
                commerceBadge.label,
                ...richPreview.chips.filter((chip) => chip !== commerceBadge.label),
              ].slice(0, 3),
            }
          : richPreview;

        return (
          <VoiceRichCardPreview
            preview={previewWithCommerce}
            onExpand={voiceRole === 'top' ? onVoiceToggleExpand : undefined}
            interactive={voiceRole === 'top'}
          />
        );
      }
    }

    if (message.type === 'jamie') {
      const mandateConsentPart = message.toolParts?.find(
        (part) => part.outputKind === 'mandate_consent',
      );
      const mandateBackendId =
        mandateConsentPart?.paywallBackendId
        ?? message.recipeDetail?.recipe_id
        ?? undefined;

      return (
        <>
          {message.process ? (
            <div
              data-voice-expandable-card={
                voiceMode && message.process.featured ? 'true' : undefined
              }
            >
              <ProcessCard
                state={message.process}
                renderFeatured={(payload) => renderFeaturedPayload(payload, {
                  voiceMode,
                  voiceRole,
                  voiceExpanded,
                  recipes: message.recipes,
                })}
                className={voiceMode ? 'process-card--embedded' : undefined}
              />
              {mandateConsentPart && (
                <SpendMandateConsentInline
                  backendRecipeId={mandateBackendId}
                  className="mt-3"
                />
              )}
            </div>
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
              const voiceFeatured = voiceMode ? resolveVoiceFeatured(message) : null;
              const hasRecipes = !!(message.recipes && message.recipes.length > 0);
              const hasMealPlan = !!message.mealPlan;
              const hasShopping = !!message.shoppingList;
              const hasRecipeDetail = !!(
                message.recipeDetail?.recipe_id && message.recipeDetail.title
              );
              const hasStructuredPayload = voiceMode
                ? Boolean(voiceFeatured)
                : hasRecipes || hasMealPlan || hasShopping || hasRecipeDetail;
              const hasAnyBody =
                !!message.content ||
                hasRecipes ||
                hasMealPlan ||
                hasShopping ||
                hasRecipeDetail;
              const isForming =
                voiceMode &&
                Boolean(message.isStreaming) &&
                !message.content.trim() &&
                !hasStructuredPayload;
              if (!hasAnyBody && !isForming) return null;
              const hasLongText =
                !!message.content &&
                message.content.trim().length > JAMIE_MESSAGE_COLLAPSE_CHAR_THRESHOLD;
              const isExpanded = !!expandedMessageIds[message.id];
              const normalizedContent = (message.content || '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

              const cardClassName = voiceMode
                ? 'jamie-voice-message'
                : 'jamie-thread-card jamie-thread-card--jamie';

              const speakerBadge = (
                <div className="jamie-thread-speaker">
                  <JamieHeart className="jamie-thread-speaker__heart" />
                  <span>Jamie</span>
                </div>
              );

              const voiceExpandedHeroBlock =
                voiceMode && voiceExpanded && voiceFeatured ? (
                  <div className="mt-3 mb-3">
                    {renderFeaturedPayload(voiceFeatured.featured, {
                      voiceMode,
                      voiceRole,
                      voiceExpanded,
                      recipes:
                        voiceFeatured.featured.kind === 'recipe'
                          ? [...(voiceFeatured.recipes ?? [voiceFeatured.featured.recipe])]
                          : message.recipes,
                    })}
                  </div>
                ) : null;

              const markdownBlock = message.content ? (
                <div
                  className={`jamie-thread-markdown prose prose-sm max-w-none ${
                    hasLongText && !isExpanded && !voiceMode
                      ? 'jamie-thread-markdown--collapsed'
                      : ''
                  }`}
                >
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h3 className="text-lg font-bold mt-5 mb-3" style={{ color: 'var(--jamie-text-heading)' }}>{children}</h3>,
                      h2: ({ children }) => <h4 className="text-base font-bold mt-4 mb-3" style={{ color: 'var(--jamie-text-heading)' }}>{children}</h4>,
                      h3: ({ children }) => <h5 className="text-base font-semibold mt-4 mb-2" style={{ color: 'var(--jamie-text-heading)' }}>{children}</h5>,
                      p: ({ children }) => (
                        <p
                          className="mb-4 last:mb-0"
                          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}
                        >
                          {children}
                        </p>
                      ),
                      strong: ({ children }) => <strong className="font-semibold" style={{ color: 'var(--jamie-text-heading)' }}>{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-2">{children}</ol>,
                      li: ({ children }) => <li className="mb-1" style={{ whiteSpace: 'pre-wrap' }}>{children}</li>,
                      hr: () => <hr className="my-4 border-black/10" />,
                    }}
                  >
                    {normalizedContent}
                  </ReactMarkdown>
                  {message.isStreaming && (
                    voiceMode ? (
                      <motion.span
                        animate={{ opacity: [0.35, 0.9, 0.35] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                        className="jamie-voice-stream-caret"
                        aria-hidden="true"
                      />
                    ) : (
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="inline-block ml-0.5"
                      >
                        ▊
                      </motion.span>
                    )
                  )}
                </div>
              ) : null;

              const hideAuxiliaryPayloadBlocks =
                voiceMode && voiceExpanded && Boolean(voiceFeatured);

              const mandateConsentBlock = mandateConsentPart ? (
                <SpendMandateConsentInline
                  backendRecipeId={mandateBackendId}
                  className="jamie-thread-card__payload"
                />
              ) : null;

              const payloadBlocks = (
                <>
                  {mandateConsentBlock}
                  {hasRecipes && !hideAuxiliaryPayloadBlocks && (
                    <div className={voiceMode ? 'mt-3' : 'jamie-thread-card__payload'}>
                      <RecipeCarousel
                        recipes={message.recipes!}
                        onRecipeClick={async (recipe) => {
                          const completeRecipe = await ensureRecipeHasPayload(recipe);
                          onRecipeClick(completeRecipe);
                        }}
                        singleSlide
                        voiceMode={voiceMode}
                        voiceRole={voiceRole}
                        voiceCardExpanded={voiceExpanded}
                        resolveCommerceBadge={resolveCommerceBadgeForRecipe}
                      />
                    </div>
                  )}

                  {hasMealPlan && !hideAuxiliaryPayloadBlocks && (
                    <div className="jamie-thread-card__payload">
                      <MealPlanCard
                        mealPlan={message.mealPlan!}
                        onViewRecipe={async (recipeId) => {
                          const transformed = await loadRecipeForSelection(recipeId);
                          if (transformed) {
                            onRecipeClick(transformed);
                          }
                        }}
                        onCookRecipe={async (recipeId) => {
                          const transformed = await loadRecipeForSelection(recipeId);
                          if (transformed) {
                            onRecipeClick(transformed);
                          }
                        }}
                      />
                    </div>
                  )}

                  {hasShopping && !hideAuxiliaryPayloadBlocks && (
                    <div className="jamie-thread-card__payload">
                      <ShoppingListCard shoppingList={message.shoppingList!} />
                    </div>
                  )}

                  {hasRecipeDetail && !hideAuxiliaryPayloadBlocks && (
                    <div className={voiceMode ? 'mt-3' : 'jamie-thread-card__payload'}>
                      {renderFeaturedPayload(
                        { kind: 'recipe_detail', recipe: message.recipeDetail! },
                        { voiceMode, voiceRole, voiceExpanded },
                      )}
                    </div>
                  )}
                </>
              );

              if (voiceMode) {
                return (
                  <div
                    className={cardClassName}
                    data-voice-forming={isForming ? 'true' : undefined}
                    data-voice-expandable-card={
                      hasStructuredPayload ? 'true' : undefined
                    }
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {isForming ? (
                        <VoiceThinkingBubble key="forming" />
                      ) : (
                        <motion.div
                          key="body"
                          className="jamie-voice-message__body"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                        >
                          {speakerBadge}
                          {voiceExpandedHeroBlock}
                          {markdownBlock}
                          {hasLongText && !message.isStreaming && !voiceMode && !isExpanded && (
                            <button
                              type="button"
                              className="jamie-thread-card__expand"
                              onClick={() => toggleMessageExpansion(message.id)}
                            >
                              {isExpanded ? 'Show less' : 'Read more'}
                            </button>
                          )}
                          {payloadBlocks}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              return (
                <div className={cardClassName}>
                  {speakerBadge}
                  {markdownBlock}
                  {hasLongText && !message.isStreaming && (
                    <button
                      type="button"
                      className="jamie-thread-card__expand"
                      onClick={() => toggleMessageExpansion(message.id)}
                    >
                      {isExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                  {payloadBlocks}
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
  }, [expandedMessageIds, renderFeaturedPayload, onRecipeClick, toggleMessageExpansion, resolveCommerceBadgeForBackendId, resolveCommerceBadgeForRecipe]);

  return (
    <div
      className="relative jamie-view-shell"
      data-testid="chat-shell"
      data-voice-active={isVoiceActive || undefined}
    >
      {/* Empty State */}
      {!hasMessages && !isTyping ? (
        <OnboardingEmptyState
          onStart={handlePromptButtonClick}
          onVoiceStart={toggleVoiceMode}
          voiceState={
            voiceState === 'connecting'
              ? 'connecting'
              : voiceState !== 'idle'
                ? 'listening'
                : 'idle'
          }
        />
      ) : isVoiceActive ? (
        /*
         * Voice Mode — stacked roller of "alive" cards.
         *
         * We intentionally DO NOT wrap this in `.jamie-scroll-area`: a
         * scrollable ancestor would steal vertical gestures from the stack
         * on some devices. The roller uses pointer drag on the top card for
         * stack navigation; `touch-action: pan-y` on the stage and top card
         * lets the inner card body scroll while Jamie streams (NEU-621).
         */
        <div className="jamie-voice-stage">
          <div className="jamie-shell-width jamie-voice-stage__inner">
            <VoiceModeRoller
              messages={rollerMessages}
              autoExpandMessageId={voiceAutoExpandMessageId}
              renderMessage={(msg, context) => {
                const fullMessage = messages.find(m => m.id === msg.id);
                if (!fullMessage) return null;
                return renderMessageContent(fullMessage, {
                  voiceMode: true,
                  voiceContext: context,
                });
              }}
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

      {/* Voice paused (tab/app background): floating notice — not a chat message */}
      {isPausedByVisibility && (
        <div
          className="jamie-shell-width mx-auto px-5 pb-3 pt-1"
          style={{ flexShrink: 0 }}
          role="status"
          aria-live="polite"
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 border border-[rgba(50,113,121,0.28)] bg-[rgba(163,227,216,0.44)] px-4 py-3 dark:border-teal-400/22 dark:bg-[#2a3f3d]"
            style={{
              borderRadius: 'var(--jamie-radius-xl)',
              boxShadow: 'var(--jamie-shadow-soft)',
            }}
          >
            <p
              className="min-w-[min(100%,220px)] flex-1 text-sm leading-snug text-[#1a3634] dark:text-white/90"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Voice mode paused. Tap to continue or use the voice button.
            </p>
            <button
              type="button"
              onClick={resumeFromVisibility}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold leading-none tracking-tight text-white transition-opacity hover:opacity-90"
              style={{
                fontFamily: 'var(--font-display)',
                backgroundColor: 'var(--jamie-primary-dark, #327179)',
                boxShadow: '0 2px 10px rgba(50, 113, 121, 0.35)',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Voice Mode Footer — portaled above fullscreen RecipeModal when open (NEU-619) */}
      <AnimatePresence>
        {isVoiceActive && !recipeModalOpen && (
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
      {recipeModalOpen
        ? createPortal(
            <div
              className="jamie-voice-dock-over-modal"
              role="region"
              aria-label="Jamie recipe voice assistant"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isVoiceActive ? (
                  <motion.div
                    key="recipe-modal-voice-active"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    className="jamie-voice-dock-shell"
                  >
                    <div className="jamie-shell-width">
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
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="recipe-modal-voice-launcher"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    className="jamie-voice-dock-shell"
                  >
                    <div className="jamie-shell-width">
                      <div className="jamie-recipe-modal-voice-launcher">
                        <motion.button
                          type="button"
                          className="jamie-recipe-modal-voice-launcher__btn"
                          onClick={
                            isPausedByVisibility ? resumeFromVisibility : () => void toggleVoiceMode()
                          }
                          disabled={
                            (isTyping && !isVoiceActive && !isPausedByVisibility) ||
                            voiceState === 'connecting'
                          }
                          whileTap={{ scale: 0.96 }}
                          aria-label={isPausedByVisibility ? 'Resume voice conversation' : 'Talk to Jamie'}
                        >
                          {voiceState === 'connecting' ? (
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              style={{ display: 'flex', alignItems: 'center' }}
                            >
                              <Loader2 size={17} strokeWidth={2.2} />
                            </motion.span>
                          ) : (
                            <motion.span
                              animate={{ scale: [1, 1.12, 1] }}
                              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                              style={{ display: 'flex', alignItems: 'center' }}
                            >
                              <Mic size={17} strokeWidth={2.2} />
                            </motion.span>
                          )}
                          {voiceState === 'connecting'
                            ? 'Connecting…'
                            : isPausedByVisibility
                              ? 'Tap to resume'
                              : 'Talk to Jamie'}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}

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
          </div>
        </div>
      )}
    </div>
  );
}

export { clearChatHistory } from '../lib/chatStorage';
export default ChatView;
