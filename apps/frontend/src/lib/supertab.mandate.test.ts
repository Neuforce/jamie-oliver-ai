import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeAccessResponse, SpendMandate } from './api';

// The Supertab browser SDK references `window` at module load, which is absent
// in the node test environment, so stub it out entirely.
vi.mock('@getsupertab/supertab-js', () => ({
  loadSupertab: vi.fn(),
}));

vi.mock('./api', () => ({
  bootstrapSupertabIdentity: vi.fn(),
  createOnetimeOffering: vi.fn(),
  createSpendMandate: vi.fn(),
  getCurrentSpendMandate: vi.fn(),
  getRecipeAccess: vi.fn(),
  syncSupertabPurchase: vi.fn(),
}));

vi.mock('./commerceStore', () => ({
  getMandate: vi.fn(),
}));

import { ensureSpendMandateForAgenticPurchase } from './supertab';
import { createSpendMandate, getCurrentSpendMandate } from './api';
import { getMandate } from './commerceStore';

function lockedAccess(): RecipeAccessResponse {
  return {
    recipeId: 'fish-pie',
    recipeUuid: 'uuid-1',
    accessState: 'locked',
    offering: {
      id: 'offering-1',
      isFree: false,
      contentKey: 'recipe:fish-pie:cook',
      priceAmount: 5,
      currencyCode: 'USD',
    },
    entitlement: null,
    activeSession: null,
  };
}

function mandate(overrides: Partial<SpendMandate> = {}): SpendMandate {
  return {
    id: 'mandate-existing',
    userId: 'user-1',
    ceilingAmount: 1000,
    currencyCode: 'USD',
    consumedAmount: 0,
    status: 'active',
    source: 'agentic',
    remainingAmount: 1000,
    ...overrides,
  };
}

describe('ensureSpendMandateForAgenticPurchase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('sessionStorage', {
      store: new Map<string, string>(),
      getItem(key: string) {
        return this.store.has(key) ? this.store.get(key) : null;
      },
      setItem(key: string, value: string) {
        this.store.set(key, value);
      },
      removeItem(key: string) {
        this.store.delete(key);
      },
    });
  });

  it('mints a mandate when consent is granted and none exists', async () => {
    vi.mocked(getCurrentSpendMandate).mockResolvedValue(null);
    vi.mocked(getMandate).mockReturnValue(null);
    vi.mocked(createSpendMandate).mockResolvedValue(mandate({ id: 'mandate-new' }));

    const id = await ensureSpendMandateForAgenticPurchase('user-1', lockedAccess(), true);

    expect(id).toBe('mandate-new');
    expect(createSpendMandate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createSpendMandate).mock.calls[0][0]).toMatchObject({
      user_id: 'user-1',
      ceiling_amount: 1000,
      currency_code: 'USD',
      source: 'agentic',
    });
  });

  it('does NOT mint a mandate before consent is granted', async () => {
    vi.mocked(getCurrentSpendMandate).mockResolvedValue(null);
    vi.mocked(getMandate).mockReturnValue(null);

    const id = await ensureSpendMandateForAgenticPurchase('user-1', lockedAccess(), false);

    expect(id).toBeNull();
    expect(createSpendMandate).not.toHaveBeenCalled();
  });

  it('reuses an existing usable server mandate instead of double-minting', async () => {
    vi.mocked(getCurrentSpendMandate).mockResolvedValue(mandate({ id: 'mandate-server' }));
    vi.mocked(getMandate).mockReturnValue(null);

    const id = await ensureSpendMandateForAgenticPurchase('user-1', lockedAccess(), true);

    expect(id).toBe('mandate-server');
    expect(createSpendMandate).not.toHaveBeenCalled();
  });
});
