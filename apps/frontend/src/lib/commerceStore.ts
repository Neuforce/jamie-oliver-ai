/**
 * Unified commerce state — single source of truth for recipe access, consent asks,
 * mandates, and purchase receipts. Server access is projected via setAccess;
 * NEU-670 will move ask ownership server-side.
 */

import { useSyncExternalStore } from 'react';
import type { RecipeAccessResponse, SpendMandate } from './api';

export interface PurchaseReceipt {
  id: string;
  backendRecipeId: string;
  recipeTitle: string;
  priceLabel: string;
  timestamp: number;
}

export type AskStatus = 'requested' | 'granted' | 'declined';

export interface ActiveAsk {
  askId?: string;
  recipeId: string;
  status: AskStatus;
  priceAmount: number;
  currencyCode: string;
  ceilingAmount: number;
}

export interface OpenAskParams {
  recipeId: string;
  askId?: string;
  priceAmount: number;
  currencyCode: string;
  ceilingAmount: number;
}

export interface RecipeCommerceEntry {
  access: RecipeAccessResponse | null;
  receipt: PurchaseReceipt | null;
}

export interface CommerceStateSnapshot {
  access: RecipeAccessResponse | null;
  receipt: PurchaseReceipt | null;
  /** Active ask when it targets this recipe and is still pending. */
  pendingAsk: ActiveAsk | null;
  mandate: SpendMandate | null;
}

type StoreListener = () => void;

let recipeCommerce: Record<string, RecipeCommerceEntry> = {};
let activeAsk: ActiveAsk | null = null;
let mandate: SpendMandate | null = null;
let askResolve: ((approved: boolean) => void) | null = null;
let askPromise: Promise<boolean> | null = null;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileToken = 0;
const ASK_RECONCILE_INTERVAL_MS = 2500;
const ASK_RECONCILE_MAX_ATTEMPTS = 24; // ~60s ceiling
let snapshotVersion = 0;

const listeners = new Set<StoreListener>();

function notifyListeners(): void {
  snapshotVersion += 1;
  listeners.forEach((listener) => listener());
}

function stopAskReconciliation(): void {
  reconcileToken += 1; // invalidate any in-flight async loop
  if (reconcileTimer) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }
}

function startAskReconciliation(askId: string, recipeId: string): void {
  stopAskReconciliation();
  const token = reconcileToken;
  let attempts = 0;

  const poll = async (): Promise<void> => {
    if (token !== reconcileToken) return;
    if (
      !activeAsk
      || activeAsk.askId !== askId
      || activeAsk.recipeId !== recipeId
      || activeAsk.status !== 'requested'
    ) {
      return;
    }
    attempts += 1;
    try {
      const { getSpendMandateAsk, getCurrentSpendMandate } = await import('./api');
      const serverAsk = await getSpendMandateAsk(askId);
      if (token !== reconcileToken) return;
      if (
        !activeAsk
        || activeAsk.askId !== askId
        || activeAsk.recipeId !== recipeId
        || activeAsk.status !== 'requested'
      ) return;

      if (serverAsk.status === 'active') {
        if (serverAsk.userId) {
          try {
            const serverMandate = await getCurrentSpendMandate(serverAsk.userId);
            if (token !== reconcileToken) return;
            if (serverMandate) setMandate(serverMandate);
          } catch {
            // mandate fetch failure shouldn't block resolution
          }
        }
        resolveAsk(recipeId, true);
        return;
      }
      if (serverAsk.status === 'declined' || serverAsk.status === 'expired') {
        resolveAsk(recipeId, false);
        return;
      }
      // still 'requested' -> keep polling
    } catch {
      // transient network error -> keep polling until max attempts
    }
    if (attempts >= ASK_RECONCILE_MAX_ATTEMPTS) {
      stopAskReconciliation();
      return;
    }
    reconcileTimer = setTimeout(() => { void poll(); }, ASK_RECONCILE_INTERVAL_MS);
  };

  reconcileTimer = setTimeout(() => { void poll(); }, ASK_RECONCILE_INTERVAL_MS);
}

export function getCommerceSnapshotVersion(): number {
  return snapshotVersion;
}

function ensureRecipeEntry(recipeId: string): RecipeCommerceEntry {
  const existing = recipeCommerce[recipeId];
  if (existing) {
    return existing;
  }
  const entry: RecipeCommerceEntry = { access: null, receipt: null };
  recipeCommerce = { ...recipeCommerce, [recipeId]: entry };
  return entry;
}

export function subscribeCommerceStore(listener: StoreListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveAsk(): ActiveAsk | null {
  return activeAsk;
}

export function getMandate(): SpendMandate | null {
  return mandate;
}

export function getRecipeAccess(recipeId: string): RecipeAccessResponse | null {
  return recipeCommerce[recipeId]?.access ?? null;
}

export function getRecipeReceipt(recipeId: string): PurchaseReceipt | null {
  return recipeCommerce[recipeId]?.receipt ?? null;
}

export function getCommerceState(recipeId?: string | null): CommerceStateSnapshot {
  const entry = recipeId ? recipeCommerce[recipeId] : undefined;
  const pendingAsk =
    recipeId && activeAsk?.recipeId === recipeId && activeAsk.status === 'requested'
      ? activeAsk
      : null;

  return {
    access: entry?.access ?? null,
    receipt: entry?.receipt ?? null,
    pendingAsk,
    mandate,
  };
}

export function setAccess(recipeId: string, access: RecipeAccessResponse): void {
  const entry = ensureRecipeEntry(recipeId);
  recipeCommerce = {
    ...recipeCommerce,
    [recipeId]: { ...entry, access },
  };
  notifyListeners();
}

export function clearAccess(recipeId: string): void {
  if (!recipeCommerce[recipeId]) {
    return;
  }
  const entry = recipeCommerce[recipeId];
  recipeCommerce = {
    ...recipeCommerce,
    [recipeId]: { ...entry, access: null },
  };
  notifyListeners();
}

/** Drop cached access so the next load fetches fresh server state. */
export function invalidateAccess(recipeId: string): void {
  clearAccess(recipeId);
}

export function setReceipt(
  recipeId: string,
  receipt: Omit<PurchaseReceipt, 'id' | 'timestamp' | 'backendRecipeId'>,
): PurchaseReceipt {
  const entry = ensureRecipeEntry(recipeId);
  const nextReceipt: PurchaseReceipt = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    backendRecipeId: recipeId,
    ...receipt,
  };
  recipeCommerce = {
    ...recipeCommerce,
    [recipeId]: { ...entry, receipt: nextReceipt },
  };
  notifyListeners();
  return nextReceipt;
}

export function setMandate(nextMandate: SpendMandate | null): void {
  mandate = nextMandate;
  notifyListeners();
}

function supersedePendingAsk(): void {
  stopAskReconciliation();
  if (askResolve) {
    const resolve = askResolve;
    askResolve = null;
    askPromise = null;
    resolve(false);
  }
  activeAsk = null;
}

export function openAsk(params: OpenAskParams): Promise<boolean> {
  if (
    activeAsk?.recipeId === params.recipeId
    && activeAsk.status === 'requested'
    && askPromise
  ) {
    const nextAskId = params.askId?.trim();
    const shouldReconcile = Boolean(nextAskId && nextAskId !== activeAsk.askId);
    activeAsk = {
      ...activeAsk,
      askId: nextAskId || activeAsk.askId,
      priceAmount: params.priceAmount,
      currencyCode: params.currencyCode,
      ceilingAmount: params.ceilingAmount,
    };
    notifyListeners();
    if (shouldReconcile && nextAskId) {
      startAskReconciliation(nextAskId, params.recipeId);
    }
    return askPromise;
  }

  supersedePendingAsk();

  askPromise = new Promise((resolve) => {
    activeAsk = {
      askId: params.askId,
      recipeId: params.recipeId,
      status: 'requested',
      priceAmount: params.priceAmount,
      currencyCode: params.currencyCode,
      ceilingAmount: params.ceilingAmount,
    };
    askResolve = resolve;
    notifyListeners();
  });
  if (params.askId) {
    startAskReconciliation(params.askId, params.recipeId);
  }

  return askPromise;
}

export function resolveAsk(recipeId: string, approved: boolean): void {
  if (!activeAsk || activeAsk.recipeId !== recipeId || activeAsk.status !== 'requested') {
    return;
  }

  if (askResolve) {
    const resolve = askResolve;
    askResolve = null;
    askPromise = null;
    resolve(approved);
  }

  activeAsk = null;
  notifyListeners();
  stopAskReconciliation();
}

export function clearActiveAsk(): void {
  supersedePendingAsk();
  notifyListeners();
}

export async function resolveAskWithServer(
  recipeId: string,
  approved: boolean,
  userId?: string | null,
): Promise<boolean> {
  const ask = getActiveAsk();
  if (!ask || ask.recipeId !== recipeId || ask.status !== 'requested') {
    return false;
  }

  if (ask.askId && userId) {
    try {
      const { resolveSpendMandateAsk } = await import('./api');
      const result = await resolveSpendMandateAsk(
        ask.askId,
        approved ? 'grant' : 'decline',
        userId,
      );
      if (result.mandate) {
        setMandate(result.mandate);
      }
    } catch (error) {
      console.error('Failed to resolve spend mandate ask on server:', error);
      resolveAsk(recipeId, false);
      return false;
    }
  }

  resolveAsk(recipeId, approved);
  return approved;
}

export function formatConsentPrice(amountCents: number, currencyCode: string): string {
  const symbol = currencyCode === 'GBP' ? '£' : currencyCode === 'EUR' ? '€' : '$';
  return `${symbol}${(amountCents / 100).toFixed(2)}`;
}

export function useCommerceState(recipeId?: string | null): CommerceStateSnapshot {
  return useSyncExternalStore(
    subscribeCommerceStore,
    () => getCommerceState(recipeId),
    () => getCommerceState(recipeId),
  );
}

/** Test-only reset — not for production use. */
export function resetCommerceStoreForTests(): void {
  stopAskReconciliation();
  recipeCommerce = {};
  activeAsk = null;
  mandate = null;
  askResolve = null;
  askPromise = null;
  reconcileTimer = null;
  snapshotVersion = 0;
  listeners.clear();
}
