import type { Recipe } from '../data/recipes';
import type { PurchaseHold, RecipeAccessResponse } from './api';
import {
  commitPurchaseHold as commitPurchaseHoldRequest,
  undoPurchaseHold as undoPurchaseHoldRequest,
} from './api';
import {
  getActiveAsk,
  getHoldMeta,
  resolveAskWithServer,
  setHoldMeta,
  setUnlockState,
} from './commerceStore';
import { msUntilHoldExpiry } from './purchaseHold';
import type { PurchaseRecipeOutcome } from './supertab';

type UnlockTrigger = 'paywall_event' | 'consent_approve' | 'auto_charge' | 'hold_committed';
type SettlementTrigger = UnlockTrigger | 'direct';

export interface ConsentPromptParams {
  recipeId: string;
  askId?: string;
  priceAmount: number;
  currencyCode: string;
  ceilingAmount: number;
  /** Bypass openAsk guard when falling back from auto-charge processing. */
  force?: boolean;
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
const holdCommitTimers = new Map<string, ReturnType<typeof setTimeout>>();
const holdGenerations = new Map<string, number>();
let config: UnlockControllerConfig | null = null;

function clearHoldTimer(recipeId: string): number {
  const existing = holdCommitTimers.get(recipeId);
  if (existing) {
    clearTimeout(existing);
    holdCommitTimers.delete(recipeId);
  }
  const nextGeneration = (holdGenerations.get(recipeId) ?? 0) + 1;
  holdGenerations.set(recipeId, nextGeneration);
  return nextGeneration;
}

function getPurchaseHoldErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const message = error.message;
  const jsonStart = message.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(message.slice(jsonStart)) as Record<string, unknown>;
      if (typeof parsed.detail === 'string') {
        return parsed.detail;
      }
      if (typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // fall through to substring checks
    }
  }
  for (const code of ['already_undone', 'already_committed', 'already_failed', 'not_yet_expired', 'hold_not_found']) {
    if (message.includes(code)) {
      return code;
    }
  }
  return null;
}

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
  for (const timer of holdCommitTimers.values()) {
    clearTimeout(timer);
  }
  holdCommitTimers.clear();
  holdGenerations.clear();
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

    // consent_approve / auto_charge: purchase may use mandate headroom immediately.
    // paywall_event: first attempt without consent; only after explicit approval
    // do we retry with consentGranted=true.
    const consentAlreadyGranted =
      options.trigger === 'consent_approve'
      || options.trigger === 'direct'
      || options.trigger === 'auto_charge'
      || options.trigger === 'hold_committed';
    if (consentAlreadyGranted) {
      transition('processing');
    }
    let outcome = await activeConfig.runPurchase(recipe, access, {
      consentGranted: consentAlreadyGranted,
    });

    const consentFallbackParams = (): ConsentPromptParams => ({
      recipeId: backendRecipeId,
      priceAmount: access.offering?.priceAmount ?? 5,
      currencyCode: access.offering?.currencyCode ?? 'USD',
      ceilingAmount: Math.max(1000, access.offering?.priceAmount ?? 5),
      force: options.trigger === 'auto_charge',
    });

    const retryAfterConsentFallback = async (): Promise<typeof outcome> => {
      const approved = await activeConfig.openConsentAsk(consentFallbackParams());
      if (!approved) {
        transition('declined');
        return { via: 'abandoned' as const, resolution: null };
      }
      transition('processing');
      return activeConfig.runPurchase(recipe, access, { consentGranted: true });
    };

    if (outcome.via === 'abandoned') {
      if (options.trigger === 'paywall_event' || options.trigger === 'auto_charge') {
        outcome = await retryAfterConsentFallback();
        if (!outcome.resolution && outcome.via === 'abandoned') {
          return;
        }
      } else {
        // Consent was just granted; retry once in case mandate projection is still settling.
        outcome = await activeConfig.runPurchase(recipe, access, { consentGranted: true });
      }
    }

    console.info('[unlock] runUnlock outcome', { recipeId: backendRecipeId, via: outcome.via });

    if (outcome.via === 'unavailable') {
      if (options.trigger === 'auto_charge') {
        outcome = await retryAfterConsentFallback();
        if (!outcome.resolution && (outcome.via === 'abandoned' || outcome.via === 'unavailable')) {
          if (outcome.via === 'abandoned') {
            return;
          }
          transition('noTab');
          activeConfig.onUnavailable();
          return;
        }
      } else {
        transition('noTab');
        activeConfig.onUnavailable();
        return;
      }
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
  const hadPendingAsk = (() => {
    const ask = getActiveAsk();
    return Boolean(ask && ask.recipeId === id && ask.status === 'requested');
  })();
  setUnlockState(id, 'processing');
  const { approved, hold } = await resolveAskWithServer(id, true, userId);
  if (approved && hold) {
    beginPurchaseHold(id, hold);
    return;
  }
  if (approved || !hadPendingAsk) {
    await startRecipeUnlock(id, { trigger: 'consent_approve' });
  }
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

export function beginPurchaseHold(recipeId: string, hold: PurchaseHold): void {
  const id = recipeId.trim();
  if (!id) {
    return;
  }
  const generation = clearHoldTimer(id);
  setHoldMeta(id, {
    holdId: hold.id,
    holdExpiresAt: hold.holdExpiresAt ?? new Date().toISOString(),
    priceAmount: hold.priceAmount,
    currencyCode: hold.currencyCode,
  });
  setUnlockState(id, 'holding');
  const delayMs = msUntilHoldExpiry(hold);
  const timer = setTimeout(() => {
    if (holdGenerations.get(id) !== generation) {
      return;
    }
    void commitPurchaseHold(id);
  }, delayMs);
  holdCommitTimers.set(id, timer);
}

export async function commitPurchaseHold(recipeId: string): Promise<void> {
  const id = recipeId.trim();
  if (!id) {
    return;
  }
  clearHoldTimer(id);

  const meta = getHoldMeta(id);
  if (!meta) {
    return;
  }

  setUnlockState(id, 'processing');
  try {
    await commitPurchaseHoldRequest(meta.holdId);
    setHoldMeta(id, null);
    await startRecipeUnlock(id, { trigger: 'hold_committed' });
  } catch (error) {
    const code = getPurchaseHoldErrorCode(error);
    if (code === 'already_undone') {
      return;
    }
    console.error('[unlock] commitPurchaseHold failed', { recipeId: id, code, error });
    setUnlockState(id, 'failed');
  }
}

export async function undoPurchaseHoldForRecipe(
  recipeId: string,
  userId?: string | null,
): Promise<void> {
  const id = recipeId.trim();
  if (!id) {
    return;
  }
  clearHoldTimer(id);

  const meta = getHoldMeta(id);
  if (!meta) {
    return;
  }

  try {
    await undoPurchaseHoldRequest(meta.holdId, { channel: 'chat', user_id: userId });
    setHoldMeta(id, null);
    setUnlockState(id, 'undone');
  } catch (error) {
    const code = getPurchaseHoldErrorCode(error);
    if (code === 'already_committed') {
      return;
    }
    console.error('[unlock] undoPurchaseHoldForRecipe failed', { recipeId: id, code, error });
  }
}

export function syncPurchaseHoldResolutionFromVoice(recipeId: string, status: string): void {
  const id = recipeId.trim();
  if (!id) {
    return;
  }
  clearHoldTimer(id);

  if (status === 'undone') {
    setHoldMeta(id, null);
    setUnlockState(id, 'undone');
    return;
  }

  if (status === 'committed') {
    setHoldMeta(id, null);
    setUnlockState(id, 'processing');
    void startRecipeUnlock(id, { trigger: 'hold_committed' });
  }
}
