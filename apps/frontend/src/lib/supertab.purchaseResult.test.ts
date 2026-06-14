import { describe, expect, it, vi } from 'vitest';

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

import { extractPurchaseFromResult } from './supertab';

describe('extractPurchaseFromResult', () => {
  it('reads the singular { purchase } shape', () => {
    const purchase = extractPurchaseFromResult({
      purchase: { id: 'p1', status: 'completed' },
      actionRequired: false,
    });
    expect(purchase?.status).toBe('completed');
    expect(purchase?.id).toBe('p1');
  });

  // Regression: a successful silent on-tab charge returns the PLURAL shape.
  // Reading only `result.purchase` collapsed this to null -> false `abandoned`.
  it('reads the plural { purchases: [...] } shape and prefers completed', () => {
    const purchase = extractPurchaseFromResult({
      purchases: [
        { id: 'p-pending', status: 'pending' },
        { id: 'p-completed', status: 'completed' },
      ],
      actionRequired: false,
    });
    expect(purchase?.status).toBe('completed');
    expect(purchase?.id).toBe('p-completed');
  });

  it('falls back to a pending record when none are completed', () => {
    const purchase = extractPurchaseFromResult({
      purchases: [{ id: 'p-pending', status: 'pending' }],
      actionRequired: false,
    });
    expect(purchase?.status).toBe('pending');
  });

  it('returns null for empty / malformed results', () => {
    expect(extractPurchaseFromResult(undefined)).toBeNull();
    expect(extractPurchaseFromResult(null)).toBeNull();
    expect(extractPurchaseFromResult({ actionRequired: true })).toBeNull();
    expect(extractPurchaseFromResult({ purchases: [] })).toBeNull();
    expect(extractPurchaseFromResult({ purchase: null })).toBeNull();
  });
});
