import type { PurchaseHold } from './api';

const HOLD_STATUSES = new Set<PurchaseHold['status']>(['holding', 'committed', 'undone', 'failed']);

export function parsePurchaseHold(raw: unknown): PurchaseHold | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (
    typeof value.id !== 'string'
    || typeof value.backendRecipeId !== 'string'
    || typeof value.priceAmount !== 'number'
    || typeof value.currencyCode !== 'string'
    || typeof value.status !== 'string'
    || !HOLD_STATUSES.has(value.status as PurchaseHold['status'])
  ) {
    return null;
  }
  return {
    id: value.id,
    userId: typeof value.userId === 'string' ? value.userId : null,
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : null,
    backendRecipeId: value.backendRecipeId,
    priceAmount: value.priceAmount,
    currencyCode: value.currencyCode,
    status: value.status as PurchaseHold['status'],
    askId: typeof value.askId === 'string' ? value.askId : null,
    mandateId: typeof value.mandateId === 'string' ? value.mandateId : null,
    holdExpiresAt: typeof value.holdExpiresAt === 'string' ? value.holdExpiresAt : null,
    committedAt: typeof value.committedAt === 'string' ? value.committedAt : null,
    undoneAt: typeof value.undoneAt === 'string' ? value.undoneAt : null,
    purchaseId: typeof value.purchaseId === 'string' ? value.purchaseId : null,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
  };
}

export function msUntilHoldExpiry(hold: PurchaseHold): number {
  if (!hold.holdExpiresAt) {
    return 0;
  }
  const expiresAt = new Date(hold.holdExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) {
    return 0;
  }
  return Math.max(0, expiresAt - Date.now());
}
