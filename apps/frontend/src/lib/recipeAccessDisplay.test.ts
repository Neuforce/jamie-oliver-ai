import { describe, expect, it } from 'vitest';
import {
  getRecipeCommerceBadge,
  RECIPE_COMMERCE_BADGE_STYLES,
  RECIPE_COMMERCE_PROCESSING_BADGE,
} from './recipeAccessDisplay';
import type { RecipeAccessResponse } from './api';

function lockedAccess(): RecipeAccessResponse {
  return {
    recipeId: 'fish-pie',
    recipeUuid: 'uuid-1',
    accessState: 'locked',
    offering: {
      priceAmount: 299,
      currencyCode: 'GBP',
      contentKey: 'recipe:fish-pie:cook',
    },
    entitlement: null,
    session: null,
  };
}

describe('recipeAccessDisplay processing badge', () => {
  it('exposes a processing badge tone with purple styling', () => {
    expect(RECIPE_COMMERCE_PROCESSING_BADGE).toEqual({
      label: 'Putting on Tab…',
      tone: 'processing',
    });
    expect(RECIPE_COMMERCE_BADGE_STYLES.processing.background).toBe('#7C5AC3');
  });

  it('still derives locked/free/owned badges from access when not loading', () => {
    expect(getRecipeCommerceBadge(lockedAccess(), false)).toEqual({
      label: 'Locked · £2.99',
      tone: 'locked',
    });
    expect(getRecipeCommerceBadge({ ...lockedAccess(), accessState: 'owned' }, false)).toEqual({
      label: 'Unlocked',
      tone: 'owned',
    });
  });
});
