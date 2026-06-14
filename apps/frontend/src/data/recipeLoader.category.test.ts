import { describe, expect, it } from 'vitest';
import { resolveBrowseCategory } from '../data/recipeLoader';

describe('resolveBrowseCategory', () => {
  it('classifies salads from title even when metadata says vegetables', () => {
    expect(
      resolveBrowseCategory(
        'Chopped Rainbow Salad',
        'A colourful vegan salad',
        'vegetables',
      ),
    ).toBe('Salads');
  });

  it('falls back to formatted metadata when heuristics are generic', () => {
    expect(resolveBrowseCategory('Wonderful veg tagine', 'A gorgeous tagine', 'vegetables')).toBe(
      'Vegetables',
    );
  });

  it('does not surface raw ingredient slugs like eggs when title hints a dish type', () => {
    expect(
      resolveBrowseCategory('French toast', 'Breakfast classic with eggs', 'eggs'),
    ).toBe('Breakfast');
  });
});
