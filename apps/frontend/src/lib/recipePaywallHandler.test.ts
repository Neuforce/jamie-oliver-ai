import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMandate,
  getUnlockState,
  resetCommerceStoreForTests,
} from './commerceStore';

vi.mock('./unlockController', () => ({
  startRecipeUnlock: vi.fn().mockResolvedValue(undefined),
}));

import { handleRecipePaywallRequested } from './recipePaywallHandler';
import { startRecipeUnlock } from './unlockController';

const mandate = {
  id: 'mandate-1',
  userId: 'user-1',
  ceilingAmount: 1000,
  currencyCode: 'USD',
  consumedAmount: 100,
  status: 'active',
  source: 'agentic',
  remainingAmount: 900,
};

describe('handleRecipePaywallRequested', () => {
  beforeEach(() => {
    resetCommerceStoreForTests();
    vi.mocked(startRecipeUnlock).mockClear();
  });

  it('auto_charge adopts mandate, shows processing, and starts silent unlock', async () => {
    await handleRecipePaywallRequested({
      backend_recipe_id: 'fish-pie',
      auto_charge: true,
      mandate,
    });

    expect(getMandate()).toMatchObject(mandate);
    expect(getUnlockState('fish-pie')).toBe('processing');
    expect(startRecipeUnlock).toHaveBeenCalledWith('fish-pie', { trigger: 'auto_charge' });
  });

  it('without auto_charge uses standard paywall_event unlock', async () => {
    await handleRecipePaywallRequested({
      backend_recipe_id: 'fish-pie',
    });

    expect(getMandate()).toBeNull();
    expect(getUnlockState('fish-pie')).toBe('locked');
    expect(startRecipeUnlock).toHaveBeenCalledWith('fish-pie', { trigger: 'paywall_event' });
  });

  it('auto_charge without valid mandate falls back to paywall_event', async () => {
    await handleRecipePaywallRequested({
      backend_recipe_id: 'fish-pie',
      auto_charge: true,
      mandate: { invalid: true },
    });

    expect(getMandate()).toBeNull();
    expect(startRecipeUnlock).toHaveBeenCalledWith('fish-pie', { trigger: 'paywall_event' });
  });
});
