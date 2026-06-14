/**
 * NEU-679 — view-agnostic Agent Action Surface.
 * Single store for active UI surface, spend-mandate consent, and purchase receipts.
 */

export interface SpendMandateConsentParams {
  priceAmount: number;
  currencyCode: string;
  ceilingAmount: number;
  backendRecipeId?: string;
}

export interface PurchaseReceipt {
  id: string;
  backendRecipeId: string;
  recipeTitle: string;
  priceLabel: string;
  timestamp: number;
}

export type AgentActiveSurface =
  | { kind: 'chat' }
  | { kind: 'recipe_sheet'; backendRecipeId: string }
  | { kind: 'none' };

type StoreListener = () => void;

const MAX_RECEIPTS = 5;

let activeSurface: AgentActiveSurface = { kind: 'none' };
let pendingConsent: SpendMandateConsentParams | null = null;
let pendingConsentResolve: ((approved: boolean) => void) | null = null;
let receipts: PurchaseReceipt[] = [];

const listeners = new Set<StoreListener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeAgentActionSurface(listener: StoreListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveSurface(): AgentActiveSurface {
  return activeSurface;
}

/** App / ChatView call this when the user moves between chat and recipe sheet. */
export function setActiveSurface(surface: AgentActiveSurface): void {
  activeSurface = surface;
  notifyListeners();
}

export function commerceUiTarget(): 'chat' | 'recipe_sheet' | 'none' {
  if (activeSurface.kind === 'recipe_sheet') return 'recipe_sheet';
  if (activeSurface.kind === 'chat') return 'chat';
  return 'none';
}

export function shouldRenderCommerceInline(): boolean {
  return commerceUiTarget() === 'chat';
}

export function shouldRenderCommercePortaled(): boolean {
  return commerceUiTarget() === 'recipe_sheet';
}

export function focusedBackendRecipeId(): string | undefined {
  if (activeSurface.kind === 'recipe_sheet') {
    return activeSurface.backendRecipeId;
  }
  return pendingConsent?.backendRecipeId;
}

// ── Consent ────────────────────────────────────────────────────────────────

export function getPendingSpendMandateConsent(): SpendMandateConsentParams | null {
  return pendingConsent;
}

export function requestSpendMandateConsent(
  params: SpendMandateConsentParams,
): Promise<boolean> {
  if (pendingConsentResolve) {
    pendingConsentResolve(false);
  }
  return new Promise((resolve) => {
    pendingConsent = params;
    pendingConsentResolve = resolve;
    notifyListeners();
  });
}

export function resolveSpendMandateConsent(approved: boolean): void {
  if (!pendingConsentResolve) {
    return;
  }
  const resolve = pendingConsentResolve;
  pendingConsent = null;
  pendingConsentResolve = null;
  resolve(approved);
  notifyListeners();
}

export function formatConsentPrice(amountCents: number, currencyCode: string): string {
  const symbol = currencyCode === 'GBP' ? '£' : currencyCode === 'EUR' ? '€' : '$';
  return `${symbol}${(amountCents / 100).toFixed(2)}`;
}

// ── Receipts ─────────────────────────────────────────────────────────────────

export function getPurchaseReceipts(): PurchaseReceipt[] {
  return receipts;
}

export function addPurchaseReceipt(
  receipt: Omit<PurchaseReceipt, 'id' | 'timestamp'>,
): PurchaseReceipt {
  const nextReceipt: PurchaseReceipt = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...receipt,
  };

  receipts = [nextReceipt, ...receipts].slice(0, MAX_RECEIPTS);
  notifyListeners();
  return nextReceipt;
}

export function getLatestReceiptForRecipe(backendRecipeId: string): PurchaseReceipt | null {
  return receipts.find((receipt) => receipt.backendRecipeId === backendRecipeId) ?? null;
}
