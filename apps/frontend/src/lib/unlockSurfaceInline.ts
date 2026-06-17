import type { Recipe } from '../data/recipes';
import type { RecipeDetailData } from './api';
import { getUnlockState, isUnlockSurfaceState } from './commerceStore';
import type { ToolInvocationPart } from './chatStream';

/** Copy for in-progress unlock affordances (buttons, inline spinner). */
export const RECIPE_UNLOCK_PROCESSING_LABEL = 'Putting it on your Tab…';

export function resolveUnlockSurfaceRecipeId(input: {
  toolParts?: ToolInvocationPart[];
  recipeDetail?: RecipeDetailData;
  recipes?: Recipe[];
}): string | undefined {
  const mandateConsentPart = input.toolParts?.find(
    (part) => part.outputKind === 'mandate_consent',
  );
  if (mandateConsentPart?.paywallBackendId) {
    return mandateConsentPart.paywallBackendId;
  }

  const paywallPart = input.toolParts?.find((part) => part.outputKind === 'paywall');
  if (paywallPart?.paywallBackendId) {
    return paywallPart.paywallBackendId;
  }

  if (input.recipeDetail?.recipe_id) {
    return input.recipeDetail.recipe_id;
  }

  const carouselBackendId = input.recipes?.[0]?.backendId;
  if (carouselBackendId) {
    return carouselBackendId;
  }

  return undefined;
}

/** Whether SpendMandateConsentInline should mount for this Jamie turn. */
export function shouldMountSpendMandateConsentInline(input: {
  toolParts?: ToolInvocationPart[];
  recipeDetail?: RecipeDetailData;
  recipes?: Recipe[];
}): boolean {
  const hasMandateConsentPart = Boolean(
    input.toolParts?.some((part) => part.outputKind === 'mandate_consent'),
  );
  if (hasMandateConsentPart) {
    return true;
  }

  const recipeId = resolveUnlockSurfaceRecipeId(input);
  if (!recipeId) {
    return false;
  }

  return isUnlockSurfaceState(getUnlockState(recipeId));
}

export function isRecipeDetailViewDisabled(recipeBackendId?: string | null): boolean {
  if (!recipeBackendId) {
    return false;
  }
  return getUnlockState(recipeBackendId) === 'processing';
}

export function getRecipeDetailViewLabel(recipeBackendId?: string | null): string {
  if (recipeBackendId && getUnlockState(recipeBackendId) === 'processing') {
    return RECIPE_UNLOCK_PROCESSING_LABEL;
  }
  return 'View full recipe';
}
