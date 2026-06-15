import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpendMandate } from './api';
import {
  getActiveAsk,
  getMandate,
  getUnlockState,
  openAsk,
  resetCommerceStoreForTests,
} from './commerceStore';
import { handleVoiceSpendMandateConsentResolved } from './voiceSpendMandateConsentResolved';

vi.mock('./unlockController', () => ({
  startRecipeUnlock: vi.fn().mockResolvedValue(undefined),
}));

import { startRecipeUnlock } from './unlockController';

const serverMandate: SpendMandate = {
  id: 'mandate-voice-1',
  userId: 'user-1',
  ceilingAmount: 1000,
  currencyCode: 'USD',
  consumedAmount: 0,
  status: 'active',
  source: 'voice',
  remainingAmount: 1000,
};

describe('handleVoiceSpendMandateConsentResolved', () => {
  beforeEach(() => {
    resetCommerceStoreForTests();
    vi.mocked(startRecipeUnlock).mockClear();
  });

  it('adopts the server mandate and triggers unlock on approval', async () => {
    const pending = openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    handleVoiceSpendMandateConsentResolved({
      backend_recipe_id: 'fish-chips',
      approved: true,
      mandate: serverMandate,
    });

    expect(getMandate()).toEqual(serverMandate);
    await expect(pending).resolves.toBe(true);
    expect(getActiveAsk()).toBeNull();
    expect(startRecipeUnlock).toHaveBeenCalledWith('fish-chips', { trigger: 'consent_approve' });
  });

  it('sets declined unlock state when not approved', async () => {
    const pending = openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    handleVoiceSpendMandateConsentResolved({
      backend_recipe_id: 'fish-chips',
      approved: false,
      reason: 'declined',
    });

    await expect(pending).resolves.toBe(false);
    expect(getActiveAsk()).toBeNull();
    expect(getUnlockState('fish-chips')).toBe('declined');
    expect(startRecipeUnlock).not.toHaveBeenCalled();
  });

  it('maps needs_tab reason to noTab unlock state', () => {
    openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    handleVoiceSpendMandateConsentResolved({
      backend_recipe_id: 'fish-chips',
      approved: false,
      reason: 'needs_tab',
    });

    expect(getUnlockState('fish-chips')).toBe('noTab');
    expect(startRecipeUnlock).not.toHaveBeenCalled();
  });
});
