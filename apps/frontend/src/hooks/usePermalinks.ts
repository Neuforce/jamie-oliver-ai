import { useCallback, useEffect, useRef } from 'react';
import type { TabView } from '../components/TabNav';
import type { Recipe } from '../data/recipes';
import { hydrateRecipe } from '../data/recipeLoader';
import { loadRecipeBySlug } from '../data/loadRecipeBySlug';
import type { RecipeAccessResponse } from '../lib/api';
import {
  appStateToUrl,
  isLegacyNumericSlug,
  parsePermalink,
  recipesFiltersToRoute,
  routeToUrl,
  type PermalinkRoute,
  type ViewMode,
} from '../lib/permalinks';

export type PermalinkNotFoundState = {
  slug: string;
} | null;

type UsePermalinksOptions = {
  activeView: TabView;
  setActiveView: (view: TabView) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  viewMode: ViewMode;
  setViewMode: (value: ViewMode) => void;
  selectedRecipe: Recipe | null;
  setSelectedRecipe: (recipe: Recipe | null) => void;
  cookingRecipe: Recipe | null;
  setCookingRecipe: (recipe: Recipe | null) => void;
  loadedRecipesByBackendId: Map<string, Recipe>;
  loadRecipeAccess: (
    recipe: Recipe,
    options?: { force?: boolean; userId?: string },
  ) => Promise<RecipeAccessResponse | null>;
  startCookingOverlay: (recipe: Recipe) => void;
  setIsLoading: (loading: boolean) => void;
  permalinkNotFound: PermalinkNotFoundState;
  setPermalinkNotFound: (state: PermalinkNotFoundState) => void;
  setPermalinkResolving: (resolving: boolean) => void;
  onRecipeResolved?: (recipe: Recipe) => void;
};

type NavigateOptions = {
  replace?: boolean;
};

function pushHistory(url: string, replace: boolean): void {
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === url) {
    return;
  }
  if (replace) {
    window.history.replaceState(window.history.state, '', url);
  } else {
    window.history.pushState(window.history.state, '', url);
  }
}

export function usePermalinks(options: UsePermalinksOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const suppressUrlSyncRef = useRef(false);
  const applyingRouteRef = useRef(false);

  const resolveRecipe = useCallback(
    async (slug: string): Promise<Recipe | null> => {
      const cached = optionsRef.current.loadedRecipesByBackendId.get(slug);
      const base = cached ?? await loadRecipeBySlug(slug);
      if (!base) {
        return null;
      }
      const hydrated = await hydrateRecipe(base);
      optionsRef.current.onRecipeResolved?.(hydrated);
      return hydrated;
    },
    [],
  );

  const applyRoute = useCallback(
    async (route: PermalinkRoute): Promise<void> => {
      if (route.kind === 'unknown') {
        optionsRef.current.setPermalinkNotFound(null);
        optionsRef.current.setActiveView('recipes');
        optionsRef.current.setSelectedRecipe(null);
        optionsRef.current.setCookingRecipe(null);
        return;
      }

      applyingRouteRef.current = true;
      suppressUrlSyncRef.current = true;

      const {
        setActiveView,
        setSearchQuery,
        setSelectedCategory,
        setViewMode,
        setSelectedRecipe,
        setCookingRecipe,
        setPermalinkNotFound,
        setPermalinkResolving,
        setIsLoading,
        loadRecipeAccess,
        startCookingOverlay,
      } = optionsRef.current;

      try {
        switch (route.kind) {
          case 'home':
            setPermalinkNotFound(null);
            setCookingRecipe(null);
            setSelectedRecipe(null);
            setActiveView('chat');
            break;

          case 'recipes':
            setPermalinkNotFound(null);
            setCookingRecipe(null);
            setSelectedRecipe(null);
            setActiveView('recipes');
            setSearchQuery(route.q ?? '');
            setSelectedCategory(route.category ?? 'All');
            setViewMode(route.view ?? 'feed');
            break;

          case 'my-recipes':
            setPermalinkNotFound(null);
            setCookingRecipe(null);
            setSelectedRecipe(null);
            setActiveView('my-recipes');
            break;

          case 'recipe': {
            if (isLegacyNumericSlug(route.slug)) {
              setPermalinkNotFound({ slug: route.slug });
              setCookingRecipe(null);
              setSelectedRecipe(null);
              setActiveView('recipes');
              break;
            }

            setPermalinkNotFound(null);
            setCookingRecipe(null);
            setActiveView('recipes');
            setPermalinkResolving(true);
            setIsLoading(true);

            const recipe = await resolveRecipe(route.slug);
            setPermalinkResolving(false);
            setIsLoading(false);

            if (!recipe) {
              setPermalinkNotFound({ slug: route.slug });
              setSelectedRecipe(null);
              break;
            }

            setSelectedRecipe(recipe);
            void loadRecipeAccess(recipe);
            break;
          }

          case 'cook': {
            if (isLegacyNumericSlug(route.slug)) {
              setPermalinkNotFound({ slug: route.slug });
              setCookingRecipe(null);
              setSelectedRecipe(null);
              setActiveView('recipes');
              break;
            }

            setPermalinkNotFound(null);
            setActiveView('recipes');
            setPermalinkResolving(true);
            setIsLoading(true);

            const recipe = await resolveRecipe(route.slug);
            setPermalinkResolving(false);
            setIsLoading(false);

            if (!recipe) {
              setPermalinkNotFound({ slug: route.slug });
              setSelectedRecipe(null);
              setCookingRecipe(null);
              break;
            }

            const access = await loadRecipeAccess(recipe, { force: true });
            if (!access) {
              setSelectedRecipe(recipe);
              setCookingRecipe(null);
              break;
            }

            if (access.accessState === 'locked') {
              setSelectedRecipe(recipe);
              setCookingRecipe(null);
              break;
            }

            setSelectedRecipe(null);
            startCookingOverlay(recipe);
            break;
          }
        }
      } finally {
        applyingRouteRef.current = false;
        suppressUrlSyncRef.current = false;
      }
    },
    [resolveRecipe],
  );

  const navigateToRoute = useCallback(
    (route: PermalinkRoute, navigateOptions: NavigateOptions = {}) => {
      const url = routeToUrl(route);
      pushHistory(url, navigateOptions.replace ?? false);
    },
    [],
  );

  const syncUrlFromAppState = useCallback(
    (navigateOptions: NavigateOptions = {}) => {
      if (suppressUrlSyncRef.current || applyingRouteRef.current) {
        return;
      }

      const {
        activeView,
        selectedCategory,
        searchQuery,
        viewMode,
        selectedRecipe,
        cookingRecipe,
      } = optionsRef.current;

      const url = appStateToUrl({
        activeView,
        selectedCategory,
        searchQuery,
        viewMode,
        selectedRecipeSlug: selectedRecipe?.backendId ?? null,
        cookingRecipeSlug: cookingRecipe?.backendId ?? null,
      });

      pushHistory(url, navigateOptions.replace ?? false);
    },
    [],
  );

  const navigateToTab = useCallback(
    (view: TabView, navigateOptions?: NavigateOptions) => {
      switch (view) {
        case 'chat':
          navigateToRoute({ kind: 'home' }, navigateOptions);
          break;
        case 'recipes':
          navigateToRoute(
            recipesFiltersToRoute({
              category: optionsRef.current.selectedCategory,
              q: optionsRef.current.searchQuery,
              viewMode: optionsRef.current.viewMode,
            }),
            navigateOptions,
          );
          break;
        case 'my-recipes':
          navigateToRoute({ kind: 'my-recipes' }, navigateOptions);
          break;
      }
    },
    [navigateToRoute],
  );

  const navigateToRecipe = useCallback(
    (recipe: Recipe, navigateOptions?: NavigateOptions) => {
      if (!recipe.backendId) {
        return;
      }
      navigateToRoute({ kind: 'recipe', slug: recipe.backendId }, navigateOptions);
    },
    [navigateToRoute],
  );

  const navigateToCook = useCallback(
    (recipe: Recipe, navigateOptions?: NavigateOptions) => {
      if (!recipe.backendId) {
        return;
      }
      navigateToRoute({ kind: 'cook', slug: recipe.backendId }, navigateOptions);
    },
    [navigateToRoute],
  );

  const navigateCloseRecipe = useCallback(
    (fallbackView: TabView = 'recipes', navigateOptions?: NavigateOptions) => {
      navigateToTab(fallbackView, navigateOptions);
    },
    [navigateToTab],
  );

  const navigateCloseCook = useCallback(
    (recipe: Recipe | null, navigateOptions?: NavigateOptions) => {
      if (recipe?.backendId) {
        navigateToRoute({ kind: 'recipe', slug: recipe.backendId }, navigateOptions);
        return;
      }
      navigateToTab('recipes', navigateOptions);
    },
    [navigateToRoute, navigateToTab],
  );

  const navigateRecipesFilters = useCallback(
    (
      filters: { category: string; q: string; viewMode: ViewMode },
      navigateOptions?: NavigateOptions,
    ) => {
      navigateToRoute(recipesFiltersToRoute(filters), navigateOptions);
    },
    [navigateToRoute],
  );

  const navigateBrowseRecipes = useCallback(
    (navigateOptions?: NavigateOptions) => {
      optionsRef.current.setPermalinkNotFound(null);
      navigateToRoute({ kind: 'recipes' }, navigateOptions);
    },
    [navigateToRoute],
  );

  useEffect(() => {
    const initialRoute = parsePermalink(
      window.location.pathname,
      window.location.search,
    );
    void applyRoute(initialRoute);

    const onPopState = () => {
      const route = parsePermalink(window.location.pathname, window.location.search);
      void applyRoute(route);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyRoute]);

  return {
    navigateToTab,
    navigateToRecipe,
    navigateToCook,
    navigateCloseRecipe,
    navigateCloseCook,
    navigateRecipesFilters,
    navigateBrowseRecipes,
    syncUrlFromAppState,
  };
}
