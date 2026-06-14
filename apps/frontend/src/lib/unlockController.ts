import type { Recipe } from '../data/recipes';
import type { RecipeAccessResponse } from './api';
import { resolveAskWithServer, setUnlockState } from './commerceStore';
import type { PurchaseRecipeOutcome } from './supertab';

type UnlockTrigger = 'paywall_event' | 'consent_approve';
type SettlementTrigger = UnlockTrigger | 'direct';

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
    options: RunPurchaseOptions,
  ) => Promise<PurchaseRecipeOutcome>;
  onAlreadyUnlocked: (recipe: Recipe, access: RecipeAccessResponse) => Promise<void>;
  onPurchaseResolved: (
    recipe: Recipe,
    access: RecipeAccessResponse,
    outcome: PurchaseRecipeOutcome,
  ) => Promise<void>;
  onUnavailable: () => void;
  onSettlementRequired: () => void;
  onRecipeNotFound: () => void;
  onAccessUnavailable: () => void;
  onError: (error: unknown) => void;
  /** Runs hosted settlement checkout for the recipe (needsCheckout CTA). */
  runCheckout: (
    recipe: Recipe,
    access: RecipeAccessResponse,
  ) => Promise<PurchaseRecipeOutcome>;
  /** Opens the Connect My Tab flow (noTab CTA). */
  connectTab?: () => void;
}

export interface RunPurchaseOptions {
  /** True when the user has already granted spend-mandate consent. */
  consentGranted: boolean;
}

export interface StartUnlockOptions {
  trigger: SettlementTrigger;
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

function runRecipeTask(recipeId: string, run: () => Promise<void>): Promise<void> {
  const current = inFlightByRecipe.get(recipeId);
  if (current) {
    return current;
  }
  const task = run().finally(() => {
    const active = inFlightByRecipe.get(recipeId);
    if (active === task) {
      inFlightByRecipe.delete(recipeId);
    }
  });
  inFlightByRecipe.set(recipeId, task);
  return task;
}

export function startRecipeUnlock(backendRecipeId: string, options: StartUnlockOptions): Promise<void> {
  const recipeId = backendRecipeId.trim();
  if (!recipeId) {
    return Promise.resolve();
  }
  return runRecipeTask(recipeId, () => runUnlock(recipeId, options));
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
  const transition = (state: Parameters<typeof setUnlockState>[1]): void => {
    console.info('[unlock] runUnlock state', { recipeId: backendRecipeId, state, trigger: options.trigger });
    setUnlockState(backendRecipeId, state);
  };
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
        transition('unlocked');
        await activeConfig.onAlreadyUnlocked(recipe, access);
      }
      return;
    }

    // consent_approve: the user already approved, so the purchase may mint a
    // mandate as a guaranteed fallback. paywall_event: first attempt without
    // consent so it can never auto-mint; only after explicit approval do we
    // retry with consentGranted=true.
    const consentAlreadyGranted =
      options.trigger === 'consent_approve' || options.trigger === 'direct';
    if (consentAlreadyGranted) {
      transition('processing');
    }
    let outcome = await activeConfig.runPurchase(recipe, access, {
      consentGranted: consentAlreadyGranted,
    });
    if (outcome.via === 'abandoned') {
      if (options.trigger === 'paywall_event') {
        const approved = await activeConfig.openConsentAsk({
          recipeId: backendRecipeId,
          priceAmount: access.offering?.priceAmount ?? 5,
          currencyCode: access.offering?.currencyCode ?? 'USD',
          ceilingAmount: Math.max(1000, access.offering?.priceAmount ?? 5),
        });
        if (!approved) {
          transition('declined');
          return;
        }
        transition('processing');
        outcome = await activeConfig.runPurchase(recipe, access, { consentGranted: true });
      } else {
        // Consent was just granted; retry once in case mandate projection is still settling.
        outcome = await activeConfig.runPurchase(recipe, access, { consentGranted: true });
      }
    }

    console.info('[unlock] runUnlock outcome', { recipeId: backendRecipeId, via: outcome.via });

    if (outcome.via === 'unavailable') {
      transition('noTab');
      activeConfig.onUnavailable();
      return;
    }

    if (outcome.via === 'tab_settlement_required') {
      transition('needsCheckout');
      activeConfig.onSettlementRequired();
      return;
    }

    if (outcome.resolution) {
      transition('unlocked');
      await activeConfig.onPurchaseResolved(recipe, access, outcome);
      return;
    }

    if (outcome.via === 'abandoned') {
      // Abandoned AFTER consent is a real failure, not a "nothing charged" no-op.
      transition('failed');
    }
  } catch (error) {
    transition('failed');
    activeConfig.onError(error);
  }
}

/**
 * View verb: the user approved the consent card. Sets processing, resolves the
 * ask server-side (grant), then drives the unlock to completion. If a
 * paywall-triggered unlock is already in flight for this recipe, startRecipeUnlock
 * dedupe joins it. Safe to call again as a retry from the 'failed' state — the
 * mandate is already granted so the purchase proceeds.
 */
export async function confirmUnlock(
  recipeId: string,
  userId?: string | null,
): Promise<void> {
  const id = recipeId.trim();
  if (!id) {
    return;
  }
  setUnlockState(id, 'processing');
  await resolveAskWithServer(id, true, userId);
  await startRecipeUnlock(id, { trigger: 'consent_approve' });
}

/** View verb: the user declined. Resolves the ask (decline) and shows declined. */
export async function declineUnlock(
  recipeId: string,
  userId?: string | null,
): Promise<void> {
  const id = recipeId.trim();
  if (!id) {
    return;
  }
  await resolveAskWithServer(id, false, userId);
  setUnlockState(id, 'declined');
}

/** View verb: complete checkout for the needsCheckout state. */
export function requestCheckout(recipeId: string): Promise<void> {
  const id = recipeId.trim();
  if (!id) {
    return Promise.resolve();
  }
  return runRecipeTask(id, async () => {
    const activeConfig = config;
    if (!activeConfig) {
      return;
    }

    const transition = (state: Parameters<typeof setUnlockState>[1]): void => {
      console.info('[unlock] requestCheckout state', { recipeId: id, state });
      setUnlockState(id, state);
    };

    try {
      const recipe = await activeConfig.resolveRecipe(id);
      if (!recipe) {
        transition('failed');
        activeConfig.onRecipeNotFound();
        return;
      }

      const access = activeConfig.getCachedAccess?.(recipe) ?? await activeConfig.loadAccess(recipe);
      if (!access) {
        transition('failed');
        activeConfig.onAccessUnavailable();
        return;
      }

      transition('processing');
      const outcome = await activeConfig.runCheckout(recipe, access);
      console.info('[unlock] requestCheckout outcome', { recipeId: id, via: outcome.via });

      if (outcome.via === 'unavailable') {
        transition('noTab');
        activeConfig.onUnavailable();
        return;
      }

      if (outcome.resolution) {
        transition('unlocked');
        await activeConfig.onPurchaseResolved(recipe, access, outcome);
        return;
      }

      transition('failed');
    } catch (error) {
      transition('failed');
      activeConfig.onError(error);
    }
  });
}

/** View verb: connect a Tab for the noTab state. */
export function connectTab(): void {
  config?.connectTab?.();
}
