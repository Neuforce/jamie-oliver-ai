import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { RecipeAccessResponse, SpendMandate } from './api';
import {
  clearActiveAsk,
  getActiveAsk,
  getCommerceState,
  getMandate,
  getRecipeAccess,
  getRecipeReceipt,
  openAsk,
  resetCommerceStoreForTests,
  resolveAsk,
  setAccess,
  setMandate,
  setReceipt,
} from './commerceStore';
import { getCurrentSpendMandate, getSpendMandateAsk } from './api';

vi.mock('./api', () => ({
  getSpendMandateAsk: vi.fn(),
  getCurrentSpendMandate: vi.fn(),
}));

function lockedAccess(recipeId: string): RecipeAccessResponse {
  return {
    recipeId,
    recipeUuid: 'uuid-1',
    accessState: 'locked',
    offering: {
      priceAmount: 5,
      currencyCode: 'USD',
      contentKey: `recipe:${recipeId}:cook`,
    },
    entitlement: null,
    session: null,
  };
}

function ownedAccess(recipeId: string): RecipeAccessResponse {
  return {
    ...lockedAccess(recipeId),
    accessState: 'owned',
    entitlement: { id: 'ent-1', status: 'active' },
  };
}

describe('commerceStore', () => {
  beforeEach(() => {
    resetCommerceStoreForTests();
  });

  it('openAsk resolves true when granted', async () => {
    const pending = openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    expect(getActiveAsk()?.status).toBe('requested');
    resolveAsk('fish-chips', true);
    await expect(pending).resolves.toBe(true);
    expect(getActiveAsk()).toBeNull();
  });

  it('openAsk resolves false when declined', async () => {
    const pending = openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    resolveAsk('fish-chips', false);
    await expect(pending).resolves.toBe(false);
    expect(getActiveAsk()).toBeNull();
  });

  it('openAsk supersedes a prior ask with false', async () => {
    const first = openAsk({
      recipeId: 'salad-a',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });
    const second = openAsk({
      recipeId: 'salad-b',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    await expect(first).resolves.toBe(false);
    expect(getActiveAsk()?.recipeId).toBe('salad-b');

    resolveAsk('salad-b', true);
    await expect(second).resolves.toBe(true);
  });

  it('setAccess updates owned state for badges', () => {
    setAccess('rainbow-salad', lockedAccess('rainbow-salad'));
    expect(getRecipeAccess('rainbow-salad')?.accessState).toBe('locked');

    setAccess('rainbow-salad', ownedAccess('rainbow-salad'));
    expect(getRecipeAccess('rainbow-salad')?.accessState).toBe('owned');
    expect(getCommerceState('rainbow-salad').access?.accessState).toBe('owned');
  });

  it('setReceipt stores receipt per recipe', () => {
    const receipt = setReceipt('fish-chips', {
      recipeTitle: 'Fish & chips',
      priceLabel: '$0.05',
    });

    expect(receipt.backendRecipeId).toBe('fish-chips');
    expect(getRecipeReceipt('fish-chips')?.priceLabel).toBe('$0.05');
  });

  it('pendingAsk is scoped to matching recipe in getCommerceState', () => {
    openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    expect(getCommerceState('fish-chips').pendingAsk?.recipeId).toBe('fish-chips');
    expect(getCommerceState('other-recipe').pendingAsk).toBeNull();
  });

  it('clearActiveAsk cancels pending ask without resolving true', async () => {
    const pending = openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    clearActiveAsk();
    await expect(pending).resolves.toBe(false);
    expect(getActiveAsk()).toBeNull();
  });

  it('setMandate updates global mandate snapshot', () => {
    setMandate({
      id: 'mandate-1',
      userId: 'user-1',
      ceilingAmount: 1000,
      currencyCode: 'USD',
      consumedAmount: 0,
      status: 'active',
      source: 'voice',
      remainingAmount: 1000,
    });

    expect(getCommerceState().mandate?.id).toBe('mandate-1');
  });
});

describe('commerceStore ask reconciliation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCommerceStoreForTests();
    vi.mocked(getSpendMandateAsk).mockResolvedValue({
      id: 'a-default',
      status: 'requested',
      userId: null,
      backendRecipeId: 'r-default',
      priceAmount: 100,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });
    vi.mocked(getCurrentSpendMandate).mockResolvedValue(null);
  });

  afterEach(() => {
    resetCommerceStoreForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reconciles to granted when server reports active', async () => {
    const serverMandate: SpendMandate = {
      id: 'mandate-1',
      userId: 'u1',
      ceilingAmount: 1000,
      currencyCode: 'USD',
      consumedAmount: 100,
      status: 'active',
      source: 'agentic',
      remainingAmount: 900,
    };
    vi.mocked(getSpendMandateAsk).mockResolvedValue({
      id: 'a1',
      status: 'active',
      userId: 'u1',
      backendRecipeId: 'r1',
      priceAmount: 100,
      currencyCode: 'USD',
      ceilingAmount: 1000,
      mandateId: 'mandate-1',
    });
    vi.mocked(getCurrentSpendMandate).mockResolvedValue(serverMandate);

    const pending = openAsk({
      recipeId: 'r1',
      askId: 'a1',
      priceAmount: 100,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    await vi.advanceTimersByTimeAsync(2600);
    await expect(pending).resolves.toBe(true);
    expect(getActiveAsk()).toBeNull();
    expect(getMandate()).toEqual(serverMandate);
  });

  it('reconciles to declined when server reports declined', async () => {
    vi.mocked(getSpendMandateAsk).mockResolvedValue({
      id: 'a1',
      status: 'declined',
      userId: 'u1',
      backendRecipeId: 'r1',
      priceAmount: 100,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    const pending = openAsk({
      recipeId: 'r1',
      askId: 'a1',
      priceAmount: 100,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    await vi.advanceTimersByTimeAsync(2600);
    await expect(pending).resolves.toBe(false);
    expect(getActiveAsk()).toBeNull();
  });

  it('stops polling after local resolve', async () => {
    const pending = openAsk({
      recipeId: 'r1',
      askId: 'a1',
      priceAmount: 100,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    resolveAsk('r1', true);
    await expect(pending).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(getSpendMandateAsk).not.toHaveBeenCalled();
  });
});
