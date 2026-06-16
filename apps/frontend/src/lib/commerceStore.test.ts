import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { RecipeAccessResponse, SpendMandate } from './api';
import {
  clearActiveAsk,
  getActiveAsk,
  getCommerceState,
  getMandate,
  getRecipeAccess,
  getRecipeReceipt,
  getUnlockAskMeta,
  getUnlockState,
  isUnlockSurfaceState,
  openAsk,
  resetCommerceStoreForTests,
  resolveAsk,
  setAccess,
  setMandate,
  setReceipt,
  setUnlockState,
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

  it('openAsk merges metadata when same recipe is already pending', () => {
    openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    openAsk({
      recipeId: 'fish-chips',
      askId: 'ask-123',
      priceAmount: 25,
      currencyCode: 'GBP',
      ceilingAmount: 1200,
    });

    expect(getActiveAsk()).toMatchObject({
      recipeId: 'fish-chips',
      askId: 'ask-123',
      priceAmount: 25,
      currencyCode: 'GBP',
      ceilingAmount: 1200,
    });
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

  it('getUnlockState defaults to locked and setUnlockState updates it', () => {
    expect(getUnlockState('fish-chips')).toBe('locked');
    setUnlockState('fish-chips', 'processing');
    expect(getUnlockState('fish-chips')).toBe('processing');
    expect(getCommerceState('fish-chips').unlockState).toBe('processing');
  });

  it('openAsk projects requested unlockState + askMeta for the recipe', () => {
    openAsk({
      recipeId: 'fish-chips',
      askId: 'ask-1',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });

    expect(getUnlockState('fish-chips')).toBe('requested');
    expect(getUnlockAskMeta('fish-chips')).toMatchObject({
      askId: 'ask-1',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });
    expect(getCommerceState('fish-chips').unlockState).toBe('requested');
  });

  it('askMeta survives ask resolution so the surface can keep rendering', () => {
    openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });
    resolveAsk('fish-chips', true);

    // The ask itself is gone, but the projected metadata persists for the card.
    expect(getActiveAsk()).toBeNull();
    expect(getUnlockAskMeta('fish-chips')).toMatchObject({ priceAmount: 5 });
  });

  it('superseding a pending ask collapses the old recipe surface to locked', () => {
    openAsk({ recipeId: 'salad-a', priceAmount: 5, currencyCode: 'USD', ceilingAmount: 1000 });
    expect(getUnlockState('salad-a')).toBe('requested');

    openAsk({ recipeId: 'salad-b', priceAmount: 5, currencyCode: 'USD', ceilingAmount: 1000 });
    expect(getUnlockState('salad-a')).toBe('locked');
    expect(getUnlockState('salad-b')).toBe('requested');
  });

  it('isUnlockSurfaceState distinguishes locked from active surfaces', () => {
    expect(isUnlockSurfaceState('locked')).toBe(false);
    expect(isUnlockSurfaceState('requested')).toBe(true);
    expect(isUnlockSurfaceState('processing')).toBe(true);
    expect(isUnlockSurfaceState('unlocked')).toBe(true);
    expect(isUnlockSurfaceState('needsCheckout')).toBe(true);
    expect(isUnlockSurfaceState('noTab')).toBe(true);
    expect(isUnlockSurfaceState('declined')).toBe(true);
    expect(isUnlockSurfaceState('failed')).toBe(true);
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

  it('openAsk is a no-op when unlock is processing or unlocked', async () => {
    setUnlockState('fish-chips', 'processing');
    const processingPending = openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });
    await expect(processingPending).resolves.toBe(false);
    expect(getUnlockState('fish-chips')).toBe('processing');
    expect(getActiveAsk()).toBeNull();

    setUnlockState('salad-a', 'unlocked');
    const unlockedPending = openAsk({
      recipeId: 'salad-a',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
    });
    await expect(unlockedPending).resolves.toBe(false);
    expect(getUnlockState('salad-a')).toBe('unlocked');
    expect(getActiveAsk()).toBeNull();
  });

  it('openAsk with force bypasses processing guard for auto-charge fallback', () => {
    setUnlockState('fish-chips', 'processing');
    openAsk({
      recipeId: 'fish-chips',
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
      force: true,
    });
    expect(getUnlockState('fish-chips')).toBe('requested');
    expect(getActiveAsk()?.recipeId).toBe('fish-chips');
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
