import { describe, expect, it } from 'vitest';
import {
  getVoiceRichPreview,
  messageHasVoiceRichCard,
} from './voiceRichCard';
import type { Recipe } from '../data/recipes';

const sampleRecipe: Recipe = {
  id: 1,
  title: 'Smoked salmon pasta',
  description: 'Quick weeknight dinner',
  category: 'main',
  difficulty: 'Easy',
  time: '25 min',
  servings: 4,
  image: '/img.jpg',
  ingredients: [],
  instructions: [],
  tips: [],
};

describe('voiceRichCard', () => {
  it('detects recipe payloads on Jamie messages', () => {
    expect(
      messageHasVoiceRichCard({
        type: 'jamie',
        recipes: [sampleRecipe],
      }),
    ).toBe(true);
    expect(messageHasVoiceRichCard({ type: 'user' })).toBe(false);
  });

  it('builds a compact preview for recipe carousels', () => {
    const preview = getVoiceRichPreview({
      type: 'jamie',
      recipes: [sampleRecipe, { ...sampleRecipe, id: 2, title: 'Other' }],
    });
    expect(preview?.kind).toBe('recipes');
    expect(preview?.title).toBe('2 recipes');
    expect(preview?.chips).toContain('25 min');
    expect(preview?.chips).toContain('Easy');
  });
});
