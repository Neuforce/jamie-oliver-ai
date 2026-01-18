/**
 * API client for jo-sem-search backend
 */

// Get API base URL from environment variable or use default
// @ts-expect-error - Vite provides import.meta.env but TypeScript types may not be fully loaded
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// =============================================================================
// CHAT AGENT TYPES
// =============================================================================

// Recipe info returned from tools
export interface ToolRecipe {
  recipe_id: string;
  title: string;
  description?: string;
  similarity_score?: number;
  servings?: number;
  estimated_time?: string;
  difficulty?: string;
  ingredient_count?: number;
  step_count?: number;
}

// Meal plan structure
export interface MealPlanData {
  occasion: string;
  serves: number;
  courses: {
    starter?: ToolRecipe[];
    main?: ToolRecipe[];
    dessert?: ToolRecipe[];
    side?: ToolRecipe[];
    salad?: ToolRecipe[];
  };
  tips: string[];
}

// Recipe detail structure
export interface RecipeDetailData {
  recipe_id: string;
  title: string;
  description: string;
  servings?: number;
  estimated_time?: string;
  difficulty?: string;
  ingredients: string[];
  steps: string[];
  notes?: string;
}

// Shopping list structure
export interface ShoppingListData {
  recipes_included: string[];
  total_items: number;
  shopping_list: Array<{
    item: string;
    quantity: string;
    notes: string;
  }>;
}

export interface ChatEvent {
  type: 'text_chunk' | 'tool_call' | 'recipes' | 'meal_plan' | 'recipe_detail' | 'shopping_list' | 'done' | 'error';
  content: string;
  metadata?: {
    // Tool call info
    tool_call_id?: string;
    arguments?: Record<string, unknown>;
    // Recipe search results
    recipes?: ToolRecipe[];
    mood?: string;
    mood_explanation?: string;
    // Meal plan
    meal_plan?: MealPlanData;
    occasion?: string;
    serves?: number;
    // Recipe detail
    recipe?: RecipeDetailData;
    // Shopping list
    shopping_list?: ShoppingListData;
    recipes_included?: string[];
    total_items?: number;
  };
}

export interface ChatRequest {
  message: string;
  session_id: string;
}

export interface ChatSyncResponse {
  response: string;
  tool_calls: Array<{
    function: string;
    arguments: Record<string, unknown>;
  }>;
  session_id: string;
}

// =============================================================================
// RECIPE SEARCH TYPES
// =============================================================================

export interface SearchRequest {
  query: string;
  category?: string;
  mood?: string;
  complexity?: string;
  cost?: string;
  ingredients_query?: string;
  top_k?: number;
  similarity_threshold?: number;
  include_full_recipe?: boolean;
  include_chunks?: boolean;
}

export interface RecipeMatchResponse {
  recipe_id: string;
  title: string;
  similarity_score: number;
  combined_score: number;
  category?: string | null;
  mood?: string | null;
  complexity?: string | null;
  cost?: string | null;
  file_path: string;
  match_explanation: string;
  matching_chunks: Array<Record<string, unknown>>;
  full_recipe?: Record<string, unknown> | null;
}

export interface SearchResponse {
  query: string;
  filters_applied: Record<string, unknown>;
  results: RecipeMatchResponse[];
  total: number;
  took_ms: number;
}

export interface SearchOptions {
  category?: string;
  mood?: string;
  complexity?: string;
  cost?: string;
  ingredients_query?: string;
  top_k?: number;
  similarity_threshold?: number;
  include_full_recipe?: boolean;
  include_chunks?: boolean;
}

// =============================================================================
// RECIPE SEARCH FUNCTIONS
// =============================================================================

/**
 * Search recipes using semantic search
 */
export async function searchRecipes(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const requestBody: SearchRequest = {
    query,
    top_k: options.top_k ?? 10,
    similarity_threshold: options.similarity_threshold ?? 0.3,
    include_full_recipe: options.include_full_recipe ?? true,
    include_chunks: options.include_chunks ?? false,
    ...(options.category && { category: options.category }),
    ...(options.mood && { mood: options.mood }),
    ...(options.complexity && { complexity: options.complexity }),
    ...(options.cost && { cost: options.cost }),
    ...(options.ingredients_query && { ingredients_query: options.ingredients_query }),
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/recipes/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorText}`);
    }

    const data: SearchResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Failed to connect to the search API. Please make sure the backend is running.');
    }
    throw error;
  }
}

// =============================================================================
// CHAT AGENT FUNCTIONS
// =============================================================================

/**
 * Chat with Jamie Oliver discovery agent using Server-Sent Events (SSE).
 * 
 * Yields ChatEvent objects as they are received from the server.
 * 
 * @param message - The user's message
 * @param sessionId - Session ID for conversation continuity
 * @yields ChatEvent objects
 */
export async function* chatWithAgent(
  message: string,
  sessionId: string
): AsyncGenerator<ChatEvent, void, unknown> {
  const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat API request failed: ${response.status} ${response.statusText}. ${errorText}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data.trim()) {
            try {
              const event: ChatEvent = JSON.parse(data);
              yield event;
              
              // Stop if we receive done or error
              if (event.type === 'done' || event.type === 'error') {
                return;
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', data, e);
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Chat with Jamie Oliver discovery agent (non-streaming).
 * 
 * Returns the complete response instead of streaming.
 * 
 * @param message - The user's message
 * @param sessionId - Session ID for conversation continuity
 * @returns Complete chat response
 */
export async function chatWithAgentSync(
  message: string,
  sessionId: string
): Promise<ChatSyncResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/chat/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat API request failed: ${response.status} ${response.statusText}. ${errorText}`);
  }

  return response.json();
}

/**
 * Clear a chat session's memory.
 * 
 * @param sessionId - Session ID to clear
 */
export async function clearChatSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/chat/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to clear chat session: ${response.status} ${response.statusText}. ${errorText}`);
  }
}

/**
 * Generate a unique session ID for chat.
 */
export function generateSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
