import type { SpendMandate } from './api';
import { resolveAsk, setMandate, setUnlockState } from './commerceStore';
import { startRecipeUnlock } from './unlockController';

export interface VoiceSpendMandateConsentResolvedPayload {
  backend_recipe_id: string;
  approved: boolean;
  ask_id?: string;
  /** Opaque server mandate snapshot — pass straight to setMandate. */
  mandate?: unknown;
  reason?: string;
}

/**
 * Voice path after the server resolves a spend-mandate consent ask (e.g. verbal yes/no).
 * Does not call resolveAskWithServer — the backend already resolved the server ask.
 */
export function handleVoiceSpendMandateConsentResolved(
  payload: VoiceSpendMandateConsentResolvedPayload,
): void {
  const bid = payload.backend_recipe_id.trim();
  if (!bid) {
    return;
  }

  if (payload.approved) {
    if (payload.mandate != null) {
      setMandate(payload.mandate as SpendMandate);
    }
    resolveAsk(bid, true);
    void startRecipeUnlock(bid, { trigger: 'consent_approve' });
    return;
  }

  resolveAsk(bid, false);
  setUnlockState(bid, payload.reason === 'needs_tab' ? 'noTab' : 'declined');
}
