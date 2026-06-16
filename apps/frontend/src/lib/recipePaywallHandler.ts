import type { SpendMandate } from './api';
import { setMandate, setUnlockState } from './commerceStore';
import { startRecipeUnlock } from './unlockController';

export interface RecipePaywallMetadata {
  backend_recipe_id?: string;
  price_amount?: number;
  currency_code?: string;
  ceiling_amount?: number;
  ask_id?: string;
  auto_charge?: boolean;
  mandate?: unknown;
}

function parseSpendMandate(raw: unknown): SpendMandate | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (
    typeof value.id !== 'string'
    || typeof value.userId !== 'string'
    || typeof value.ceilingAmount !== 'number'
    || typeof value.currencyCode !== 'string'
    || typeof value.consumedAmount !== 'number'
    || typeof value.status !== 'string'
    || typeof value.source !== 'string'
    || typeof value.remainingAmount !== 'number'
  ) {
    return null;
  }
  return {
    id: value.id,
    userId: value.userId,
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : null,
    ceilingAmount: value.ceilingAmount,
    currencyCode: value.currencyCode,
    consumedAmount: value.consumedAmount,
    status: value.status,
    source: value.source,
    grantedAt: typeof value.grantedAt === 'string' ? value.grantedAt : null,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
    remainingAmount: value.remainingAmount,
  };
}

/**
 * Handles recipe_paywall_requested from text or voice streams. When the backend
 * signals auto_charge (PR #89), adopt the mandate and charge silently; otherwise
 * drive the standard paywall → consent flow.
 */
export async function handleRecipePaywallRequested(metadata: RecipePaywallMetadata): Promise<void> {
  const bid = typeof metadata.backend_recipe_id === 'string' ? metadata.backend_recipe_id.trim() : '';
  if (!bid) {
    return;
  }

  if (metadata.auto_charge === true) {
    const mandate = parseSpendMandate(metadata.mandate);
    if (mandate) {
      setMandate(mandate);
      setUnlockState(bid, 'processing');
      await startRecipeUnlock(bid, { trigger: 'auto_charge' });
      return;
    }
  }

  await startRecipeUnlock(bid, { trigger: 'paywall_event' });
}
