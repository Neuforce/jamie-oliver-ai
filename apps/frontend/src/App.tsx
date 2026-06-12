import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { recipes, categories, Recipe, initializeRecipes, getCategories } from './data/recipes';
import { hydrateRecipe } from './data/recipeLoader';
import { RecipeCard } from './components/RecipeCard';
import { RecipeModal, type RecipeModalHandle } from './components/RecipeModal';
import { CookWithJamie } from './components/CookWithJamie';
import { ChatView } from './components/ChatView';
import { clearChatHistory } from './lib/chatStorage';
import { TabNav, TabView, type MyTabCardData } from './components/TabNav';
import { Button } from './components/ui/button';
import { Search, ChefHat, Grid3x3, LayoutList, Clock, SlidersHorizontal, X as XIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from './components/ui/sonner';
import { Play, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog';
import { AvatarWithOrganicGlow } from './design-system/components/AvatarWithOrganicGlow';
import { SearchInput } from './design-system/components/SearchInput';
import { RecipeSkeletonLoader } from './components/ui/skeleton-loader';
import { getJamieUser, getMyRecipes, getRecipeAccess, type JamieUserSummary, type OwnedRecipeSummary, type RecipeAccessResponse } from './lib/api';
import { loadRecipeBySlug } from './data/loadRecipeBySlug';
import { usePermalinks } from './hooks/usePermalinks';
import { RecipeNotFound } from './components/RecipeNotFound';
import {
  loadMyTabSnapshot,
  getStoredJamieAccessUserId,
  openMyTab,
  purchaseRecipe,
  pollRecipeAccessUntilUnlocked,
  canStartCookingWithAccess,
  type MyTabAccountSummary,
  type MyTabMessageTone,
  type RecipePurchaseResolution,
  type MyTabSiteSummary,
  type MyTabStatus,
} from './lib/supertab';
import { markAppLoadStage, startAppLoadSession } from './lib/appLoadMetrics';
// @ts-ignore - Vite handles image imports
import jamieAvatarImport from 'figma:asset/9998d3c8aa18fde4e634353cc1af4c783bd57297.png';
// Vite returns the image URL as a string
const jamieAvatar = typeof jamieAvatarImport === 'string' ? jamieAvatarImport : (jamieAvatarImport as any).src || jamieAvatarImport;

export default function App() {
  // Navigation state - unified tab-based navigation
  const [activeView, setActiveView] = useState<TabView>('chat');

  // Recipe browsing state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('feed');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Session management
  const [recipesInProgress, setRecipesInProgress] = useState<Recipe[]>([]);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [pendingRecipe, setPendingRecipe] = useState<Recipe | null>(null);
  const [pendingRecipeAction, setPendingRecipeAction] = useState<'view' | 'cook'>('view');

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [permalinkNotFound, setPermalinkNotFound] = useState<{ slug: string } | null>(null);
  const [permalinkResolving, setPermalinkResolving] = useState(false);
  const [recipeAccessMap, setRecipeAccessMap] = useState<Record<string, RecipeAccessResponse>>({});
  const [recipeAccessErrorIds, setRecipeAccessErrorIds] = useState<Record<string, true>>({});
  const [recipeAccessLoadingId, setRecipeAccessLoadingId] = useState<string | null>(null);

  // Data state
  const [loadedRecipes, setLoadedRecipes] = useState<Recipe[]>(recipes);
  const [availableCategories, setAvailableCategories] = useState<string[]>(categories);
  const [isRecipesCatalogLoading, setIsRecipesCatalogLoading] = useState(recipes.length === 0);
  const [recipesCatalogFailed, setRecipesCatalogFailed] = useState(false);

  // Chat state
  const [initialChatMessage, setInitialChatMessage] = useState<string | undefined>(undefined);
  const [chatKey, setChatKey] = useState(0); // Key to force ChatView remount when clearing
  const [myTabStatus, setMyTabStatus] = useState<MyTabStatus>('unavailable');
  const [isMyTabLoading, setIsMyTabLoading] = useState(false);
  const [myTabAccount, setMyTabAccount] = useState<MyTabAccountSummary | null>(null);
  const [myTabJamieUser, setMyTabJamieUser] = useState<JamieUserSummary | null>(null);
  const [myTabSite, setMyTabSite] = useState<MyTabSiteSummary | null>(null);
  const [myTabMessage, setMyTabMessage] = useState<string | null>(null);
  const [myTabMessageTone, setMyTabMessageTone] = useState<MyTabMessageTone | undefined>(undefined);
  const [myRecipes, setMyRecipes] = useState<OwnedRecipeSummary[]>([]);
  const [isMyRecipesLoading, setIsMyRecipesLoading] = useState(false);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const normalizedSearchQuery = typeof searchQuery === 'string' ? searchQuery : '';
  const [recipeModalVoiceDockOverlap, setRecipeModalVoiceDockOverlap] = useState(false);
  const recipeModalRef = useRef<RecipeModalHandle>(null);
  const pendingEmbeddedPurchaseRef = useRef<((resolution: RecipePurchaseResolution) => void) | null>(null);
  const voiceRecipeUnlockInFlightRef = useRef(false);
  /** Keeps ChatView (and `/ws/chat-voice`) alive when switching tabs with voice or an open recipe sheet. */
  const [discoveryVoiceSessionActive, setDiscoveryVoiceSessionActive] = useState(false);

  useEffect(() => {
    startAppLoadSession();
    markAppLoadStage('app_mount');
  }, []);

  const upsertLoadedRecipe = useCallback((hydrated: Recipe) => {
    const key = hydrated.backendId || String(hydrated.id);
    setLoadedRecipes((prev) => {
      const idx = prev.findIndex((entry) => (entry.backendId || String(entry.id)) === key);
      if (idx < 0) {
        return prev;
      }
      const next = [...prev];
      next[idx] = hydrated;
      return next;
    });
  }, []);

  // Load recipes asynchronously in production (when recipes array is empty)
  useEffect(() => {
    if (recipes.length === 0) {
      setIsRecipesCatalogLoading(true);
      setRecipesCatalogFailed(false);
      initializeRecipes()
        .then((loaded) => {
          setLoadedRecipes(loaded);
          setAvailableCategories(getCategories(loaded));
          markAppLoadStage('recipes_ready', { count: loaded.length });
        })
        .catch((error) => {
          console.error('Failed to load recipes:', error);
          setRecipesCatalogFailed(true);
          markAppLoadStage('recipes_ready', { count: 0, error: true });
        })
        .finally(() => {
          setIsRecipesCatalogLoading(false);
        });
    } else {
      setAvailableCategories(getCategories(recipes));
      markAppLoadStage('recipes_ready', { count: recipes.length, source: 'bundled' });
      setIsRecipesCatalogLoading(false);
    }
  }, []);

  const hydrateJamieUser = useCallback(async (userId?: string, isMounted?: () => boolean) => {
    if (!userId) {
      if (!isMounted || isMounted()) {
        setMyTabJamieUser(null);
      }
      return;
    }

    try {
      const response = await getJamieUser(userId);
      if (!isMounted || isMounted()) {
        setMyTabJamieUser(response.user);
      }
    } catch (error) {
      console.error('Failed to load Jamie user for My Tab:', error);
      if (!isMounted || isMounted()) {
        setMyTabJamieUser(null);
      }
    }
  }, []);

  const loadOwnedRecipes = useCallback(async (userId?: string, isMounted?: () => boolean) => {
    if (!userId) {
      if (!isMounted || isMounted()) {
        setMyRecipes([]);
      }
      return;
    }

    if (!isMounted || isMounted()) {
      setIsMyRecipesLoading(true);
    }

    try {
      const response = await getMyRecipes(userId);
      if (!isMounted || isMounted()) {
        setMyRecipes(response.recipes);
      }
    } catch (error) {
      console.error('Failed to load owned recipes:', error);
      if (!isMounted || isMounted()) {
        setMyRecipes([]);
      }
    } finally {
      if (!isMounted || isMounted()) {
        setIsMyRecipesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const resolveMyTabState = async () => {
      setIsMyTabLoading(true);
      let resolvedStatus: MyTabStatus = 'signed_out';
      try {
        const snapshot = await loadMyTabSnapshot();
        if (!isMounted) {
          return;
        }

        resolvedStatus = snapshot.status;
        setMyTabStatus(snapshot.status);
        setMyTabAccount(snapshot.account ?? null);
        setMyTabSite(snapshot.site ?? null);
        setMyTabMessage(snapshot.message ?? null);
        setMyTabMessageTone(snapshot.messageTone);
        await hydrateJamieUser(snapshot.userId, () => isMounted);
      } catch (error) {
        console.error('Failed to resolve My Tab status:', error);
        resolvedStatus = 'signed_out';
        if (isMounted) {
          setMyTabStatus('signed_out');
          setMyTabAccount(null);
          setMyTabJamieUser(null);
          setMyTabSite(null);
          setMyTabMessage('We could not load My Tab right now. Please try again in a moment.');
          setMyTabMessageTone('error');
        }
      } finally {
        if (isMounted) {
          setIsMyTabLoading(false);
          markAppLoadStage('mytab_ready', {
            status: resolvedStatus,
            loading: false,
          });
        }
      }
    };

    void resolveMyTabState();

    return () => {
      isMounted = false;
    };
  }, [hydrateJamieUser]);

  const currentJamieUserId = myTabJamieUser?.id ?? getStoredJamieAccessUserId() ?? undefined;

  useEffect(() => {
    let isMounted = true;
    void loadOwnedRecipes(currentJamieUserId, () => isMounted);
    return () => {
      isMounted = false;
    };
  }, [currentJamieUserId, loadOwnedRecipes]);

  // Check for recipes with saved sessions
  useEffect(() => {
    const checkSavedSessions = () => {
      const inProgress: Recipe[] = [];
      loadedRecipes.forEach(recipe => {
        const completedRecipe = localStorage.getItem(`completed-recipe-${recipe.id}`);
        if (completedRecipe) return;

        const savedSession = localStorage.getItem(`cooking-session-${recipe.id}`);
        if (savedSession) {
          try {
            const session = JSON.parse(savedSession);
            const now = new Date().getTime();
            const sessionAge = now - session.timestamp;
            if (sessionAge < 24 * 60 * 60 * 1000) {
              inProgress.push(recipe);
            } else {
              localStorage.removeItem(`cooking-session-${recipe.id}`);
            }
          } catch (e) {
            console.error('Error parsing session:', e);
          }
        }
      });
      setRecipesInProgress(inProgress);
    };

    checkSavedSessions();
    if (!cookingRecipe) {
      setTimeout(checkSavedSessions, 100);
    }
  }, [cookingRecipe, loadedRecipes]);

  // Helper functions for session management
  const hasSession = (recipeId: number) => recipesInProgress.some(r => r.id === recipeId);

  const getSessionDetails = (recipeId: number) => {
    const savedSession = localStorage.getItem(`cooking-session-${recipeId}`);
    if (savedSession) {
      try {
        return JSON.parse(savedSession);
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  const getRecipeAccessKey = useCallback((recipe: Recipe) => recipe.backendId || String(recipe.id), []);

  const recipeAccessMapRef = useRef(recipeAccessMap);
  const recipeAccessErrorIdsRef = useRef(recipeAccessErrorIds);
  const recipeAccessInFlightRef = useRef(new Set<string>());
  const recipeAccessErrorToastShownRef = useRef(new Set<string>());

  recipeAccessMapRef.current = recipeAccessMap;
  recipeAccessErrorIdsRef.current = recipeAccessErrorIds;

  const fetchRecipeAccessForKey = useCallback(async (
    key: string,
    recipeId: string,
    options: { force?: boolean; userId?: string } = {},
  ): Promise<RecipeAccessResponse | null> => {
    if (!options.force) {
      const cached = recipeAccessMapRef.current[key];
      if (cached) {
        return cached;
      }
      if (recipeAccessErrorIdsRef.current[key]) {
        return null;
      }
      if (recipeAccessInFlightRef.current.has(key)) {
        return null;
      }
    } else {
      setRecipeAccessErrorIds((prev) => {
        if (!prev[key]) {
          return prev;
        }
        const next = { ...prev };
        delete next[key];
        recipeAccessErrorIdsRef.current = next;
        return next;
      });
      recipeAccessErrorToastShownRef.current.delete(key);
    }

    recipeAccessInFlightRef.current.add(key);
    setRecipeAccessLoadingId(key);

    try {
      const access = await getRecipeAccess(
        recipeId,
        options.userId ?? getStoredJamieAccessUserId() ?? undefined,
      );
      setRecipeAccessMap((prev) => {
        const next = { ...prev, [key]: access };
        recipeAccessMapRef.current = next;
        return next;
      });
      setRecipeAccessErrorIds((prev) => {
        if (!prev[key]) {
          return prev;
        }
        const next = { ...prev };
        delete next[key];
        recipeAccessErrorIdsRef.current = next;
        return next;
      });
      return access;
    } catch (error) {
      console.error('Failed to load recipe access:', error);
      setRecipeAccessErrorIds((prev) => {
        const next = { ...prev, [key]: true };
        recipeAccessErrorIdsRef.current = next;
        return next;
      });
      if (!recipeAccessErrorToastShownRef.current.has(key)) {
        recipeAccessErrorToastShownRef.current.add(key);
        toast.error('Could not load recipe access', {
          description: 'Please try again in a moment.',
        });
      }
      return null;
    } finally {
      recipeAccessInFlightRef.current.delete(key);
      setRecipeAccessLoadingId((current) => (current === key ? null : current));
    }
  }, []);

  const loadRecipeAccess = useCallback(async (
    recipe: Recipe,
    options: { force?: boolean; userId?: string } = {},
  ): Promise<RecipeAccessResponse | null> => {
    if (!recipe.backendId) {
      return null;
    }
    return fetchRecipeAccessForKey(getRecipeAccessKey(recipe), recipe.backendId, options);
  }, [fetchRecipeAccessForKey, getRecipeAccessKey]);

  const startCookingOverlayRef = useRef<(recipe: Recipe) => void>(() => {});

  const loadedRecipesByBackendId = useMemo(() => {
    return new Map(
      loadedRecipes
        .filter((recipe): recipe is Recipe & { backendId: string } => typeof recipe.backendId === 'string' && recipe.backendId.length > 0)
        .map((recipe) => [recipe.backendId, recipe])
    );
  }, [loadedRecipes]);

  const loadRecipeAccessByBackendId = useCallback(async (
    backendId: string,
    options: { force?: boolean; userId?: string } = {},
  ): Promise<RecipeAccessResponse | null> => {
    const recipe = loadedRecipesByBackendId.get(backendId);
    if (recipe) {
      return loadRecipeAccess(recipe, options);
    }
    return fetchRecipeAccessForKey(backendId, backendId, options);
  }, [fetchRecipeAccessForKey, loadRecipeAccess, loadedRecipesByBackendId]);

  const prefetchChatRecipeAccess = useCallback((backendIds: string[]) => {
    for (const backendId of backendIds) {
      if (recipeAccessMapRef.current[backendId]) {
        continue;
      }
      if (recipeAccessErrorIdsRef.current[backendId]) {
        continue;
      }
      if (recipeAccessInFlightRef.current.has(backendId)) {
        continue;
      }
      void loadRecipeAccessByBackendId(backendId);
    }
  }, [loadRecipeAccessByBackendId]);

  const ownedRecipeCollection = useMemo(() => {
    return myRecipes
      .map((ownedRecipe) => loadedRecipesByBackendId.get(ownedRecipe.recipeId))
      .filter((recipe): recipe is Recipe => Boolean(recipe));
  }, [loadedRecipesByBackendId, myRecipes]);

  const {
    navigateToTab,
    navigateToRecipe,
    navigateToCook,
    navigateCloseRecipe,
    navigateCloseCook,
    navigateRecipesFilters,
    navigateBrowseRecipes,
  } = usePermalinks({
    activeView,
    setActiveView,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    viewMode,
    setViewMode,
    selectedRecipe,
    setSelectedRecipe,
    cookingRecipe,
    setCookingRecipe,
    loadedRecipesByBackendId,
    loadRecipeAccess,
    startCookingOverlay: (recipe) => startCookingOverlayRef.current(recipe),
    setIsLoading,
    permalinkNotFound,
    setPermalinkNotFound,
    setPermalinkResolving,
    onRecipeResolved: upsertLoadedRecipe,
  });

  const startCookingOverlay = useCallback((recipe: Recipe) => {
    setIsLoading(true);
    setSelectedRecipe(null);
    setTimeout(() => {
      setCookingRecipe(recipe);
      setIsLoading(false);
      navigateToCook(recipe, { replace: true });
    }, 500);
  }, [navigateToCook]);

  startCookingOverlayRef.current = startCookingOverlay;

  const startCookingForRecipe = useCallback(async (recipe: Recipe) => {
    const hydrated = await hydrateRecipe(recipe);
    upsertLoadedRecipe(hydrated);

    const access = await loadRecipeAccess(hydrated, { force: true });
    if (!access) {
      return;
    }

    if (access.accessState === 'locked') {
      setSelectedRecipe(hydrated);
      navigateToRecipe(hydrated, { replace: true });
      return;
    }

    startCookingOverlay(hydrated);
  }, [loadRecipeAccess, navigateToRecipe, startCookingOverlay, upsertLoadedRecipe]);

  const displayCategories = useMemo(() => {
    return activeView === 'my-recipes'
      ? getCategories(ownedRecipeCollection)
      : availableCategories;
  }, [activeView, availableCategories, ownedRecipeCollection]);

  useEffect(() => {
    if (!displayCategories.includes(selectedCategory)) {
      setSelectedCategory('All');
    }
  }, [displayCategories, selectedCategory]);

  const visibleRecipes = useMemo(() => {
    const sourceRecipes = activeView === 'my-recipes' ? ownedRecipeCollection : loadedRecipes;
    const normalizedQuery = normalizedSearchQuery.toLowerCase();
    return sourceRecipes.filter(recipe => {
      const matchesSearch = recipe.title.toLowerCase().includes(normalizedQuery) ||
                           recipe.description.toLowerCase().includes(normalizedQuery) ||
                           recipe.category.toLowerCase().includes(normalizedQuery);
      const matchesCategory =
        selectedCategory === 'All' ||
        recipe.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [activeView, normalizedSearchQuery, ownedRecipeCollection, selectedCategory, loadedRecipes]);

  useEffect(() => {
    if (activeView === 'recipes' || activeView === 'my-recipes') {
      markAppLoadStage('recipes_route_ready', { view: activeView });
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView === 'recipes' && visibleRecipes.length > 0) {
      markAppLoadStage('recipes_first_card', { count: visibleRecipes.length });
    }
  }, [activeView, visibleRecipes.length]);

  // Recipe interaction handlers
  const handleCookWithJamie = () => {
    if (!selectedRecipe) return;

    const otherActiveSessions = recipesInProgress.filter(r => r.id !== selectedRecipe.id);
    if (otherActiveSessions.length > 0) {
      setPendingRecipe(selectedRecipe);
      setPendingRecipeAction('cook');
      setShowSessionWarning(true);
      return;
    }

    void startCookingForRecipe(selectedRecipe);
  };

  const handleRecipeClick = (recipe: Recipe) => {
    if (cookingRecipe && cookingRecipe.id !== recipe.id) {
      setPendingRecipe(recipe);
      setPendingRecipeAction('view');
      setShowSessionWarning(true);
      return;
    }

    setPermalinkNotFound(null);
    setIsLoading(true);
    void (async () => {
      try {
        const hydrated = await hydrateRecipe(recipe);
        upsertLoadedRecipe(hydrated);
        setSelectedRecipe(hydrated);
        navigateToRecipe(hydrated);
        void loadRecipeAccess(hydrated);
      } finally {
        setIsLoading(false);
      }
    })();
  };

  const handleContinueWithNewRecipe = () => {
    setShowSessionWarning(false);
    if (pendingRecipe) {
      const nextRecipe = pendingRecipe;
      setIsLoading(true);
      setCookingRecipe(null);
      setSelectedRecipe(null);
      setTimeout(() => {
        if (pendingRecipeAction === 'cook') {
          setIsLoading(false);
          void startCookingForRecipe(nextRecipe);
        } else {
          void (async () => {
            try {
              const hydrated = await hydrateRecipe(nextRecipe);
              upsertLoadedRecipe(hydrated);
              setSelectedRecipe(hydrated);
              navigateToRecipe(hydrated);
              void loadRecipeAccess(hydrated);
            } finally {
              setIsLoading(false);
            }
          })();
        }
        setPendingRecipe(null);
        setPendingRecipeAction('view');
      }, 500);
    }
  };

  const handleReturnToActiveSession = () => {
    setShowSessionWarning(false);
    setPendingRecipe(null);
  };

  // Resume cooking directly (from Continue Cooking section)
  const handleResumeCooking = (recipe: Recipe) => {
    void startCookingForRecipe(recipe);
  };

  // Discard a saved session
  const handleDiscardSession = (recipe: Recipe, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent click
    localStorage.removeItem(`cooking-session-${recipe.id}`);
    // Update the recipes in progress list
    setRecipesInProgress(prev => prev.filter(r => r.id !== recipe.id));
    toast.success('Session discarded', {
      description: `${recipe.title} progress has been removed`,
    });
  };

  // Handle prompt clicks from Chat view
  const handlePromptClick = (prompt: string) => {
    setInitialChatMessage(prompt);
  };

  // Handle recipe selection from Chat view
  const handleChatRecipeClick = (recipe: Recipe) => {
    setPermalinkNotFound(null);
    setIsLoading(true);
    void (async () => {
      try {
        const hydrated = await hydrateRecipe(recipe);
        upsertLoadedRecipe(hydrated);
        setSelectedRecipe(hydrated);
        navigateToRecipe(hydrated);
        void loadRecipeAccess(hydrated);
      } finally {
        setIsLoading(false);
      }
    })();
  };

  const handleTabChange = (view: TabView) => {
    setActiveView(view);
    navigateToTab(view);
  };

  // Handle logo click - return to home (Chat with fresh state)
  const handleLogoClick = () => {
    clearChatHistory();
    setChatKey(prev => prev + 1); // Force ChatView to remount with fresh state
    setActiveView('chat');
    setInitialChatMessage(undefined);
    setPermalinkNotFound(null);
    navigateToTab('chat');
  };

  // Handle close chat - clear storage and reset chat
  const handleCloseChat = () => {
    clearChatHistory();
    setChatKey(prev => prev + 1); // Force ChatView to remount with fresh state
    setInitialChatMessage(undefined);
    // Stay in chat view but with cleared state
  };

  const handleOpenMyTab = useCallback(async () => {
    setIsMyTabLoading(true);
    try {
      const snapshot = await openMyTab();
      setMyTabStatus(snapshot.status);
      setMyTabAccount(snapshot.account ?? null);
      setMyTabSite(snapshot.site ?? null);
      setMyTabMessage(snapshot.message ?? null);
      setMyTabMessageTone(snapshot.messageTone);
      await hydrateJamieUser(snapshot.userId);
    } catch (error) {
      console.error('Failed to open My Tab:', error);
      setMyTabStatus('signed_out');
      setMyTabAccount(null);
      setMyTabJamieUser(null);
      setMyTabSite(null);
      setMyTabMessage('We could not open My Tab right now. Please try again in a moment.');
      setMyTabMessageTone('error');
    } finally {
      setIsMyTabLoading(false);
    }
  }, [hydrateJamieUser]);

  const handleOpenMyRecipes = useCallback(() => {
    setActiveView('my-recipes');
    navigateToTab('my-recipes');
  }, [navigateToTab]);

  const waitForEmbeddedPurchaseResolution = useCallback((timeoutMs = 120_000) => {
    return new Promise<RecipePurchaseResolution | null>((resolve) => {
      const timer = window.setTimeout(() => {
        pendingEmbeddedPurchaseRef.current = null;
        resolve(null);
      }, timeoutMs);

      pendingEmbeddedPurchaseRef.current = (resolution) => {
        window.clearTimeout(timer);
        pendingEmbeddedPurchaseRef.current = null;
        resolve(resolution);
      };
    });
  }, []);

  const applyRecipePurchaseOutcome = useCallback(async (
    recipe: Recipe,
    resolution: RecipePurchaseResolution,
  ) => {
    setMyTabStatus(resolution.snapshot.status);
    setMyTabAccount(resolution.snapshot.account ?? null);
    setMyTabSite(resolution.snapshot.site ?? null);
    setMyTabMessage(resolution.snapshot.message ?? null);
    setMyTabMessageTone(resolution.snapshot.messageTone);
    await hydrateJamieUser(resolution.snapshot.userId);
    await loadOwnedRecipes(resolution.snapshot.userId);

    const purchaseCompleted = resolution.state.purchase?.status === 'completed';
    const alreadyOwned = resolution.priorEntitlements.length > 0;
    let refreshedAccess = resolution.refreshedAccess ?? null;

    if (refreshedAccess) {
      setRecipeAccessMap(prev => ({
        ...prev,
        [getRecipeAccessKey(recipe)]: refreshedAccess!,
      }));
    }

    if (purchaseCompleted || alreadyOwned) {
      if (!canStartCookingWithAccess(refreshedAccess) && recipe.backendId) {
        const userId =
          resolution.snapshot.userId
          ?? getStoredJamieAccessUserId()
          ?? undefined;
        if (userId) {
          const polledAccess = await pollRecipeAccessUntilUnlocked(recipe.backendId, userId);
          if (polledAccess) {
            refreshedAccess = polledAccess;
            setRecipeAccessMap(prev => ({
              ...prev,
              [getRecipeAccessKey(recipe)]: polledAccess,
            }));
          }
        }
      }

      toast.success('Recipe unlocked', {
        description: 'Jamie is ready to start cooking with you.',
      });
      startCookingOverlay(recipe);
    }

    await loadRecipeAccess(recipe, { force: true });
  }, [
    getRecipeAccessKey,
    hydrateJamieUser,
    loadOwnedRecipes,
    loadRecipeAccess,
    startCookingOverlay,
  ]);

  const handleRecipePurchaseResolved = useCallback(async (
    recipe: Recipe,
    resolution: RecipePurchaseResolution
  ) => {
    if (pendingEmbeddedPurchaseRef.current) {
      pendingEmbeddedPurchaseRef.current(resolution);
      return;
    }

    await applyRecipePurchaseOutcome(recipe, resolution);
  }, [applyRecipePurchaseOutcome]);

  const handleVoiceRecipePaywallRequested = useCallback(
    async (backendId: string) => {
      const bid = (backendId || '').trim();
      if (!bid || voiceRecipeUnlockInFlightRef.current) {
        return;
      }

      let recipe: Recipe | null =
        selectedRecipe?.backendId === bid ? selectedRecipe : null;

      if (!recipe) {
        recipe = loadedRecipesByBackendId.get(bid) ?? null;
      }
      if (!recipe) {
        recipe = await loadRecipeBySlug(bid);
      }
      if (!recipe) {
        toast.error('Checkout did not match this recipe', {
          description: 'Close the modal and open the recipe again, or tap Unlock on screen.',
        });
        return;
      }

      if (selectedRecipe?.backendId !== bid) {
        setSelectedRecipe(recipe);
        navigateToRecipe(recipe, { replace: true });
      }

      let access =
        recipeAccessMap[getRecipeAccessKey(recipe)] ??
        (await loadRecipeAccess(recipe));
      if (!access) {
        toast.error('Could not check recipe access', {
          description: 'Please try opening checkout from the Unlock button.',
        });
        return;
      }
      if (access.accessState !== 'locked') {
        return;
      }

      voiceRecipeUnlockInFlightRef.current = true;
      try {
        const accessKey = getRecipeAccessKey(recipe);
        flushSync(() => {
          setRecipeAccessMap(prev => ({ ...prev, [accessKey]: access }));
        });
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        const waitPromise = waitForEmbeddedPurchaseResolution(15_000);
        const outcome = await purchaseRecipe(access, {
          openEmbeddedCheckout: async () => {
            document
              .querySelector('[data-supertab-pane]')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await recipeModalRef.current?.openMyTabPurchaseFlow();
          },
          waitForEmbeddedResolution: () => waitPromise,
        });

        if (outcome.via === 'unavailable') {
          toast.error('Could not open My Tab', {
            description: 'Set the purchase-button or paywall experience ID for Supertab.',
          });
          return;
        }

        if (outcome.resolution) {
          await applyRecipePurchaseOutcome(recipe, outcome.resolution);
          return;
        }

        if (outcome.via === 'abandoned') {
          return;
        }
      } catch (error) {
        console.error('Voice-triggered paywall failed:', error);
        toast.error('Could not open My Tab', {
          description: 'Please try again or use Unlock on screen.',
        });
      } finally {
        voiceRecipeUnlockInFlightRef.current = false;
      }
    },
    [
      applyRecipePurchaseOutcome,
      getRecipeAccessKey,
      loadRecipeAccess,
      loadedRecipesByBackendId,
      navigateToRecipe,
      recipeAccessMap,
      selectedRecipe,
      waitForEmbeddedPurchaseResolution,
    ],
  );

  const selectedRecipeBackendId = selectedRecipe?.backendId ?? null;

  useEffect(() => {
    if (!selectedRecipeBackendId) {
      return;
    }
    void loadRecipeAccessByBackendId(selectedRecipeBackendId);
  }, [selectedRecipeBackendId, loadRecipeAccessByBackendId]);

  const selectedRecipeAccess = selectedRecipe
    ? recipeAccessMap[getRecipeAccessKey(selectedRecipe)] ?? null
    : null;
  const isSelectedRecipeAccessLoading = selectedRecipe
    ? recipeAccessLoadingId === getRecipeAccessKey(selectedRecipe)
    : false;
  const isSelectedRecipeAccessFailed = selectedRecipe
    ? Boolean(recipeAccessErrorIds[getRecipeAccessKey(selectedRecipe)])
    : false;
  const unlockedRecipesLabel = `${myRecipes.length} ${myRecipes.length === 1 ? 'recipe' : 'recipes'} unlocked`;
  const myTabHeadline = myTabStatus === 'signed_in'
    ? unlockedRecipesLabel
    : myTabStatus === 'unavailable'
      ? 'My Tab unavailable'
      : 'Unlock recipes with My Tab';
  const myTabDescription = myTabStatus === 'signed_in'
    ? ((myTabAccount?.totalLabel && myTabAccount?.limitLabel)
      ? `Balance ${myTabAccount.totalLabel} of ${myTabAccount.limitLabel} tab limit.`
      : 'Your Supertab account is connected and ready for recipe unlocks.')
    : myTabStatus === 'unavailable'
      ? 'My Tab cannot load until the frontend Supertab config is available.'
      : 'Buy once and your unlocked recipes stay here.';
  const myTabUserLabel = myTabJamieUser?.displayName
    || myTabJamieUser?.email
    || myTabAccount?.displayName
    || myTabAccount?.email
    || (myTabAccount?.isGuest ? 'Guest session' : undefined);
  const myTabCard: MyTabCardData = {
    status: myTabStatus,
    title: 'My Tab',
    siteName: myTabSite?.name ?? undefined,
    siteLogoUrl: myTabSite?.logoUrl ?? undefined,
    headline: myTabHeadline,
    description: myTabDescription,
    userLabel: myTabUserLabel,
    totalLabel: myTabAccount?.totalLabel ?? undefined,
    limitLabel: myTabAccount?.limitLabel ?? undefined,
    purchaseCountLabel: myTabStatus === 'signed_in'
      ? unlockedRecipesLabel
      : myTabAccount
        ? `${myTabAccount.purchaseCount} ${myTabAccount.purchaseCount === 1 ? 'purchase' : 'purchases'}`
      : undefined,
    recentPurchaseLabel: undefined,
    helperText: myTabStatus === 'signed_in'
      ? 'Your owned recipes stay synced into My Recipes.'
      : 'Use the Supertab purchase flow on any locked recipe to get started.',
    primaryActionLabel: myTabStatus === 'signed_in'
      ? 'Open My Recipes'
      : myTabStatus === 'signed_out'
        ? 'Browse Recipes'
        : undefined,
    secondaryActionLabel: myTabStatus === 'signed_in' ? 'Refresh' : undefined,
    message: myTabMessage,
    messageTone: myTabMessageTone,
    isTestMode: myTabAccount?.isTestMode,
  };
  const isMyRecipesView = activeView === 'my-recipes';

  const showDiscoverChatChrome = activeView === 'chat';
  const retainDiscoveryChatMount =
    showDiscoverChatChrome ||
    Boolean(selectedRecipe);

  useEffect(() => {
    setIsHeaderScrolled(false);
  }, [activeView, cookingRecipe]);

  return (
    <div className="jamie-app-shell">
      {/* Full-screen cooking overlay takes priority */}
      <AnimatePresence>
        {cookingRecipe && (
          <CookWithJamie
            recipe={cookingRecipe}
            onClose={() => {
              const recipe = cookingRecipe;
              setCookingRecipe(null);
              if (recipe) {
                navigateCloseCook(recipe);
              }
            }}
            onBackToChat={() => {
              setCookingRecipe(null);
              setActiveView('chat');
              navigateToTab('chat');
            }}
            onExploreRecipes={() => {
              setCookingRecipe(null);
              setActiveView('recipes');
              navigateToTab('recipes');
            }}
          />
        )}
      </AnimatePresence>

      {/* Main app content - hidden when cooking */}
      {!cookingRecipe && (
        <>
          {/* Persistent Tab Navigation */}
          <header
            className="jamie-app-header-shell"
            data-scrolled={isHeaderScrolled || undefined}
          >
            <TabNav
              activeTab={activeView}
              onTabChange={handleTabChange}
              onLogoClick={handleLogoClick}
              onCloseChat={handleCloseChat}
              myTabCard={myTabCard}
              onOpenMyTab={handleOpenMyTab}
              onOpenMyRecipes={handleOpenMyRecipes}
              isMyTabLoading={isMyTabLoading}
              myRecipesCount={myRecipes.length}
            />
          </header>

          {/* Tab Content — ChatView can stay mounted (hidden) so discovery voice survives tab + RecipeModal */}
          <main className="jamie-view-shell relative flex flex-1 min-h-0 flex-col overflow-hidden">
            {permalinkNotFound && !cookingRecipe ? (
              <RecipeNotFound
                slug={permalinkNotFound.slug}
                onBrowseRecipes={() => {
                  setPermalinkNotFound(null);
                  setActiveView('recipes');
                  navigateBrowseRecipes();
                }}
              />
            ) : (
              <>
            {retainDiscoveryChatMount && (
              <div
                className={
                  showDiscoverChatChrome
                    ? 'jamie-view-shell relative z-[1] flex min-h-0 flex-1 flex-col'
                    : 'pointer-events-none absolute inset-0 z-0 overflow-hidden [visibility:hidden]'
                }
                aria-hidden={!showDiscoverChatChrome}
              >
                <ChatView
                  key={chatKey}
                  initialMessage={initialChatMessage}
                  onRecipeClick={handleChatRecipeClick}
                  onPromptClick={handlePromptClick}
                  onClearInitialMessage={() => setInitialChatMessage(undefined)}
                  onScrollStateChange={showDiscoverChatChrome ? setIsHeaderScrolled : undefined}
                  isChatVisible={showDiscoverChatChrome}
                  recipeModalOpen={Boolean(selectedRecipe)}
                  focusedRecipeBackendId={selectedRecipe?.backendId ?? null}
                  onRecipeModalVoiceDockOverlapChange={setRecipeModalVoiceDockOverlap}
                  onVoiceRecipePaywallRequested={handleVoiceRecipePaywallRequested}
                  onDiscoveryVoiceSessionChange={setDiscoveryVoiceSessionActive}
                  recipeAccessMap={recipeAccessMap}
                  recipeAccessLoadingId={recipeAccessLoadingId}
                  onPrefetchChatRecipeAccess={prefetchChatRecipeAccess}
                />
              </div>
            )}

            <AnimatePresence mode="wait">
              {!showDiscoverChatChrome ? (
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="jamie-scroll-area relative z-[1] flex flex-1 min-h-0 flex-col"
                  onScroll={(e) => {
                    setIsHeaderScrolled(e.currentTarget.scrollTop > 10);
                  }}
                >
                  {/* Recipes View */}
                  <div className="jamie-page-shell" data-testid="recipes-view">
                    {/* Hero Section with Glow Effect */}
                    <div className="jamie-shell-width jamie-surface-panel">
                      <div className="jamie-section-hero">
                        <motion.div
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.45 }}
                        >
                          <AvatarWithOrganicGlow
                            src={jamieAvatar}
                            alt="Jamie Oliver"
                            size={132}
                            state="idle"
                            muted
                          />
                        </motion.div>
                        <motion.div
                          initial={{ y: 12, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.12, duration: 0.45 }}
                        >
                          <p className="jamie-page-kicker">
                            {isMyRecipesView ? 'Ready when you are' : 'Jamie Oliver'}
                          </p>
                          <h1 className="jamie-page-title">
                            {isMyRecipesView ? 'My Recipes' : 'Cook With Jamie'}
                          </h1>
                          <p className="jamie-page-subtitle">
                            {isMyRecipesView
                              ? 'Everything you have already unlocked, styled to match the new Jamie experience.'
                              : "Pick a recipe. Let's make something brilliant."}
                          </p>
                        </motion.div>

                        <motion.div
                          initial={{ y: 12, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.45 }}
                          className="jamie-search-wrap"
                        >
                          <SearchInput
                            value={normalizedSearchQuery}
                            onSearch={(value) => {
                              const q = typeof value === 'string' ? value : '';
                              setSearchQuery(q);
                              if (activeView === 'recipes') {
                                navigateRecipesFilters(
                                  { category: selectedCategory, q, viewMode },
                                  { replace: true },
                                );
                              }
                            }}
                            placeholder={isMyRecipesView ? 'Search your recipes...' : 'Search recipes by name or ingredient...'}
                          />
                        </motion.div>

                        {/*
                         * View-mode + filter controls, lifted into the hero
                         * card so they feel like part of the search surface.
                         *
                         * Layout: [ list | grid ]  (active-filter chip)  [ Filters ]
                         *
                         * The active-filter chip only appears when a non-
                         * default category is selected. Clicking its × clears
                         * back to "All" without forcing the user to re-open
                         * the filter drawer.
                         */}
                        <motion.div
                          initial={{ y: 12, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.26, duration: 0.45 }}
                          className="jamie-view-controls"
                        >
                          <div className="jamie-view-toggle" role="tablist" aria-label="Layout">
                            <button
                              type="button"
                              role="tab"
                              aria-selected={viewMode === 'feed'}
                              onClick={() => {
                                setViewMode('feed');
                                navigateRecipesFilters({
                                  category: selectedCategory,
                                  q: searchQuery,
                                  viewMode: 'feed',
                                });
                              }}
                              className="jamie-view-toggle__btn"
                              data-active={viewMode === 'feed' || undefined}
                              aria-label="List view"
                              title="List view"
                            >
                              <LayoutList className="size-4" />
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={viewMode === 'grid'}
                              onClick={() => {
                                setViewMode('grid');
                                navigateRecipesFilters({
                                  category: selectedCategory,
                                  q: searchQuery,
                                  viewMode: 'grid',
                                });
                              }}
                              className="jamie-view-toggle__btn"
                              data-active={viewMode === 'grid' || undefined}
                              aria-label="Grid view"
                              title="Grid view"
                            >
                              <Grid3x3 className="size-4" />
                            </button>
                          </div>

                          <div className="jamie-filter-cluster">
                            <AnimatePresence initial={false}>
                              {selectedCategory !== 'All' && (
                                <motion.button
                                  key="active-filter-chip"
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategory('All');
                                    navigateRecipesFilters({
                                      category: 'All',
                                      q: searchQuery,
                                      viewMode,
                                    });
                                  }}
                                  className="jamie-active-filter-chip"
                                  aria-label={`Clear ${selectedCategory} filter`}
                                  initial={{ opacity: 0, x: 8, scale: 0.96 }}
                                  animate={{ opacity: 1, x: 0, scale: 1 }}
                                  exit={{ opacity: 0, x: 8, scale: 0.96 }}
                                  transition={{ duration: 0.18 }}
                                >
                                  <span className="jamie-active-filter-chip__label">{selectedCategory}</span>
                                  <XIcon className="size-3.5" aria-hidden="true" />
                                </motion.button>
                              )}
                            </AnimatePresence>

                            <button
                              type="button"
                              onClick={() => setFiltersExpanded(!filtersExpanded)}
                              className="jamie-filter-btn"
                              data-active={filtersExpanded || undefined}
                              aria-expanded={filtersExpanded}
                              aria-label={filtersExpanded ? 'Hide filters' : 'Show filters'}
                            >
                              <SlidersHorizontal className="size-4" />
                              <span>Filters</span>
                            </button>
                          </div>
                        </motion.div>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="jamie-shell-width jamie-page-main">
                      {/* Recipes in Progress Section */}
                      {!isMyRecipesView && recipesInProgress.length > 0 && (
                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ duration: 0.5 }}
                          className="mb-5 px-4"
                        >
                          <div
                            style={{
                              backgroundColor: 'var(--jamie-primary-dark)',
                              borderRadius: '20px',
                              padding: '20px',
                              boxShadow: '0 4px 20px rgba(41, 81, 79, 0.25)',
                            }}
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <Clock className="size-5" style={{ color: 'white' }} />
                              <h2
                                style={{
                                  fontFamily: 'var(--font-display)',
                                  fontSize: '16px',
                                  fontWeight: 600,
                                  color: 'white',
                                  margin: 0,
                                }}
                              >
                                Continue Cooking
                              </h2>
                            </div>
                            <p
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '13px',
                                color: 'rgba(255, 255, 255, 0.85)',
                                marginBottom: '16px',
                              }}
                            >
                              You have {recipesInProgress.length} {recipesInProgress.length === 1 ? 'recipe' : 'recipes'} in progress
                            </p>
                            <div className="grid grid-cols-1 gap-3">
                              {recipesInProgress.map((recipe) => {
                                const session = getSessionDetails(recipe.id);
                                let timerDisplay = '';
                                let timerActive = false;
                                if (session?.timerEndTime) {
                                  const now = new Date().getTime();
                                  const remaining = Math.ceil((session.timerEndTime - now) / 1000);
                                  if (remaining > 0) {
                                    timerActive = true;
                                    const mins = Math.floor(remaining / 60);
                                    const secs = remaining % 60;
                                    timerDisplay = `${mins}:${secs.toString().padStart(2, '0')}`;
                                  }
                                } else if (session?.timerSeconds && session.timerSeconds > 0) {
                                  const mins = Math.floor(session.timerSeconds / 60);
                                  const secs = session.timerSeconds % 60;
                                  timerDisplay = `${mins}:${secs.toString().padStart(2, '0')}`;
                                }

                                return (
                                  <motion.div
                                    key={recipe.id}
                                    style={{
                                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                      borderRadius: '16px',
                                      padding: '12px',
                                      border: '1px solid rgba(255, 255, 255, 0.15)',
                                    }}
                                  >
                                    <div className="flex gap-3 items-center">
                                      <div className="relative flex-shrink-0">
                                        <img
                                          src={recipe.image}
                                          alt={recipe.title}
                                          style={{
                                            width: '56px',
                                            height: '56px',
                                            borderRadius: '12px',
                                            objectFit: 'cover',
                                          }}
                                        />
                                        <div
                                          style={{
                                            position: 'absolute',
                                            top: '-4px',
                                            right: '-4px',
                                            width: '22px',
                                            height: '22px',
                                            backgroundColor: '#F97316',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            color: 'white',
                                            fontFamily: 'var(--font-body)',
                                          }}
                                        >
                                          {session?.currentStep + 1 || 1}
                                        </div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h3
                                          style={{
                                            fontFamily: 'var(--font-display)',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: 'white',
                                            marginBottom: '4px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {recipe.title}
                                        </h3>
                                        <p
                                          style={{
                                            fontFamily: 'var(--font-body)',
                                            fontSize: '12px',
                                            color: 'rgba(255, 255, 255, 0.7)',
                                            marginBottom: '8px',
                                          }}
                                        >
                                          Step {session?.currentStep + 1 || 1} of {recipe.instructions.length}
                                        </p>
                                        <div
                                          style={{
                                            width: '100%',
                                            height: '4px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                            borderRadius: '2px',
                                            overflow: 'hidden',
                                          }}
                                        >
                                          <div
                                            style={{
                                              height: '100%',
                                              width: `${((session?.currentStep + 1 || 1) / recipe.instructions.length) * 100}%`,
                                              backgroundColor: 'white',
                                              borderRadius: '2px',
                                              transition: 'width 0.3s ease',
                                            }}
                                          />
                                        </div>
                                        {timerDisplay && (
                                          <div
                                            className="flex items-center gap-1.5 mt-2"
                                            style={{
                                              fontSize: '12px',
                                              color: timerActive ? '#FDBA74' : 'rgba(255, 255, 255, 0.7)',
                                            }}
                                          >
                                            <Clock
                                              className={`size-3 ${timerActive ? 'animate-pulse' : ''}`}
                                            />
                                            <span className="tabular-nums">{timerDisplay}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    {/* Action buttons */}
                                    <div className="flex gap-2 mt-3">
                                      <button
                                        onClick={() => handleResumeCooking(recipe)}
                                        style={{
                                          flex: 1,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '6px',
                                          padding: '8px 12px',
                                          backgroundColor: 'white',
                                          color: 'var(--jamie-primary-dark)',
                                          borderRadius: '20px',
                                          border: 'none',
                                          cursor: 'pointer',
                                          fontFamily: 'var(--font-display)',
                                          fontSize: '13px',
                                          fontWeight: 600,
                                          transition: 'opacity 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                      >
                                        <Play className="size-4" />
                                        Resume
                                      </button>
                                      <button
                                        onClick={(e) => handleDiscardSession(recipe, e)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '8px 12px',
                                          backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                          color: 'rgba(255, 255, 255, 0.8)',
                                          borderRadius: '20px',
                                          border: '1px solid rgba(255, 255, 255, 0.2)',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                                          e.currentTarget.style.color = '#fca5a5';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                                        }}
                                        title="Discard session"
                                      >
                                        <Trash2 className="size-4" />
                                      </button>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/*
                       * Expanded filter panel.
                       *
                       * Rendered as its own surface card that visually
                       * connects to the hero card above (same background,
                       * same border-radius, soft shadow). Includes a header
                       * with a "Cuisine" label and a Clear action that only
                       * shows when a non-default filter is active.
                       */}
                      <AnimatePresence initial={false}>
                        {filtersExpanded && (
                          <motion.div
                            key="filter-panel"
                            initial={{ opacity: 0, y: -8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -8, height: 0 }}
                            transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
                            className="jamie-filter-panel-wrap"
                          >
                            <div className="jamie-shell-width jamie-surface-panel jamie-filter-panel">
                              <div className="jamie-filter-panel__head">
                                <span className="jamie-filter-panel__label">Cuisine</span>
                                {selectedCategory !== 'All' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCategory('All');
                                      setFiltersExpanded(false);
                                      navigateRecipesFilters({
                                        category: 'All',
                                        q: searchQuery,
                                        viewMode,
                                      });
                                    }}
                                    className="jamie-filter-panel__clear"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              <div className="jamie-filter-panel__chips">
                                {displayCategories.map((category) => (
                                  <button
                                    key={category}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCategory(category);
                                      setFiltersExpanded(false);
                                      navigateRecipesFilters({
                                        category,
                                        q: searchQuery,
                                        viewMode,
                                      });
                                    }}
                                    className="jamie-chip"
                                    data-active={selectedCategory === category || undefined}
                                  >
                                    {category}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Catalog loading */}
                      {!isMyRecipesView && isRecipesCatalogLoading && loadedRecipes.length === 0 ? (
                        <div className="px-4 mb-6">
                          <RecipeSkeletonLoader />
                        </div>
                      ) : null}

                      {/* Recipe Grid View */}
                      {viewMode === 'grid' && visibleRecipes.length > 0 && (
                        <motion.div
                          key={`grid-${recipesInProgress.length}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.5 }}
                          className="px-4 mb-6"
                        >
                          <div
                            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
                            style={{ maxWidth: '800px', margin: '0 auto' }}
                          >
                            {visibleRecipes.map((recipe, index) => (
                              <motion.div
                                key={recipe.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 * (index % 8), duration: 0.3 }}
                              >
                                <RecipeCard
                                  recipe={recipe}
                                  onClick={() => handleRecipeClick(recipe)}
                                  variant="grid"
                                />
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Recipe Feed View */}
                      {viewMode === 'feed' && visibleRecipes.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.5 }}
                          className="px-5 mb-6"
                        >
                          <div className="max-w-3xl mx-auto flex flex-col" style={{ gap: '24px' }}>
                            {visibleRecipes.map((recipe, index) => (
                              <motion.div
                                key={recipe.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 * (index % 8), duration: 0.3 }}
                              >
                                <RecipeCard
                                  recipe={recipe}
                                  onClick={() => handleRecipeClick(recipe)}
                                  variant="feed"
                                />
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* No Results */}
                      {!isRecipesCatalogLoading && visibleRecipes.length === 0 ? (
                        <div className="text-center py-12">
                          <ChefHat className="size-16 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="mb-2 font-medium">
                            {isMyRecipesView
                              ? 'No owned recipes yet'
                              : recipesCatalogFailed
                                ? 'Could not load recipes'
                                : 'No recipes found'}
                          </h3>
                          <p className="text-muted-foreground">
                            {isMyRecipesView
                              ? (isMyRecipesLoading
                                ? 'Loading your unlocked recipes...'
                                : 'Unlock a recipe with Supertab and it will appear here.')
                              : recipesCatalogFailed
                                ? 'Check your API connection and try again.'
                                : 'Try adjusting your search or filters'}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
              </>
            )}
          </main>
        </>
      )}

      {/* Recipe Modal */}
      {selectedRecipe && (
        <RecipeModal
          ref={recipeModalRef}
          recipe={selectedRecipe}
          onClose={() => {
            setSelectedRecipe(null);
            navigateCloseRecipe(activeView);
          }}
          onCookWithJamie={handleCookWithJamie}
          recipeAccess={selectedRecipeAccess}
          isAccessLoading={isSelectedRecipeAccessLoading}
          accessLoadFailed={isSelectedRecipeAccessFailed}
          onRetryAccessLoad={() => {
            if (selectedRecipe) {
              void loadRecipeAccess(selectedRecipe, { force: true });
            }
          }}
          onPurchaseResolved={(resolution) => handleRecipePurchaseResolved(selectedRecipe, resolution)}
          reserveBottomForVoiceDock={recipeModalVoiceDockOverlap}
        />
      )}

      {/* Toaster */}
      <Toaster />

      {/* Session Warning Dialog */}
      {showSessionWarning && (
        <AlertDialog open={showSessionWarning} onOpenChange={setShowSessionWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Switch to {pendingRecipe?.title}?</AlertDialogTitle>
              <AlertDialogDescription>
                Your current progress will be saved automatically.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel onClick={handleReturnToActiveSession}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleContinueWithNewRecipe}>Switch</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Loading Skeleton */}
      <AnimatePresence>
        {isLoading || permalinkResolving ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <RecipeSkeletonLoader />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
