/**
 * Permalink parsing and URL building for the Jamie Oliver AI SPA.
 * Slugs use stable backend `recipe_id` (recipe.backendId), never numeric Recipe.id.
 */

export type ViewMode = 'grid' | 'feed';

export type PermalinkRoute =
  | { kind: 'home' }
  | {
      kind: 'recipes';
      category?: string;
      q?: string;
      view?: ViewMode;
    }
  | { kind: 'my-recipes' }
  | { kind: 'recipe'; slug: string }
  | { kind: 'cook'; slug: string }
  | { kind: 'unknown' };

export type PermalinkTab = 'chat' | 'recipes' | 'my-recipes';

export type PermalinkAppState = {
  activeView: PermalinkTab;
  selectedCategory: string;
  searchQuery: string;
  viewMode: ViewMode;
  selectedRecipeSlug: string | null;
  cookingRecipeSlug: string | null;
};

const DEFAULT_CATEGORY = 'All';
const DEFAULT_VIEW: ViewMode = 'feed';

/** Returns true when slug looks like a legacy numeric Recipe.id (not a stable backend slug). */
export function isLegacyNumericSlug(slug: string): boolean {
  const trimmed = slug.trim();
  return trimmed.length > 0 && /^\d+$/.test(trimmed);
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

function parseRecipesQuery(search: string): {
  category?: string;
  q?: string;
  view?: ViewMode;
} {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const category = params.get('category')?.trim();
  const q = params.get('q')?.trim();
  const viewRaw = params.get('view')?.trim();
  const view = viewRaw === 'grid' || viewRaw === 'feed' ? viewRaw : undefined;
  return {
    category: category || undefined,
    q: q || undefined,
    view,
  };
}

export function parsePermalink(pathname: string, search = ''): PermalinkRoute {
  const path = normalizePathname(pathname);

  if (path === '/') {
    return { kind: 'home' };
  }

  if (path === '/recipes') {
    return { kind: 'recipes', ...parseRecipesQuery(search) };
  }

  if (path === '/my-recipes') {
    return { kind: 'my-recipes' };
  }

  const recipeCookMatch = path.match(/^\/recipe\/([^/]+)\/cook$/);
  if (recipeCookMatch) {
    return { kind: 'cook', slug: decodeURIComponent(recipeCookMatch[1]) };
  }

  const recipeMatch = path.match(/^\/recipe\/([^/]+)$/);
  if (recipeMatch) {
    return { kind: 'recipe', slug: decodeURIComponent(recipeMatch[1]) };
  }

  return { kind: 'unknown' };
}

function buildRecipesQueryString(options: {
  category?: string;
  q?: string;
  view?: ViewMode;
}): string {
  const params = new URLSearchParams();
  const category = options.category?.trim();
  const q = options.q?.trim();
  const view = options.view;

  if (category && category !== DEFAULT_CATEGORY) {
    params.set('category', category);
  }
  if (q) {
    params.set('q', q);
  }
  if (view && view !== DEFAULT_VIEW) {
    params.set('view', view);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function routeToUrl(route: PermalinkRoute): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'recipes':
      return `/recipes${buildRecipesQueryString({
        category: route.category,
        q: route.q,
        view: route.view,
      })}`;
    case 'my-recipes':
      return '/my-recipes';
    case 'recipe':
      return `/recipe/${encodeURIComponent(route.slug)}`;
    case 'cook':
      return `/recipe/${encodeURIComponent(route.slug)}/cook`;
    case 'unknown':
      return '/recipes';
  }
}

export function appStateToRoute(state: PermalinkAppState): PermalinkRoute {
  if (state.cookingRecipeSlug) {
    return { kind: 'cook', slug: state.cookingRecipeSlug };
  }

  if (state.selectedRecipeSlug) {
    return { kind: 'recipe', slug: state.selectedRecipeSlug };
  }

  switch (state.activeView) {
    case 'chat':
      return { kind: 'home' };
    case 'my-recipes':
      return { kind: 'my-recipes' };
    case 'recipes':
      return {
        kind: 'recipes',
        category: state.selectedCategory,
        q: state.searchQuery,
        view: state.viewMode,
      };
  }
}

export function appStateToUrl(state: PermalinkAppState): string {
  return routeToUrl(appStateToRoute(state));
}

export function recipesFiltersToRoute(filters: {
  category: string;
  q: string;
  viewMode: ViewMode;
}): PermalinkRoute {
  return {
    kind: 'recipes',
    category: filters.category,
    q: filters.q,
    view: filters.viewMode,
  };
}
