import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../data/recipes';
import type { RecipeAccessResponse } from './api';
import {
  getUnlockState,
  resetCommerceStoreForTests,
} from './commerceStore';
import {
  configureUnlockController,
  confirmUnlock,
  declineUnlock,
  resetUnlockControllerForTests,
  startRecipeUnlock,
  type UnlockControllerConfig,
} from './unlockController';

const recipe: Recipe = {
  id: 1,
  title: 'Fish Pie',
  description: '',
  category: 'Dinner',
  difficulty: 'Easy',
  time: '20 min',
  tips: [],
  image: '',
  servings: 2,
  ingredients: [],
  instructions: [],
  backendId: 'fish-pie',
};

function lockedAccess(recipeId: string): RecipeAccessResponse {
  return {
    recipeId,
    recipeUuid: 'uuid-1',
    accessState: 'locked',
    offering: {
      id: 'offering-1',
      isFree: false,
      contentKey: `recipe:${recipeId}:cook`,
      priceAmount: 5,
      currencyCode: 'USD',
    },
    entitlement: null,
    activeSession: null,
  };
}

function successOutcome() {
  return {
    via: 'on_tab' as const,
    resolution: {
      snapshot: { status: 'signed_in' as const, userId: 'u1', account: null, site: null, message: null },
      refreshedAccess: null,
      state: { purchase: { status: 'completed' } },
      priorEntitlements: [],
    },
  };
}

function setupConfig(
  runPurchase: UnlockControllerConfig['runPurchase'],
  overrides: Partial<UnlockControllerConfig> = {},
): UnlockControllerConfig {
  return {
    resolveRecipe: vi.fn().mockResolvedValue(recipe),
    ensureRecipeVisible: vi.fn(),
    loadAccess: vi.fn().mockResolvedValue(lockedAccess('fish-pie')),
    openConsentAsk: vi.fn().mockResolvedValue(true),
    runPurchase,
    onAlreadyUnlocked: vi.fn(),
    onPurchaseResolved: vi.fn(),
    onUnavailable: vi.fn(),
    onSettlementRequired: vi.fn(),
    onRecipeNotFound: vi.fn(),
    onAccessUnavailable: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe('unlockController', () => {
  beforeEach(() => {
    resetUnlockControllerForTests();
    resetCommerceStoreForTests();
  });

  it('dedupes concurrent unlock calls per recipe', async () => {
    const runPurchase = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return successOutcome();
    });
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    const first = startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });
    const second = startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });
    await Promise.all([first, second]);

    expect(runPurchase).toHaveBeenCalledTimes(1);
    expect(config.resolveRecipe).toHaveBeenCalledTimes(1);
  });

  it('retries after consent for paywall-triggered unlocks and ends unlocked', async () => {
    const runPurchase = vi
      .fn()
      .mockResolvedValueOnce({ via: 'abandoned', resolution: null })
      .mockResolvedValueOnce(successOutcome());
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'paywall_event' });

    expect(config.openConsentAsk).toHaveBeenCalledTimes(1);
    expect(runPurchase).toHaveBeenCalledTimes(2);
    expect(runPurchase.mock.calls[0][2]).toEqual({ consentGranted: false });
    expect(runPurchase.mock.calls[1][2]).toEqual({ consentGranted: true });
    expect(config.onPurchaseResolved).toHaveBeenCalledTimes(1);
    expect(getUnlockState('fish-pie')).toBe('unlocked');
  });

  it('consent-triggered unlock does not re-open ask', async () => {
    const runPurchase = vi.fn().mockResolvedValue(successOutcome());
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

    expect(config.openConsentAsk).not.toHaveBeenCalled();
    expect(config.onPurchaseResolved).toHaveBeenCalledTimes(1);
    expect(runPurchase.mock.calls[0][2]).toEqual({ consentGranted: true });
    expect(getUnlockState('fish-pie')).toBe('unlocked');
  });

  it('retries once after consent-triggered abandoned outcome', async () => {
    const runPurchase = vi
      .fn()
      .mockResolvedValueOnce({ via: 'abandoned', resolution: null })
      .mockResolvedValueOnce(successOutcome());
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

    expect(runPurchase).toHaveBeenCalledTimes(2);
    expect(config.openConsentAsk).not.toHaveBeenCalled();
    expect(config.onPurchaseResolved).toHaveBeenCalledTimes(1);
    expect(getUnlockState('fish-pie')).toBe('unlocked');
  });

  describe('unlockState transitions', () => {
    it("maps via 'unavailable' to noTab", async () => {
      const runPurchase = vi.fn().mockResolvedValue({ via: 'unavailable', resolution: null });
      configureUnlockController(setupConfig(runPurchase));

      await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

      expect(getUnlockState('fish-pie')).toBe('noTab');
    });

    it("maps via 'tab_settlement_required' to needsCheckout", async () => {
      const runPurchase = vi
        .fn()
        .mockResolvedValue({ via: 'tab_settlement_required', resolution: null });
      configureUnlockController(setupConfig(runPurchase));

      await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

      expect(getUnlockState('fish-pie')).toBe('needsCheckout');
    });

    it("maps post-consent 'abandoned' to failed", async () => {
      const runPurchase = vi.fn().mockResolvedValue({ via: 'abandoned', resolution: null });
      configureUnlockController(setupConfig(runPurchase));

      await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

      expect(getUnlockState('fish-pie')).toBe('failed');
    });

    it('maps a thrown error to failed', async () => {
      const runPurchase = vi.fn().mockRejectedValue(new Error('boom'));
      const onError = vi.fn();
      configureUnlockController(setupConfig(runPurchase, { onError }));

      await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

      expect(getUnlockState('fish-pie')).toBe('failed');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('maps a declined consent (paywall) to declined', async () => {
      const runPurchase = vi.fn().mockResolvedValue({ via: 'abandoned', resolution: null });
      const openConsentAsk = vi.fn().mockResolvedValue(false);
      configureUnlockController(setupConfig(runPurchase, { openConsentAsk }));

      await startRecipeUnlock('fish-pie', { trigger: 'paywall_event' });

      expect(getUnlockState('fish-pie')).toBe('declined');
      expect(runPurchase).toHaveBeenCalledTimes(1);
    });
  });

  describe('view verbs', () => {
    it('confirmUnlock drives a consent-granted unlock to unlocked', async () => {
      const runPurchase = vi.fn().mockResolvedValue(successOutcome());
      const config = setupConfig(runPurchase);
      configureUnlockController(config);

      await confirmUnlock('fish-pie', 'user-1');

      expect(runPurchase).toHaveBeenCalledTimes(1);
      expect(runPurchase.mock.calls[0][2]).toEqual({ consentGranted: true });
      expect(getUnlockState('fish-pie')).toBe('unlocked');
    });

    it('declineUnlock sets declined', async () => {
      const runPurchase = vi.fn().mockResolvedValue(successOutcome());
      configureUnlockController(setupConfig(runPurchase));

      await declineUnlock('fish-pie', 'user-1');

      expect(getUnlockState('fish-pie')).toBe('declined');
      expect(runPurchase).not.toHaveBeenCalled();
    });
  });
});
