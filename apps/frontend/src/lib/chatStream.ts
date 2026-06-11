/**
 * Discovery chat stream contract (AI SDK-style parts).
 *
 * Normalizes legacy SSE/WS events into ordered tool invocations bound by
 * toolCallId + responseId. Cards render from the latest card-bearing part
 * in the current turn — not global field priority.
 */

import type {
  ChatEvent,
  MealPlanData,
  RecipeDetailData,
  ShoppingListData,
} from './api';
import type { Recipe } from '../data/recipes';
import type { ToolName } from '../components/ProcessCardTypes';
import { transformRecipeFromSummary, type BackendRecipeSummary } from '../data/recipeTransformer';

export type ToolOutputKind =
  | 'recipes'
  | 'recipe_detail'
  | 'meal_plan'
  | 'shopping_list'
  | 'paywall'
  | 'mandate_consent';

export interface ToolInvocationPart {
  toolCallId: string;
  toolName: ToolName | 'request_supertab_unlock';
  status: 'running' | 'complete' | 'error';
  outputKind?: ToolOutputKind;
  recipes?: Recipe[];
  recipeDetail?: RecipeDetailData;
  mealPlan?: MealPlanData;
  shoppingList?: ShoppingListData;
  paywallBackendId?: string;
  mandatePriceAmount?: number;
  mandateCurrencyCode?: string;
  mandateCeilingAmount?: number;
}

export interface ChatTurnStreamState {
  responseId?: string;
  text: string;
  parts: ToolInvocationPart[];
  isComplete: boolean;
  error?: string;
}

export function createChatTurnStreamState(): ChatTurnStreamState {
  return {
    text: '',
    parts: [],
    isComplete: false,
  };
}

function upsertPart(
  parts: ToolInvocationPart[],
  toolCallId: string,
  patch: Partial<ToolInvocationPart> & Pick<ToolInvocationPart, 'toolCallId'>,
): ToolInvocationPart[] {
  const index = parts.findIndex((part) => part.toolCallId === toolCallId);
  if (index === -1) {
    return [...parts, patch as ToolInvocationPart];
  }
  const next = [...parts];
  next[index] = { ...next[index], ...patch };
  return next;
}

function recipesFromMetadata(recipes: BackendRecipeSummary[] | undefined): Recipe[] {
  if (!recipes?.length) return [];
  return recipes.map((summary, index) => transformRecipeFromSummary(summary, index));
}

/** Apply one wire event to turn state (SSE ChatEvent or normalized voice payload). */
export function reduceChatStreamEvent(
  state: ChatTurnStreamState,
  event: ChatEvent,
): ChatTurnStreamState {
  const meta = event.metadata ?? {};
  const responseId =
    (meta.response_id as string | undefined) ??
    state.responseId;

  if (event.type === 'text_chunk') {
    return {
      ...state,
      responseId,
      text: state.text + event.content,
    };
  }

  if (event.type === 'tool_call') {
    const toolCallId = (meta.tool_call_id as string | undefined) ?? `tool-${Date.now()}`;
    const toolName = event.content as ToolInvocationPart['toolName'];
    return {
      ...state,
      responseId,
      parts: upsertPart(state.parts, toolCallId, {
        toolCallId,
        toolName,
        status: 'running',
      }),
    };
  }

  const toolCallId = meta.tool_call_id as string | undefined;
  if (!toolCallId) {
    if (event.type === 'done') {
      return { ...state, responseId, isComplete: true };
    }
    if (event.type === 'error') {
      return { ...state, responseId, isComplete: true, error: event.content };
    }
    return state;
  }

  const completePatch = { status: 'complete' as const };

  if (event.type === 'recipes') {
    const recipes = recipesFromMetadata(meta.recipes as BackendRecipeSummary[] | undefined);
    return {
      ...state,
      responseId,
      parts: upsertPart(state.parts, toolCallId, {
        toolCallId,
        toolName: 'search_recipes',
        ...completePatch,
        outputKind: 'recipes',
        recipes,
      }),
    };
  }

  if (event.type === 'recipe_detail' && meta.recipe) {
    return {
      ...state,
      responseId,
      parts: upsertPart(state.parts, toolCallId, {
        toolCallId,
        toolName: 'get_recipe_details',
        ...completePatch,
        outputKind: 'recipe_detail',
        recipeDetail: meta.recipe as RecipeDetailData,
      }),
    };
  }

  if (event.type === 'meal_plan' && meta.meal_plan) {
    return {
      ...state,
      responseId,
      parts: upsertPart(state.parts, toolCallId, {
        toolCallId,
        toolName: 'plan_meal',
        ...completePatch,
        outputKind: 'meal_plan',
        mealPlan: meta.meal_plan as MealPlanData,
      }),
    };
  }

  if (event.type === 'shopping_list' && meta.shopping_list) {
    return {
      ...state,
      responseId,
      parts: upsertPart(state.parts, toolCallId,
        {
          toolCallId,
          toolName: 'create_shopping_list',
          ...completePatch,
          outputKind: 'shopping_list',
          shoppingList: meta.shopping_list as ShoppingListData,
        }),
    };
  }

  if (event.type === 'spend_mandate_consent_requested') {
    const backendId = (meta.backend_recipe_id as string | undefined)?.trim();
    const existing = state.parts.find((p) => p.toolCallId === toolCallId);
    return {
      ...state,
      responseId,
      parts: upsertPart(state.parts, toolCallId, {
        toolCallId,
        toolName: 'request_supertab_unlock',
        status: existing?.status ?? 'running',
        outputKind: 'mandate_consent',
        paywallBackendId: backendId,
        mandatePriceAmount: meta.price_amount as number | undefined,
        mandateCurrencyCode: meta.currency_code as string | undefined,
        mandateCeilingAmount: meta.ceiling_amount as number | undefined,
        recipeDetail: existing?.recipeDetail,
        recipes: existing?.recipes,
      }),
    };
  }

  if (event.type === 'recipe_paywall_requested') {
    const backendId = (meta.backend_recipe_id as string | undefined)?.trim();
    const existing = state.parts.find((p) => p.toolCallId === toolCallId);
    return {
      ...state,
      responseId,
      parts: upsertPart(state.parts, toolCallId, {
        toolCallId,
        toolName: 'request_supertab_unlock',
        ...completePatch,
        outputKind: existing?.outputKind === 'mandate_consent' ? 'mandate_consent' : 'paywall',
        paywallBackendId: backendId,
        mandatePriceAmount: existing?.mandatePriceAmount,
        mandateCurrencyCode: existing?.mandateCurrencyCode,
        mandateCeilingAmount: existing?.mandateCeilingAmount,
        recipeDetail: existing?.recipeDetail,
        recipes: existing?.recipes,
      }),
    };
  }

  if (event.type === 'done') {
    return { ...state, responseId, isComplete: true };
  }

  if (event.type === 'error') {
    return { ...state, responseId, isComplete: true, error: event.content };
  }

  return state;
}

/** Latest card-bearing part in this turn (last wins — matches tool call order). */
export function getFeaturedToolPart(parts: ToolInvocationPart[]): ToolInvocationPart | null {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part.outputKind === 'recipe_detail' && part.recipeDetail) return part;
    if (part.outputKind === 'recipes' && part.recipes?.length) return part;
    if (part.outputKind === 'meal_plan' && part.mealPlan) return part;
    if (part.outputKind === 'shopping_list' && part.shoppingList) return part;
    if ((part.outputKind === 'paywall' || part.outputKind === 'mandate_consent') && part.recipeDetail) {
      return part;
    }
  }
  return null;
}

/** Sync legacy message fields from parts for ProcessCard / storage. */
export function legacyFieldsFromStreamState(state: ChatTurnStreamState): {
  recipes?: Recipe[];
  recipeDetail?: RecipeDetailData;
  mealPlan?: MealPlanData;
  shoppingList?: ShoppingListData;
  responseId?: string;
} {
  const featured = getFeaturedToolPart(state.parts);
  if (!featured) {
    return { responseId: state.responseId };
  }

  return {
    responseId: state.responseId,
    recipes: featured.recipes,
    recipeDetail: featured.recipeDetail,
    mealPlan: featured.mealPlan,
    shoppingList: featured.shoppingList,
  };
}

/** Voice WS payload → ChatEvent for the shared reducer. */
export function voiceWireEventToChatEvent(
  eventName: string,
  data: unknown,
  responseId?: string,
): ChatEvent | null {
  const meta = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

  switch (eventName) {
    case 'text_chunk':
      return {
        type: 'text_chunk',
        content: String(data ?? ''),
        metadata: responseId ? { response_id: responseId } : undefined,
      };
    case 'tool_call':
      return {
        type: 'tool_call',
        content: String(meta.name ?? meta.toolName ?? ''),
        metadata: {
          ...meta,
          response_id: (meta.response_id as string | undefined) ?? responseId,
        },
      };
    case 'recipes':
    case 'meal_plan':
    case 'recipe_detail':
    case 'shopping_list':
    case 'spend_mandate_consent_requested':
    case 'recipe_paywall_requested':
      return {
        type: eventName,
        content: '',
        metadata: {
          ...meta,
          response_id: (meta.response_id as string | undefined) ?? responseId,
        },
      };
    case 'done':
      return {
        type: 'done',
        content: '',
        metadata: responseId ? { response_id: responseId } : undefined,
      };
    case 'error':
      return {
        type: 'error',
        content: String(data ?? 'Unknown error'),
        metadata: responseId ? { response_id: responseId } : undefined,
      };
    default:
      return null;
  }
}
