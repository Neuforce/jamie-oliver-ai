import { describe, expect, it } from 'vitest';
import {
  getVoiceRichCardPreview,
  isVoiceExpandableMessage,
  resolveVoiceFeatured,
} from './voiceRichCard';
import type { Recipe } from '../data/recipes';
import type { MealPlanData } from './api';

const sampleRecipe: Recipe = {
  id: 1,
  title: 'Black Forest Trifle',
  description: 'Dessert',
  category: 'dessert',
  difficulty: 'Hard',
  time: '45 mins',
  servings: 4,
  image: '/trifle.jpg',
  ingredients: [],
  instructions: [],
  tips: [],
};

const mealPlan: MealPlanData = {
  occasion: 'Romantic dinner',
  serves: 2,
  courses: {
    main: [
      {
        recipe_id: 'meatballs-pasta',
        title: 'Meatballs & Pasta',
      },
    ],
    dessert: [
      {
        recipe_id: 'simple-chocolate-tart',
        title: 'Simple Chocolate Tart',
      },
    ],
  },
  tips: [],
};

describe('voiceRichCard', () => {
  it('prefers meal plan over auxiliary recipes on the same message', () => {
    const message = {
      type: 'jamie' as const,
      mealPlan,
      recipes: [sampleRecipe, { ...sampleRecipe, id: 2, title: 'Other dessert' }],
    };

    const selection = resolveVoiceFeatured(message);
    expect(selection?.featured.kind).toBe('meal_plan');

    const preview = getVoiceRichCardPreview(message);
    expect(preview?.kind).toBe('meal_plan');
    expect(preview?.title).toContain('Romantic dinner');
    expect(preview?.title).not.toContain('recipes');
  });

  it('uses recipes when no higher-priority payload exists', () => {
    const message = {
      type: 'jamie' as const,
      recipes: [sampleRecipe],
    };

    expect(isVoiceExpandableMessage(message)).toBe(true);
    const preview = getVoiceRichCardPreview(message);
    expect(preview?.kind).toBe('recipes');
    expect(preview?.title).toBe('Black Forest Trifle');
  });

  it('plain text Jamie turns are not expandable', () => {
    expect(isVoiceExpandableMessage({ type: 'jamie' })).toBe(false);
  });
});
