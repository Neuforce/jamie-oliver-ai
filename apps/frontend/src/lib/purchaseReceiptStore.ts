/**
 * Purchase receipts — re-exports from commerceStore.
 */

export type { PurchaseReceipt } from './commerceStore';

import {
  getRecipeReceipt,
  setReceipt,
  subscribeCommerceStore,
} from './commerceStore';

export function getPurchaseReceipts(): import('./commerceStore').PurchaseReceipt[] {
  // Legacy list view — receipts are per-recipe; return non-null entries only when needed.
  return [];
}

export function addPurchaseReceipt(
  receipt: Omit<import('./commerceStore').PurchaseReceipt, 'id' | 'timestamp'>,
): import('./commerceStore').PurchaseReceipt {
  return setReceipt(receipt.backendRecipeId, {
    recipeTitle: receipt.recipeTitle,
    priceLabel: receipt.priceLabel,
  });
}

export function getLatestReceiptForRecipe(backendRecipeId: string) {
  return getRecipeReceipt(backendRecipeId);
}

export const subscribePurchaseReceipts = subscribeCommerceStore;
