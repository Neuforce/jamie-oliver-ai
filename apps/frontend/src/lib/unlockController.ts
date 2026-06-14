import type { Recipe } from '../data/recipes';
import type { RecipeAccessResponse } from './api';
import type { PurchaseRecipeOutcome } from './supertab';

type UnlockTrigger = 'paywall_event' | 'consent_approve';

export interface ConsentPromptParams {
  recipeId: string;
  askId?: string;
  priceAmount: number;
  currencyCode: string;
  ceilingAmount: number;
}

export interface UnlockControllerConfig {
  resolveRecipe: (backendRecipeId: string) => Promise<Recipe | null>;
  ensureRecipeVisible?: (recipe: Recipe, backendRecipeId: string) => Promise<void>;
  getCachedAccess?: (recipe: Recipe) => RecipeAccessResponse | null;
  loadAccess: (recipe: Recipe) => Promise<RecipeAccessResponse | null>;
  openConsentAsk: (params: ConsentPromptParams) => Promise<boolean>;
  runPurchase: (
    recipe: Recipe,
    access: RecipeAccessResponse,
  ) => Promise<PurchaseRecipeOutcome>;
  onAlreadyUnlocked: (recipe: Recipe, access: RecipeAccessResponse) => Promise<void>;
  onPurchaseResolved: (
    recipe: Recipe,
    access: RecipeAccessResponse,
    outcome: PurchaseRecipeOutcome,
  ) => Promise<void>;
  onUnavailable: () => void;
  onSettlementRequired: () => void;
  onDeclinedOrAbandoned: () => void;
  onRecipeNotFound: () => void;
  onAccessUnavailable: () => void;
  onError: (error: unknown) => void;
}

export interface StartUnlockOptions {
  trigger: UnlockTrigger;
}

const inFlightByRecipe = new Map<string, Promise<void>>();
let config: UnlockControllerConfig | null = null;

function canStartCooking(access: RecipeAccessResponse | null | undefined): boolean {
  if (!access) {
    return false;
  }
  return access.accessState === 'free' || access.accessState === 'owned';
}

export function configureUnlockController(nextConfig: UnlockControllerConfig): void {
  config = nextConfig;
}

export function resetUnlockControllerForTests(): void {
  config = null;
  inFlightByRecipe.clear();
}

export function startRecipeUnlock(
  backendRecipeId: string,
  options: StartUnlockOptions,
): Promise<void> {
  const recipeId = backendRecipeId.trim();
  if (!recipeId) {
    return Promise.resolve();
  }
  const current = inFlightByRecipe.get(recipeId);
  if (current) {
    return current;
  }

  const task = runUnlock(recipeId, options).finally(() => {
    const active = inFlightByRecipe.get(recipeId);
    if (active === task) {
      inFlightByRecipe.delete(recipeId);
    }
  });
  inFlightByRecipe.set(recipeId, task);
  return task;
}

async function runUnlock(
  backendRecipeId: string,
  options: StartUnlockOptions,
): Promise<void> {
  // Snapshot the config once so a mid-unlock reconfigure (App.tsx reconfigures
  // on frequently-changing deps) can't swap closures partway through a run.
  const activeConfig = config;
  if (!activeConfig) {
    return;
  }
  try {
    const recipe = await activeConfig.resolveRecipe(backendRecipeId);
    if (!recipe) {
      activeConfig.onRecipeNotFound();
      return;
    }

    if (activeConfig.ensureRecipeVisible) {
      await activeConfig.ensureRecipeVisible(recipe, backendRecipeId);
    }

    const access = activeConfig.getCachedAccess?.(recipe) ?? await activeConfig.loadAccess(recipe);
    if (!access) {
      activeConfig.onAccessUnavailable();
      return;
    }

    if (access.accessState !== 'locked') {
      if (canStartCooking(access)) {
        await activeConfig.onAlreadyUnlocked(recipe, access);
      }
      return;
    }

    let outcome = await activeConfig.runPurchase(recipe, access);
    if (outcome.via === 'abandoned') {
      if (options.trigger === 'paywall_event') {
        const approved = await activeConfig.openConsentAsk({
          recipeId: backendRecipeId,
          priceAmount: access.offering?.priceAmount ?? 5,
          currencyCode: access.offering?.currencyCode ?? 'USD',
          ceilingAmount: Math.max(1000, access.offering?.priceAmount ?? 5),
        });
        if (!approved) {
          activeConfig.onDeclinedOrAbandoned();
          return;
        }
        outcome = await activeConfig.runPurchase(recipe, access);
      } else {
        // Consent was just granted; retry once in case mandate projection is still settling.
        outcome = await activeConfig.runPurchase(recipe, access);
      }
    }

    if (outcome.via === 'unavailable') {
      activeConfig.onUnavailable();
      return;
    }

    if (outcome.via === 'tab_settlement_required') {
      activeConfig.onSettlementRequired();
      return;
    }

    if (outcome.resolution) {
      await activeConfig.onPurchaseResolved(recipe, access, outcome);
      return;
    }

    if (outcome.via === 'abandoned') {
      activeConfig.onDeclinedOrAbandoned();
    }
  } catch (error) {
    activeConfig.onError(error);
  }
}
