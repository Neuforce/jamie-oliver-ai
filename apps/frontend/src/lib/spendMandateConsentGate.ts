/**
 * AI-native spend mandate consent: blocks purchase until the user responds
 * via inline chat buttons (voice or text). No window.confirm / modal.
 */

export interface SpendMandateConsentParams {
  priceAmount: number;
  currencyCode: string;
  ceilingAmount: number;
  backendRecipeId?: string;
}

type ConsentListener = () => void;

let pending: {
  params: SpendMandateConsentParams;
  resolve: (approved: boolean) => void;
} | null = null;

const listeners = new Set<ConsentListener>();

export function subscribeSpendMandateConsent(listener: ConsentListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function getPendingSpendMandateConsent(): SpendMandateConsentParams | null {
  return pending?.params ?? null;
}

export function requestSpendMandateConsent(
  params: SpendMandateConsentParams,
): Promise<boolean> {
  if (pending) {
    pending.resolve(false);
  }
  return new Promise((resolve) => {
    pending = { params, resolve };
    notifyListeners();
  });
}

export function resolveSpendMandateConsent(approved: boolean): void {
  if (!pending) {
    return;
  }
  const { resolve } = pending;
  pending = null;
  resolve(approved);
  notifyListeners();
}

export function formatConsentPrice(amountCents: number, currencyCode: string): string {
  const symbol = currencyCode === 'GBP' ? '£' : currencyCode === 'EUR' ? '€' : '$';
  return `${symbol}${(amountCents / 100).toFixed(2)}`;
}
