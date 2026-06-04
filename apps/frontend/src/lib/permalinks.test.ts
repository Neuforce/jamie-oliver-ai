import { describe, expect, it } from 'vitest';
import {
  appStateToUrl,
  isLegacyNumericSlug,
  parsePermalink,
  routeToUrl,
} from './permalinks';

describe('permalinks', () => {
  it('parses home route', () => {
    expect(parsePermalink('/')).toEqual({ kind: 'home' });
  });

  it('parses recipes route with query params', () => {
    expect(parsePermalink('/recipes', '?category=Dessert&q=bread&view=grid')).toEqual({
      kind: 'recipes',
      category: 'Dessert',
      q: 'bread',
      view: 'grid',
    });
  });

  it('parses my-recipes route', () => {
    expect(parsePermalink('/my-recipes')).toEqual({ kind: 'my-recipes' });
  });

  it('parses recipe and cook routes with encoded slugs', () => {
    expect(parsePermalink('/recipe/basic-bread-recipe')).toEqual({
      kind: 'recipe',
      slug: 'basic-bread-recipe',
    });
    expect(parsePermalink('/recipe/basic-bread-recipe/cook')).toEqual({
      kind: 'cook',
      slug: 'basic-bread-recipe',
    });
  });

  it('returns unknown for unrecognized paths', () => {
    expect(parsePermalink('/settings')).toEqual({ kind: 'unknown' });
  });

  it('builds URLs from routes', () => {
    expect(routeToUrl({ kind: 'home' })).toBe('/');
    expect(routeToUrl({ kind: 'my-recipes' })).toBe('/my-recipes');
    expect(routeToUrl({ kind: 'recipe', slug: 'basic-bread-recipe' })).toBe(
      '/recipe/basic-bread-recipe',
    );
    expect(routeToUrl({ kind: 'cook', slug: 'basic-bread-recipe' })).toBe(
      '/recipe/basic-bread-recipe/cook',
    );
    expect(
      routeToUrl({ kind: 'recipes', category: 'All', q: '', view: 'feed' }),
    ).toBe('/recipes');
    expect(
      routeToUrl({ kind: 'recipes', category: 'Dessert', q: 'pie', view: 'grid' }),
    ).toBe('/recipes?category=Dessert&q=pie&view=grid');
  });

  it('detects legacy numeric slugs', () => {
    expect(isLegacyNumericSlug('42')).toBe(true);
    expect(isLegacyNumericSlug('basic-bread-recipe')).toBe(false);
  });

  it('maps app state to URL with cook taking priority', () => {
    expect(
      appStateToUrl({
        activeView: 'recipes',
        selectedCategory: 'All',
        searchQuery: '',
        viewMode: 'feed',
        selectedRecipeSlug: 'basic-bread-recipe',
        cookingRecipeSlug: null,
      }),
    ).toBe('/recipe/basic-bread-recipe');

    expect(
      appStateToUrl({
        activeView: 'recipes',
        selectedCategory: 'All',
        searchQuery: '',
        viewMode: 'feed',
        selectedRecipeSlug: 'basic-bread-recipe',
        cookingRecipeSlug: 'basic-bread-recipe',
      }),
    ).toBe('/recipe/basic-bread-recipe/cook');
  });
});
