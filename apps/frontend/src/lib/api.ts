/**
 * API client for jo-sem-search backend
 */

import { API_BASE_URL } from './runtimeConfig';

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
  ingredient_count?: number;
  step_count?: number;
  ingredients: string[];
  steps: string[];
  notes?: string;
  next_step_hint?: string;
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
  type: 'text_chunk' | 'tool_call' | 'recipes' | 'meal_plan' | 'recipe_detail' | 'shopping_list' | 'spend_mandate_consent_requested' | 'recipe_paywall_requested' | 'done' | 'error';
  content: string;
  metadata?: {
    // Correlation (discovery tool contract)
    tool_call_id?: string;
    response_id?: string;
    // Tool call info
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
    // Spend mandate consent (agentic commerce)
    backend_recipe_id?: string;
    price_amount?: number;
    currency_code?: string;
    ceiling_amount?: number;
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

export interface JamieUserSummary {
  id: string;
  email?: string | null;
  displayName?: string | null;
}

export interface RecipeAccessResponse {
  recipeId: string;
  recipeUuid: string;
  accessState: 'free' | 'locked' | 'owned';
  offering: {
    id: string;
    isFree: boolean;
    contentKey?: string | null;
    priceAmount?: number | null;
    currencyCode?: string | null;
    supertabOfferingId?: string | null;
    supertabExperienceId?: string | null;
  } | null;
  entitlement: {
    id: string;
    status: string;
    grantedAt?: string | null;
    expiresAt?: string | null;
    recursAt?: string | null;
  } | null;
  activeSession: {
    sessionId: string;
    status: string;
    currentStepIndex: number;
    completedStepIds: Array<string | number>;
    lastActiveAt?: string | null;
  } | null;
}

export interface OwnedRecipeSummary {
  recipeId: string;
  recipeUuid: string;
  title: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  purchaseStatus?: string | null;
  ownedAt?: string | null;
  expiresAt?: string | null;
  lastCookedAt?: string | null;
  activeSession: {
    sessionId: string;
    status: string;
    currentStepIndex: number;
    completedStepIds: Array<string | number>;
    lastActiveAt?: string | null;
  } | null;
}

export interface MyRecipesResponse {
  recipes: OwnedRecipeSummary[];
  total: number;
}

export interface SupertabBootstrapRequest {
  provider: 'supertab';
  external_subject_id: string;
  profile?: Record<string, unknown>;
}

export interface SupertabBootstrapResponse {
  user: JamieUserSummary;
}

export interface SupertabPurchaseSyncRequest {
  user_id: string;
  recipe_id: string;
  purchase?: Record<string, unknown> | null;
  prior_entitlement?: Array<Record<string, unknown>>;
}

export interface SupertabPurchaseSyncResponse {
  recipeId: string;
  recipeUuid: string;
  offeringId: string;
  purchase?: Record<string, unknown> | null;
  entitlement?: Record<string, unknown> | null;
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

export interface RecipeByIdResponse {
  recipe_id: string;
  title: string;
  category?: string | null;
  mood?: string | null;
  complexity?: string | null;
  cost?: string | null;
  quality_score?: number | null;
  status?: string | null;
  file_path?: string;
  full_recipe?: Record<string, unknown> | null;
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

export async function getRecipeById(recipeId: string): Promise<RecipeByIdResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/recipes/${encodeURIComponent(recipeId)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Recipe request failed: ${response.status} ${response.statusText}. ${errorText}`);
  }

  return response.json() as Promise<RecipeByIdResponse>;
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
  sessionId: string,
  options?: { focusedRecipeBackendId?: string | null },
): AsyncGenerator<ChatEvent, void, unknown> {
  const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      focused_recipe_backend_id: options?.focusedRecipeBackendId?.trim() || undefined,
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

export async function bootstrapSupertabIdentity(
  request: SupertabBootstrapRequest
): Promise<SupertabBootstrapResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/supertab/bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to bootstrap Supertab identity: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getJamieUser(userId: string): Promise<{ user: JamieUserSummary }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/me?user_id=${encodeURIComponent(userId)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Jamie user: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getRecipeAccess(recipeId: string, userId?: string): Promise<RecipeAccessResponse> {
  const url = new URL(`${API_BASE_URL}/api/v1/recipes/${encodeURIComponent(recipeId)}/access`);
  if (userId) {
    url.searchParams.set('user_id', userId);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get recipe access: ${response.status} ${errorText}`);
  }

  const data: RecipeAccessResponse = await response.json();
  // Dev only (default): treat locked as free for easy local cooking unless VITE_RECIPE_ACCESS_STRICT=true.
  const strictRecipeAccess =
    String(import.meta.env.VITE_RECIPE_ACCESS_STRICT || '').toLowerCase() === 'true';
  if (import.meta.env.DEV && !strictRecipeAccess && data.accessState === 'locked') {
    return { ...data, accessState: 'free' };
  }
  return data;
}

export async function getMyRecipes(userId: string): Promise<MyRecipesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/me/recipes?user_id=${encodeURIComponent(userId)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get owned recipes: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function syncSupertabPurchase(
  request: SupertabPurchaseSyncRequest
): Promise<SupertabPurchaseSyncResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/purchases/supertab/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to sync Supertab purchase: ${response.status} ${errorText}`);
  }

  return response.json();
}

// =============================================================================
// AGENTIC PAYMENTS — spend mandates + purchase intents
// =============================================================================

export interface PurchaseIntent {
  intent_type: 'recipe_unlock';
  provider: string;
  user_id: string;
  recipe_slug: string;
  content_key: string;
  price_amount: number;
  currency_code: string;
  mandate_id?: string | null;
  offer: {
    offering_id?: string | null;
    onetime_offering_id?: string | null;
  };
  metadata: Record<string, unknown>;
}

export interface SpendMandate {
  id: string;
  userId: string;
  sessionId?: string | null;
  ceilingAmount: number;
  currencyCode: string;
  consumedAmount: number;
  status: string;
  source: string;
  grantedAt?: string | null;
  expiresAt?: string | null;
  remainingAmount: number;
}

export async function getCurrentSpendMandate(userId: string): Promise<SpendMandate | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/spend-mandates/current?user_id=${encodeURIComponent(userId)}`,
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get spend mandate: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  return data ?? null;
}

export async function createSpendMandate(params: {
  user_id: string;
  ceiling_amount: number;
  currency_code?: string;
  session_id?: string;
  source?: string;
}): Promise<SpendMandate> {
  const response = await fetch(`${API_BASE_URL}/api/v1/spend-mandates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create spend mandate: ${response.status} ${errorText}`);
  }
  return response.json();
}

export async function revokeCurrentSpendMandate(userId: string): Promise<{ revoked: number }> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/spend-mandates/current?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to revoke spend mandate: ${response.status} ${errorText}`);
  }
  return response.json();
}

export interface OnetimeOfferingRequest {
  content_key: string;
  price_amount: number;
  currency_code?: string;
  description: string;
  recipe_slug?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

export interface OnetimeOfferingResponse {
  offering: {
    id: string;
    [key: string]: unknown;
  };
  purchase_intent: PurchaseIntent | null;
}

export async function createOnetimeOffering(
  params: OnetimeOfferingRequest,
): Promise<OnetimeOfferingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/offerings/onetime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create one-time offering: ${response.status} ${errorText}`);
  }
  return response.json();
}
