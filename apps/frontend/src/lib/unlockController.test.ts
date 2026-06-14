import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../data/recipes';
import type { RecipeAccessResponse } from './api';
import {
  configureUnlockController,
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

function setupConfig(
  runPurchase: UnlockControllerConfig['runPurchase'],
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
    onDeclinedOrAbandoned: vi.fn(),
    onRecipeNotFound: vi.fn(),
    onAccessUnavailable: vi.fn(),
    onError: vi.fn(),
  };
}

describe('unlockController', () => {
  beforeEach(() => {
    resetUnlockControllerForTests();
  });

  it('dedupes concurrent unlock calls per recipe', async () => {
    const runPurchase = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        via: 'on_tab',
        resolution: {
          snapshot: { status: 'signed_in', userId: 'u1', account: null, site: null, message: null },
          refreshedAccess: null,
          state: { purchase: { status: 'completed' } },
          priorEntitlements: [],
        },
      };
    });
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    const first = startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });
    const second = startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });
    await Promise.all([first, second]);

    expect(runPurchase).toHaveBeenCalledTimes(1);
    expect(config.resolveRecipe).toHaveBeenCalledTimes(1);
  });

  it('retries after consent for paywall-triggered unlocks', async () => {
    const runPurchase = vi
      .fn()
      .mockResolvedValueOnce({ via: 'abandoned', resolution: null })
      .mockResolvedValueOnce({
        via: 'on_tab',
        resolution: {
          snapshot: { status: 'signed_in', userId: 'u1', account: null, site: null, message: null },
          refreshedAccess: null,
          state: { purchase: { status: 'completed' } },
          priorEntitlements: [],
        },
      });
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'paywall_event' });

    expect(config.openConsentAsk).toHaveBeenCalledTimes(1);
    expect(runPurchase).toHaveBeenCalledTimes(2);
    expect(config.onPurchaseResolved).toHaveBeenCalledTimes(1);
    expect(config.onDeclinedOrAbandoned).not.toHaveBeenCalled();
  });

  it('consent-triggered unlock does not re-open ask', async () => {
    const runPurchase = vi.fn().mockResolvedValue({
      via: 'on_tab',
      resolution: {
        snapshot: { status: 'signed_in', userId: 'u1', account: null, site: null, message: null },
        refreshedAccess: null,
        state: { purchase: { status: 'completed' } },
        priorEntitlements: [],
      },
    });
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

    expect(config.openConsentAsk).not.toHaveBeenCalled();
    expect(config.onPurchaseResolved).toHaveBeenCalledTimes(1);
  });

  it('retries once after consent-triggered abandoned outcome', async () => {
    const runPurchase = vi
      .fn()
      .mockResolvedValueOnce({ via: 'abandoned', resolution: null })
      .mockResolvedValueOnce({
        via: 'on_tab',
        resolution: {
          snapshot: { status: 'signed_in', userId: 'u1', account: null, site: null, message: null },
          refreshedAccess: null,
          state: { purchase: { status: 'completed' } },
          priorEntitlements: [],
        },
      });
    const config = setupConfig(runPurchase);
    configureUnlockController(config);

    await startRecipeUnlock('fish-pie', { trigger: 'consent_approve' });

    expect(runPurchase).toHaveBeenCalledTimes(2);
    expect(config.openConsentAsk).not.toHaveBeenCalled();
    expect(config.onPurchaseResolved).toHaveBeenCalledTimes(1);
  });
});
