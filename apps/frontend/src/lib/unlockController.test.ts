import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../data/recipes';
import type { PurchaseHold, RecipeAccessResponse } from './api';
import {
  getHoldMeta,
  getUnlockState,
  openAsk,
  resetCommerceStoreForTests,
  setHoldMeta,
  setUnlockState,
} from './commerceStore';
import {
  beginPurchaseHold,
  commitPurchaseHold,
  configureUnlockController,
  confirmUnlock,
  declineUnlock,
  requestCheckout,
  resetUnlockControllerForTests,
  startRecipeUnlock,
  syncPurchaseHoldResolutionFromVoice,
  undoPurchaseHoldForRecipe,
  type UnlockControllerConfig,
} from './unlockController';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    commitPurchaseHold: vi.fn(),
    undoPurchaseHold: vi.fn(),
    resolveSpendMandateAsk: vi.fn(),
  };
});

import {
  commitPurchaseHold as commitPurchaseHoldRequest,
  resolveSpendMandateAsk as resolveSpendMandateAskRequest,
  undoPurchaseHold as undoPurchaseHoldRequest,
} from './api';

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

function sampleHold(recipeId: string, expiresInMs: number): PurchaseHold {
  return {
    id: 'hold-1',
    userId: 'user-1',
    sessionId: null,
    backendRecipeId: recipeId,
    priceAmount: 500,
    currencyCode: 'USD',
    status: 'holding',
    askId: 'ask-1',
    mandateId: 'mandate-1',
    holdExpiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    committedAt: null,
    undoneAt: null,
    purchaseId: null,
    createdAt: new Date().toISOString(),
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
    runCheckout: vi.fn().mockResolvedValue({ via: 'paywall', resolution: successOutcome().resolution }),
    ...overrides,
  };
}

describe('unlockController', () => {
  beforeEach(() => {
    resetUnlockControllerForTests();
    resetCommerceStoreForTests();
    vi.mocked(commitPurchaseHoldRequest).mockReset();
    vi.mocked(undoPurchaseHoldRequest).mockReset();
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

  it('auto-charge unlock charges silently without opening ask', async () => {
    const runPurchase = vi.fn().mockResolvedValue(successOutcome());
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'auto_charge' });

    expect(config.openConsentAsk).not.toHaveBeenCalled();
    expect(runPurchase).toHaveBeenCalledTimes(1);
    expect(runPurchase.mock.calls[0][2]).toEqual({ consentGranted: true });
    expect(getUnlockState('fish-pie')).toBe('unlocked');
  });

  it('auto-charge abandoned falls back to consent ask', async () => {
    const runPurchase = vi
      .fn()
      .mockResolvedValueOnce({ via: 'abandoned', resolution: null })
      .mockResolvedValueOnce(successOutcome());
    const openConsentAsk = vi.fn().mockResolvedValue(true);
    const config = setupConfig(runPurchase, { openConsentAsk });
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'auto_charge' });

    expect(openConsentAsk).toHaveBeenCalledTimes(1);
    expect(openConsentAsk.mock.calls[0][0]).toMatchObject({ force: true });
    expect(runPurchase).toHaveBeenCalledTimes(2);
    expect(getUnlockState('fish-pie')).toBe('unlocked');
  });

  it('auto-charge unavailable falls back to consent ask', async () => {
    const runPurchase = vi
      .fn()
      .mockResolvedValueOnce({ via: 'unavailable', resolution: null })
      .mockResolvedValueOnce(successOutcome());
    const openConsentAsk = vi.fn().mockResolvedValue(true);
    const config = setupConfig(runPurchase, { openConsentAsk });
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'auto_charge' });

    expect(openConsentAsk).toHaveBeenCalledTimes(1);
    expect(runPurchase).toHaveBeenCalledTimes(2);
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

    it("maps agentic action_required (via 'tab_settlement_required') to needsCheckout without awaiting an embed", async () => {
      // The agentic runPurchase config no longer passes embedded-checkout
      // callbacks, so purchaseRecipe returns 'tab_settlement_required' on a Tab
      // action_required. The controller must transition straight to needsCheckout
      // (single runPurchase call, no second embed-driven attempt/wait).
      const runPurchase = vi
        .fn()
        .mockResolvedValue({ via: 'tab_settlement_required', resolution: null });
      const config = setupConfig(runPurchase);
      configureUnlockController(config);

      await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

      expect(getUnlockState('fish-pie')).toBe('needsCheckout');
      expect(runPurchase).toHaveBeenCalledTimes(1);
      expect(config.onSettlementRequired).toHaveBeenCalledTimes(1);
      expect(config.onPurchaseResolved).not.toHaveBeenCalled();
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

    it('confirmUnlock surfaces failed (not a stuck processing state) when the server-side resolve call throws for a real pending ask', async () => {
      const runPurchase = vi.fn().mockResolvedValue(successOutcome());
      configureUnlockController(setupConfig(runPurchase));

      // A real pending ask must exist so confirmUnlock's `hadPendingAsk` guard is true.
      void openAsk({
        recipeId: 'fish-pie',
        askId: 'ask-1',
        priceAmount: 500,
        currencyCode: 'USD',
        ceilingAmount: 1000,
      });
      vi.mocked(resolveSpendMandateAskRequest).mockRejectedValueOnce(new Error('network down'));

      await confirmUnlock('fish-pie', 'user-1');

      expect(runPurchase).not.toHaveBeenCalled();
      expect(getUnlockState('fish-pie')).toBe('failed');
    });

    it('declineUnlock sets declined', async () => {
      const runPurchase = vi.fn().mockResolvedValue(successOutcome());
      configureUnlockController(setupConfig(runPurchase));

      await declineUnlock('fish-pie', 'user-1');

      expect(getUnlockState('fish-pie')).toBe('declined');
      expect(runPurchase).not.toHaveBeenCalled();
    });

    it('requestCheckout unlocks on completed paywall result', async () => {
      const config = setupConfig(
        vi.fn().mockResolvedValue({ via: 'tab_settlement_required', resolution: null }),
        {
          runCheckout: vi.fn().mockResolvedValue({
            via: 'paywall',
            resolution: successOutcome().resolution,
          }),
        },
      );
      configureUnlockController(config);

      await requestCheckout('fish-pie');

      expect(config.runCheckout).toHaveBeenCalledTimes(1);
      expect(config.onPurchaseResolved).toHaveBeenCalledTimes(1);
      expect(getUnlockState('fish-pie')).toBe('unlocked');
    });

    it('requestCheckout maps unavailable paywall result to noTab', async () => {
      const config = setupConfig(
        vi.fn().mockResolvedValue({ via: 'tab_settlement_required', resolution: null }),
        {
          runCheckout: vi.fn().mockResolvedValue({
            via: 'unavailable',
            resolution: null,
          }),
        },
      );
      configureUnlockController(config);

      await requestCheckout('fish-pie');

      expect(config.runCheckout).toHaveBeenCalledTimes(1);
      expect(config.onUnavailable).toHaveBeenCalledTimes(1);
      expect(getUnlockState('fish-pie')).toBe('noTab');
    });

    it('requestCheckout maps abandoned paywall result to failed', async () => {
      const config = setupConfig(
        vi.fn().mockResolvedValue({ via: 'tab_settlement_required', resolution: null }),
        {
          runCheckout: vi.fn().mockResolvedValue({
            via: 'abandoned',
            resolution: null,
          }),
        },
      );
      configureUnlockController(config);

      await requestCheckout('fish-pie');

      expect(config.runCheckout).toHaveBeenCalledTimes(1);
      expect(getUnlockState('fish-pie')).toBe('failed');
    });

    it('requestCheckout dedupes concurrent settlement runs', async () => {
      const runCheckout = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { via: 'paywall', resolution: successOutcome().resolution };
      });
      const config = setupConfig(
        vi.fn().mockResolvedValue({ via: 'tab_settlement_required', resolution: null }),
        { runCheckout },
      );
      configureUnlockController(config);

      await Promise.all([requestCheckout('fish-pie'), requestCheckout('fish-pie')]);

      expect(runCheckout).toHaveBeenCalledTimes(1);
      expect(getUnlockState('fish-pie')).toBe('unlocked');
    });
  });

  describe('purchase hold', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      const runPurchase = vi.fn().mockResolvedValue(successOutcome());
      configureUnlockController(setupConfig(runPurchase));
      vi.mocked(commitPurchaseHoldRequest).mockResolvedValue({
        hold: { ...sampleHold('fish-pie', 0), status: 'committed' },
      });
      vi.mocked(undoPurchaseHoldRequest).mockResolvedValue({
        hold: { ...sampleHold('fish-pie', 0), status: 'undone' },
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('beginPurchaseHold sets holding state and holdMeta', () => {
      beginPurchaseHold('fish-pie', sampleHold('fish-pie', 30_000));

      expect(getUnlockState('fish-pie')).toBe('holding');
      expect(getHoldMeta('fish-pie')).toMatchObject({
        holdId: 'hold-1',
        priceAmount: 500,
        currencyCode: 'USD',
      });
    });

    it('auto-commits after hold expiry', async () => {
      beginPurchaseHold('fish-pie', sampleHold('fish-pie', 5_000));

      await vi.advanceTimersByTimeAsync(5_000);
      await vi.runAllTimersAsync();

      expect(commitPurchaseHoldRequest).toHaveBeenCalledWith('hold-1');
      expect(getUnlockState('fish-pie')).toBe('unlocked');
      expect(getHoldMeta('fish-pie')).toBeNull();
    });

    it('undoPurchaseHoldForRecipe cancels pending auto-commit', async () => {
      beginPurchaseHold('fish-pie', sampleHold('fish-pie', 5_000));

      await undoPurchaseHoldForRecipe('fish-pie', 'user-1');

      expect(undoPurchaseHoldRequest).toHaveBeenCalledWith('hold-1', {
        channel: 'chat',
        user_id: 'user-1',
      });
      expect(getUnlockState('fish-pie')).toBe('undone');
      expect(getHoldMeta('fish-pie')).toBeNull();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(commitPurchaseHoldRequest).not.toHaveBeenCalled();
    });

    it("syncPurchaseHoldResolutionFromVoice('undone') updates local state without API calls", () => {
      setHoldMeta('fish-pie', {
        holdId: 'hold-1',
        holdExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        priceAmount: 500,
        currencyCode: 'USD',
      });
      setUnlockState('fish-pie', 'holding');

      syncPurchaseHoldResolutionFromVoice('fish-pie', 'undone');

      expect(getUnlockState('fish-pie')).toBe('undone');
      expect(getHoldMeta('fish-pie')).toBeNull();
      expect(commitPurchaseHoldRequest).not.toHaveBeenCalled();
      expect(undoPurchaseHoldRequest).not.toHaveBeenCalled();
    });

    it("syncPurchaseHoldResolutionFromVoice('committed') starts unlock without API calls", async () => {
      setHoldMeta('fish-pie', {
        holdId: 'hold-1',
        holdExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        priceAmount: 500,
        currencyCode: 'USD',
      });
      setUnlockState('fish-pie', 'holding');

      syncPurchaseHoldResolutionFromVoice('fish-pie', 'committed');
      await vi.runAllTimersAsync();

      expect(getUnlockState('fish-pie')).toBe('unlocked');
      expect(getHoldMeta('fish-pie')).toBeNull();
      expect(commitPurchaseHoldRequest).not.toHaveBeenCalled();
    });
  });
});
