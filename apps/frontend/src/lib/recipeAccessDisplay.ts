import type { CSSProperties } from 'react';
import type { RecipeAccessResponse } from './api';

export type RecipeCommerceBadgeTone = 'loading' | 'locked' | 'free' | 'owned';

export interface RecipeCommerceBadge {
  label: string;
  tone: RecipeCommerceBadgeTone;
}

export function formatRecipeAccessPrice(access: RecipeAccessResponse): string | null {
  const amount = access.offering?.priceAmount;
  if (amount == null || amount <= 0) {
    return null;
  }

  const code = access.offering?.currencyCode?.toUpperCase();
  const symbol = code === 'USD' || code === 'US' ? '$' : code === 'GBP' ? '£' : code === 'EUR' ? '€' : '$';
  return `${symbol}${(amount / 100).toFixed(2)}`;
}

export function getRecipeCommerceBadge(
  access: RecipeAccessResponse | null | undefined,
  isLoading: boolean,
): RecipeCommerceBadge | null {
  if (isLoading) {
    return { label: '…', tone: 'loading' };
  }

  if (!access) {
    return null;
  }

  switch (access.accessState) {
    case 'locked': {
      const price = formatRecipeAccessPrice(access);
      return { label: price ? `Locked · ${price}` : 'Locked', tone: 'locked' };
    }
    case 'free':
      return { label: 'Free', tone: 'free' };
    case 'owned':
      return { label: 'Unlocked', tone: 'owned' };
    default:
      return null;
  }
}

export const RECIPE_COMMERCE_BADGE_STYLES: Record<RecipeCommerceBadgeTone, CSSProperties> = {
  loading: {
    background: 'rgba(35, 66, 82, 0.72)',
  },
  locked: {
    background: '#7C5AC3',
    boxShadow: '0 8px 18px rgba(124, 90, 195, 0.35)',
  },
  free: {
    background: '#3D6E6C',
  },
  owned: {
    background: '#10B981',
  },
};
