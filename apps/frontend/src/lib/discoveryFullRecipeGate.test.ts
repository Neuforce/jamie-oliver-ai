import { describe, expect, it } from 'vitest';
import {
  getLatestSingleRecipeFromConversation,
  getRecipeDetailForOpenIntent,
  jamieRecentlyOfferedFullRecipeView,
  shouldOpenRecipeFromVoiceUtterance,
  userAffirmsGoToFullRecipe,
} from './discoveryFullRecipeGate';

describe('discoveryFullRecipeGate', () => {
  const staleRisottoDetail = {
    type: 'jamie' as const,
    content: 'Here is a risotto from yesterday.',
    recipeDetail: {
      recipe_id: 'grilled-mushroom-risotto',
      title: 'Grilled Mushroom Risotto',
      description: 'Old session',
      ingredients: [],
      steps: [],
    },
  };

  const saladCarouselTurn = {
    type: 'jamie' as const,
    content: "I've found a lovely salad for you. Fancy giving this one a try?",
    recipes: [
      {
        backendId: 'chopped-rainbow-salad',
        title: 'Chopped Rainbow Salad',
        description: 'Fresh and vibrant',
      },
    ],
  };

  it('does not open the modal on bare "yes" after try-this offer', () => {
    const messages = [staleRisottoDetail, saladCarouselTurn];
    expect(jamieRecentlyOfferedFullRecipeView(messages)).toBe(false);
    expect(userAffirmsGoToFullRecipe('Yes', messages)).toBe(false);
    expect(shouldOpenRecipeFromVoiceUtterance('Yes', messages)).toBe(false);
  });

  it('prefers the latest single-result carousel over stale recipe_detail', () => {
    const messages = [staleRisottoDetail, saladCarouselTurn];
    const latest = getLatestSingleRecipeFromConversation(messages);
    expect(latest?.recipe_id).toBe('chopped-rainbow-salad');
  });

  it('opens on "yes please" after Jamie offered the full recipe view', () => {
    const messages = [
      saladCarouselTurn,
      {
        type: 'jamie' as const,
        content:
          'Would you like me to take you to the full recipe view where you can see ingredients and steps?',
      },
    ];
    expect(jamieRecentlyOfferedFullRecipeView(messages)).toBe(true);
    expect(userAffirmsGoToFullRecipe('Yes, please', messages)).toBe(true);
    const detail = getRecipeDetailForOpenIntent(messages, 'Yes, please');
    expect(detail?.recipe_id).toBe('chopped-rainbow-salad');
  });

  it('opens on explicit "please open the recipe" using focused sheet id', () => {
    const messages = [saladCarouselTurn];
    const detail = getRecipeDetailForOpenIntent(messages, 'Please open the recipe for me', {
      focusedBackendId: 'chopped-rainbow-salad',
    });
    expect(detail?.recipe_id).toBe('chopped-rainbow-salad');
    expect(shouldOpenRecipeFromVoiceUtterance('Please open the recipe for me', messages)).toBe(
      true,
    );
  });
});
