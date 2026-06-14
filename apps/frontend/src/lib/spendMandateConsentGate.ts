/**
 * Spend mandate consent — re-exports from commerceStore.
 */

import type { OpenAskParams } from './commerceStore';
import {
  formatConsentPrice,
  getActiveAsk,
  openAsk,
  resolveAsk,
  subscribeCommerceStore,
} from './commerceStore';

export interface SpendMandateConsentParams {
  priceAmount: number;
  currencyCode: string;
  ceilingAmount: number;
  backendRecipeId?: string;
}

export function getPendingSpendMandateConsent(): SpendMandateConsentParams | null {
  const ask = getActiveAsk();
  if (!ask || ask.status !== 'requested') {
    return null;
  }
  return {
    priceAmount: ask.priceAmount,
    currencyCode: ask.currencyCode,
    ceilingAmount: ask.ceilingAmount,
    backendRecipeId: ask.recipeId,
  };
}

export function requestSpendMandateConsent(params: SpendMandateConsentParams): Promise<boolean> {
  const recipeId = params.backendRecipeId?.trim() || 'unknown';
  const openParams: OpenAskParams = {
    recipeId,
    priceAmount: params.priceAmount,
    currencyCode: params.currencyCode,
    ceilingAmount: params.ceilingAmount,
  };
  return openAsk(openParams);
}

export function resolveSpendMandateConsent(approved: boolean): void {
  const ask = getActiveAsk();
  if (!ask) {
    return;
  }
  resolveAsk(ask.recipeId, approved);
}

export { formatConsentPrice };
export const subscribeSpendMandateConsent = subscribeCommerceStore;
