import { describe, expect, it } from 'vitest';
import {
  addPurchaseReceipt,
  getActiveSurface,
  getPendingSpendMandateConsent,
  requestSpendMandateConsent,
  resolveSpendMandateConsent,
  setActiveSurface,
  shouldRenderCommerceInline,
  shouldRenderCommercePortaled,
} from './agentActionSurfaceStore';

describe('agentActionSurfaceStore', () => {
  it('routes commerce UI to recipe sheet when modal is focused', () => {
    setActiveSurface({ kind: 'recipe_sheet', backendRecipeId: 'chopped-rainbow-salad' });
    expect(getActiveSurface().kind).toBe('recipe_sheet');
    expect(shouldRenderCommercePortaled()).toBe(true);
    expect(shouldRenderCommerceInline()).toBe(false);
  });

  it('routes commerce UI to chat when discovery chat is active', () => {
    setActiveSurface({ kind: 'chat' });
    expect(shouldRenderCommerceInline()).toBe(true);
    expect(shouldRenderCommercePortaled()).toBe(false);
  });

  it('tracks pending consent and receipts in one store', async () => {
    setActiveSurface({ kind: 'chat' });
    const pending = requestSpendMandateConsent({
      priceAmount: 5,
      currencyCode: 'USD',
      ceilingAmount: 1000,
      backendRecipeId: 'fish-chips',
    });
    expect(getPendingSpendMandateConsent()?.backendRecipeId).toBe('fish-chips');
    resolveSpendMandateConsent(true);
    await expect(pending).resolves.toBe(true);
    expect(getPendingSpendMandateConsent()).toBeNull();

    const receipt = addPurchaseReceipt({
      backendRecipeId: 'fish-chips',
      recipeTitle: 'Fish & chips',
      priceLabel: '$0.05',
    });
    expect(receipt.backendRecipeId).toBe('fish-chips');
  });
});
