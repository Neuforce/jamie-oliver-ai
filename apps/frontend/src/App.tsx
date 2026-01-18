import React, { useState, useMemo, useEffect } from 'react';
import { recipes, categories, Recipe, initializeRecipes, getCategories } from './data/recipes';
import { RecipeCard } from './components/RecipeCard';
import { RecipeModal } from './components/RecipeModal';
import { CookWithJamie } from './components/CookWithJamie';
import { ChatView, clearChatHistory } from './components/ChatView';
import { TabNav, TabView } from './components/TabNav';
import { Button } from './components/ui/button';
import { Search, ChefHat, Grid3x3, LayoutList, Clock, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster } from './components/ui/sonner';
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
import { GlowEffect } from './design-system/components/GlowEffect';
import { AvatarWithGlow } from './design-system/components/AvatarWithGlow';
import { SearchInput } from './design-system/components/SearchInput';
import { RecipeSkeletonLoader } from './components/ui/skeleton-loader';
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
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  
  // Data state
  const [loadedRecipes, setLoadedRecipes] = useState<Recipe[]>(recipes);
  const [availableCategories, setAvailableCategories] = useState<string[]>(categories);
  
  // Chat state
  const [initialChatMessage, setInitialChatMessage] = useState<string | undefined>(undefined);
  const [chatKey, setChatKey] = useState(0); // Key to force ChatView remount when clearing

  // Load recipes asynchronously in production (when recipes array is empty)
  useEffect(() => {
    if (recipes.length === 0) {
      initializeRecipes().then((loaded) => {
        setLoadedRecipes(loaded);
        setAvailableCategories(getCategories(loaded));
      }).catch((error) => {
        console.error('Failed to load recipes:', error);
      });
    } else {
      setAvailableCategories(getCategories(recipes));
    }
  }, []);

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

  // Filter recipes based on search and category
  const filteredRecipes = useMemo(() => {
    return loadedRecipes.filter(recipe => {
      const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           recipe.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           recipe.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || recipe.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory, loadedRecipes]);

  // Recipe interaction handlers
  const handleCookWithJamie = () => {
    if (!selectedRecipe) return;

    const otherActiveSessions = recipesInProgress.filter(r => r.id !== selectedRecipe.id);
    if (otherActiveSessions.length > 0) {
      setPendingRecipe(selectedRecipe);
      setShowSessionWarning(true);
      return;
    }

    setIsLoading(true);
    setSelectedRecipe(null);
    setTimeout(() => {
      setCookingRecipe(selectedRecipe);
      setIsLoading(false);
    }, 500);
  };

  const handleRecipeClick = (recipe: Recipe) => {
    if (cookingRecipe && cookingRecipe.id !== recipe.id) {
      setPendingRecipe(recipe);
      setShowSessionWarning(true);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setSelectedRecipe(recipe);
      setIsLoading(false);
    }, 300);
  };

  const handleContinueWithNewRecipe = () => {
    setShowSessionWarning(false);
    if (pendingRecipe) {
      setIsLoading(true);
      setCookingRecipe(null);
      setSelectedRecipe(null);
      setTimeout(() => {
        setCookingRecipe(pendingRecipe);
        setPendingRecipe(null);
        setIsLoading(false);
      }, 500);
    }
  };

  const handleReturnToActiveSession = () => {
    setShowSessionWarning(false);
    setPendingRecipe(null);
  };

  // Handle prompt clicks from Chat view
  const handlePromptClick = (prompt: string) => {
    setInitialChatMessage(prompt);
  };

  // Handle recipe selection from Chat view
  const handleChatRecipeClick = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
  };

  // Handle logo click - return to home (Chat with fresh state)
  const handleLogoClick = () => {
    clearChatHistory();
    setChatKey(prev => prev + 1); // Force ChatView to remount with fresh state
    setActiveView('chat');
    setInitialChatMessage(undefined);
  };

  return (
    <div 
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'white',
      }}
    >
      {/* Full-screen cooking overlay takes priority */}
      <AnimatePresence>
        {cookingRecipe && (
          <CookWithJamie
            recipe={cookingRecipe}
            onClose={() => setCookingRecipe(null)}
            onBackToChat={() => {
              setCookingRecipe(null);
              setActiveView('chat');
            }}
            onExploreRecipes={() => {
              setCookingRecipe(null);
              setActiveView('recipes');
            }}
          />
        )}
      </AnimatePresence>

      {/* Main app content - hidden when cooking */}
      {!cookingRecipe && (
        <>
          {/* Persistent Tab Navigation */}
          <header style={{ flexShrink: 0, zIndex: 40, backgroundColor: 'white' }}>
            <TabNav 
              activeTab={activeView} 
              onTabChange={setActiveView}
              onLogoClick={handleLogoClick}
            />
          </header>

          {/* Tab Content - Full remaining height */}
          <main 
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <AnimatePresence mode="wait">
              {activeView === 'chat' ? (
                <motion.div
                  key={`chat-${chatKey}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                  }}
                >
                  <ChatView
                    key={chatKey}
                    initialMessage={initialChatMessage}
                    onRecipeClick={handleChatRecipeClick}
                    onPromptClick={handlePromptClick}
                    onClearInitialMessage={() => setInitialChatMessage(undefined)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="recipes"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="h-full overflow-y-auto"
                >
                  {/* Recipes View */}
                  <div className="relative overflow-hidden bg-white">
                    {/* Hero Section with Glow Effect */}
                    <div className="relative overflow-hidden bg-white">
                      <GlowEffect />
                      <div className="container mx-auto px-5 py-3 relative z-10">
                        {/* Jamie's Avatar */}
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.5 }}
                          className="flex flex-col items-center mb-6"
                        >
                          <AvatarWithGlow
                            src={jamieAvatar}
                            alt="Jamie Oliver"
                            size={140}
                          />
                          <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="text-center mt-4"
                          >
                            <h1
                              className="text-center"
                              style={{
                                fontFamily: 'var(--font-display)',
                                fontWeight: 800,
                                fontSize: '28px',
                                lineHeight: 1,
                                textTransform: 'uppercase',
                                color: 'var(--jamie-text-heading)',
                              }}
                            >
                              COOK WITH JAMIE
                            </h1>
                            <p
                              className="text-center mt-2"
                              style={{
                                fontFamily: 'var(--font-display)',
                                fontWeight: 400,
                                fontSize: '15px',
                                lineHeight: 1.5,
                                color: 'var(--jamie-text-primary)',
                              }}
                            >
                              Cook amazing recipes, step by step
                            </p>
                          </motion.div>
                        </motion.div>

                        {/* Search Bar */}
                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.4, duration: 0.5 }}
                          className="max-w-md mx-auto"
                        >
                          <SearchInput
                            value={searchQuery}
                            onSearch={(value) => setSearchQuery(value)}
                            placeholder="Search recipes by name, ingredie..."
                          />
                        </motion.div>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="container mx-auto pt-3 pb-12">
                      {/* Recipes in Progress Section */}
                      {recipesInProgress.length > 0 && (
                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ duration: 0.5 }}
                          className="mb-8 px-4"
                        >
                          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white shadow-xl">
                            <div className="flex items-center gap-3 mb-4">
                              <Clock className="size-5" />
                              <h2 className="text-white font-semibold">Continue Cooking</h2>
                            </div>
                            <p className="text-white/90 mb-4 text-sm">
                              You have {recipesInProgress.length} {recipesInProgress.length === 1 ? 'recipe' : 'recipes'} in progress
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setSelectedRecipe(recipe)}
                                    className="bg-white/10 backdrop-blur-sm rounded-xl p-3 cursor-pointer hover:bg-white/15 transition-colors border border-white/20"
                                  >
                                    <div className="flex gap-3">
                                      <div className="relative flex-shrink-0">
                                        <img
                                          src={recipe.image}
                                          alt={recipe.title}
                                          className="size-14 rounded-lg object-cover"
                                        />
                                        <div className="absolute -top-1 -right-1 size-5 bg-orange-500 rounded-full flex items-center justify-center text-xs font-medium">
                                          {session?.currentStep + 1 || 1}
                                        </div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h3 className="text-white text-sm font-medium mb-1 truncate">{recipe.title}</h3>
                                        <p className="text-white/70 text-xs mb-2">
                                          Step {session?.currentStep + 1 || 1} of {recipe.instructions.length}
                                        </p>
                                        <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                                          <div
                                            className="bg-white h-full rounded-full transition-all"
                                            style={{
                                              width: `${((session?.currentStep + 1 || 1) / recipe.instructions.length) * 100}%`
                                            }}
                                          />
                                        </div>
                                        {timerDisplay && (
                                          <div className={`flex items-center gap-1.5 text-xs mt-2 ${timerActive ? 'text-orange-200' : 'text-white/70'}`}>
                                            <Clock className={`size-3 ${timerActive ? 'animate-pulse' : ''}`} />
                                            <span className="tabular-nums">{timerDisplay}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Filters & View Mode Bar */}
                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                        className="mb-6 px-4"
                      >
                        <div className="flex items-center gap-2 mb-4 mx-auto" style={{ maxWidth: '600px' }}>
                          {/* View Mode Toggle */}
                          <div className="flex items-center gap-1 bg-muted/50 rounded-full p-1 flex-1">
                            <button
                              onClick={() => setViewMode('feed')}
                              className="rounded-full h-9 flex-1 flex items-center justify-center transition-colors"
                              style={{
                                backgroundColor: viewMode === 'feed' ? '#3D6E6C' : 'transparent',
                                color: viewMode === 'feed' ? '#ffffff' : 'inherit',
                              }}
                            >
                              <LayoutList className="size-4" />
                            </button>
                            <button
                              onClick={() => setViewMode('grid')}
                              className="rounded-full h-9 flex-1 flex items-center justify-center transition-colors"
                              style={{
                                backgroundColor: viewMode === 'grid' ? '#3D6E6C' : 'transparent',
                                color: viewMode === 'grid' ? '#ffffff' : 'inherit',
                              }}
                            >
                              <Grid3x3 className="size-4" />
                            </button>
                          </div>

                          {/* Filter Toggle Button */}
                          <Button
                            onClick={() => setFiltersExpanded(!filtersExpanded)}
                            variant="ghost"
                            size="sm"
                            className="rounded-full h-9 gap-1 px-4"
                          >
                            <SlidersHorizontal className="size-4" />
                            {selectedCategory !== 'All' && (
                              <span className="size-2 rounded-full bg-[#46BEA8]" />
                            )}
                          </Button>
                        </div>

                        {/* Category Filters */}
                        <AnimatePresence mode="wait">
                          {filtersExpanded && (
                            <motion.div
                              key="category-filters"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="flex flex-wrap gap-2 mx-auto overflow-hidden"
                              style={{ maxWidth: '600px' }}
                            >
                              {availableCategories.map((category) => (
                                <button
                                  key={category}
                                  onClick={() => setSelectedCategory(category)}
                                  className="rounded-full px-4 py-2 text-sm font-medium transition-all duration-200"
                                  style={{
                                    fontFamily: 'var(--font-body)',
                                    backgroundColor: selectedCategory === category ? 'var(--jamie-primary-dark)' : 'white',
                                    color: selectedCategory === category ? 'white' : 'var(--jamie-text-body)',
                                    border: selectedCategory === category ? 'none' : '1px solid #e5e7eb',
                                    boxShadow: selectedCategory === category ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                  }}
                                >
                                  {category}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>

                      {/* Recipe Grid View */}
                      {viewMode === 'grid' && (
                        <motion.div
                          key={`grid-${recipesInProgress.length}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.5 }}
                          className="px-5 mb-12 flex justify-center"
                        >
                          <div className="grid grid-cols-3 lg:grid-cols-4 gap-4" style={{ width: 'fit-content' }}>
                            {filteredRecipes.map((recipe, index) => (
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
                      {viewMode === 'feed' && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.5 }}
                          className="px-5 mb-12"
                        >
                          <div className="max-w-3xl mx-auto flex flex-col" style={{ gap: '32px' }}>
                            {filteredRecipes.map((recipe, index) => (
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
                      {filteredRecipes.length === 0 && (
                        <div className="text-center py-12">
                          <ChefHat className="size-16 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="mb-2 font-medium">No recipes found</h3>
                          <p className="text-muted-foreground">
                            Try adjusting your search or filters
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </>
      )}

      {/* Recipe Modal */}
      {selectedRecipe && (
        <RecipeModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onCookWithJamie={handleCookWithJamie}
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
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <RecipeSkeletonLoader />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
