import React, { useState, useMemo, useEffect } from 'react';
import { recipes, categories, Recipe, initializeRecipes, getCategories } from './data/recipes';
import { RecipeCard } from './components/RecipeCard';
import { RecipeFeedCard } from './components/RecipeFeedCard';
import { RecipeModal } from './components/RecipeModal';
import { CookWithJamie } from './components/CookWithJamie';
import { ChatWithJamie } from './components/ChatWithJamie';
import { Button } from './components/ui/button';
import { Search, ChefHat, Sparkles, Filter, Grid3x3, LayoutList, ChevronDown, ChevronUp, MessageCircle, Clock, AlertCircle, Menu, SlidersHorizontal } from 'lucide-react';
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
import { RecipeSkeletonLoader, ChatSkeletonLoader } from './components/ui/skeleton-loader';
import Nav from './imports/Nav';
// @ts-ignore - Vite handles image imports
import jamieAvatarImport from 'figma:asset/9998d3c8aa18fde4e634353cc1af4c783bd57297.png';
// Vite returns the image URL as a string
const jamieAvatar = typeof jamieAvatarImport === 'string' ? jamieAvatarImport : (jamieAvatarImport as any).src || jamieAvatarImport;

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('feed');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [recipesInProgress, setRecipesInProgress] = useState<Recipe[]>([]);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [pendingRecipe, setPendingRecipe] = useState<Recipe | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'recipe' | 'chat' | null>(null);
  const [loadedRecipes, setLoadedRecipes] = useState<Recipe[]>(recipes);
  const [availableCategories, setAvailableCategories] = useState<string[]>(categories);

  // Load recipes asynchronously in production (when recipes array is empty)
  useEffect(() => {
    if (recipes.length === 0) {
      initializeRecipes().then((loaded) => {
        setLoadedRecipes(loaded);
        setAvailableCategories(getCategories(loaded));
      }).catch((error) => {
        console.error('Failed to load recipes:', error);
      });
    }
  }, []);

  // Check for recipes with saved sessions
  useEffect(() => {
    const checkSavedSessions = () => {
      console.log('Checking for saved sessions...');
      const inProgress: Recipe[] = [];
      loadedRecipes.forEach(recipe => {
        // Skip if recipe is completed
        const completedRecipe = localStorage.getItem(`completed-recipe-${recipe.id}`);
        if (completedRecipe) {
          return; // Recipe is completed, don't show as in progress
        }
        
        const savedSession = localStorage.getItem(`cooking-session-${recipe.id}`);
        if (savedSession) {
          try {
            const session = JSON.parse(savedSession);
            console.log(`Found session for recipe ${recipe.id}:`, session);
            const now = new Date().getTime();
            const sessionAge = now - session.timestamp;
            
            // Only show sessions less than 24 hours old
            if (sessionAge < 24 * 60 * 60 * 1000) {
              inProgress.push(recipe);
            } else {
              // Clean up old sessions
              console.log(`Session for recipe ${recipe.id} is too old, removing...`);
              localStorage.removeItem(`cooking-session-${recipe.id}`);
            }
          } catch (e) {
            console.error('Error parsing session:', e);
          }
        }
      });
      console.log('Recipes in progress:', inProgress.length, inProgress.map(r => r.title));
      setRecipesInProgress(inProgress);
    };

    checkSavedSessions();
    
    // Also check when returning from cook mode
    if (!cookingRecipe) {
      // Small delay to ensure localStorage is written
      setTimeout(checkSavedSessions, 100);
    }
  }, [cookingRecipe, loadedRecipes]); // Re-check when exiting cook mode or recipes change

  // Helper function to check if a recipe has a saved session
  const hasSession = (recipeId: number) => {
    return recipesInProgress.some(r => r.id === recipeId);
  };

  // Helper function to get session details
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

  const handleCookWithJamie = () => {
    if (!selectedRecipe) return;
    
    // Check if user is trying to start a DIFFERENT recipe while another is in progress
    const otherActiveSessions = recipesInProgress.filter(r => r.id !== selectedRecipe.id);
    
    if (otherActiveSessions.length > 0) {
      // User has other recipes in progress
      setPendingRecipe(selectedRecipe);
      setShowSessionWarning(true);
      return;
    }
    
    // Show loader before transition
    setIsLoading(true);
    setLoadingType('recipe');
    setSelectedRecipe(null);
    
    // Simulate loading time
    setTimeout(() => {
      setCookingRecipe(selectedRecipe);
      setIsLoading(false);
      setLoadingType(null);
    }, 800);
  };
  
  const handleRecipeClick = (recipe: Recipe) => {
    // If currently cooking a different recipe, show warning
    if (cookingRecipe && cookingRecipe.id !== recipe.id) {
      setPendingRecipe(recipe);
      setShowSessionWarning(true);
      return;
    }
    
    // Show loader before opening recipe
    setIsLoading(true);
    setLoadingType('recipe');
    
    setTimeout(() => {
      setSelectedRecipe(recipe);
      setIsLoading(false);
      setLoadingType(null);
    }, 500);
  };
  
  const handleContinueWithNewRecipe = () => {
    // User confirmed they want to start a new recipe
    setShowSessionWarning(false);
    if (pendingRecipe) {
      // Show loader for transition
      setIsLoading(true);
      setLoadingType('recipe');
      
      // Close current recipe (its state is already saved automatically)
      setCookingRecipe(null);
      setSelectedRecipe(null);
      
      // Start the new recipe directly
      setTimeout(() => {
        setCookingRecipe(pendingRecipe);
        setPendingRecipe(null);
        setIsLoading(false);
        setLoadingType(null);
      }, 500);
    }
  };
  
  const handleReturnToActiveSession = () => {
    // User wants to continue cooking current recipe
    setShowSessionWarning(false);
    setPendingRecipe(null);
    // Keep cooking the current recipe (no change needed)
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section - Clean minimalist design matching Figma mock */}
      <div className="relative overflow-hidden bg-white">
        {/* Glow Effect Background */}
        <GlowEffect />
        
        <div className="container mx-auto px-5 py-3 relative z-10 pt-[12px] pr-[20px] pb-[0px] pl-[20px]">
          {/* Navigation */}
          <div className="h-[56px] mb-3">
            <Nav />
          </div>

          {/* Jamie's Avatar with Glow */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center mb-6"
          >
            <AvatarWithGlow
              src={jamieAvatar}
              alt="Jamie Oliver"
              size={170}
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
                  fontFamily: 'Poppins, sans-serif',
                  fontStyle: 'normal',
                  fontWeight: 800,
                  fontSize: '32px',
                  lineHeight: '0.99',
                  letterSpacing: '0px',
                  textTransform: 'uppercase',
                  color: '#327179',
                }}
              >
                COOK WITH JAMIE
              </h1>
              <p
                className="text-center"
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '16px',
                  lineHeight: '1.5',
                  letterSpacing: '0px',
                  color: '#234252',
                }}
              >
                Cook amazing recipes, step by step
              </p>
            </motion.div>
          </motion.div>

          {/* Search Bar - Using design system component */}
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
      <div className="container mx-auto pt-3 pb-12 bg-[rgba(0,0,0,0)]">
        {/* Recipes in Progress Section */}
        {recipesInProgress.length > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-12 px-4"
          >
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-8 text-white shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                <Clock className="size-6" />
                <h2 className="text-white">Continue Cooking</h2>
              </div>
              <p className="text-white/90 mb-6">
                You have {recipesInProgress.length} {recipesInProgress.length === 1 ? 'recipe' : 'recipes'} in progress
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipesInProgress.map((recipe) => {
                  const session = getSessionDetails(recipe.id);
                  
                  // Calculate timer display
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
                      onClick={() => {
                        setSelectedRecipe(recipe);
                      }}
                      className="bg-white/10 backdrop-blur-sm rounded-xl p-4 cursor-pointer hover:bg-white/15 transition-colors duration-200 border border-white/20"
                    >
                      <div className="flex gap-3">
                        <div className="relative flex-shrink-0">
                          <img
                            src={recipe.image}
                            alt={recipe.title}
                            className="size-16 rounded-lg object-cover"
                          />
                          <div className="absolute -top-1 -right-1 size-5 bg-orange-500 rounded-full flex items-center justify-center text-xs">
                            {session?.currentStep + 1 || 1}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white text-sm mb-1 truncate">{recipe.title}</h3>
                          <p className="text-white/70 text-xs mb-2">
                            Step {session?.currentStep + 1 || 1} of {recipe.instructions.length}
                          </p>
                          <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden mb-2">
                            <div
                              className="bg-white h-full rounded-full transition-all"
                              style={{
                                width: `${((session?.currentStep + 1 || 1) / recipe.instructions.length) * 100}%`
                              }}
                            />
                          </div>
                          {timerDisplay && (
                            <div className={`flex items-center gap-1.5 text-xs ${timerActive ? 'text-orange-200' : 'text-white/70'}`}>
                              <Clock className={`size-3 ${timerActive ? 'animate-pulse' : ''}`} />
                              <span className="tabular-nums">{timerDisplay}</span>
                              {timerActive && <span className="text-orange-200">• Activo</span>}
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
          {/* Top Bar: Results Count, View Toggle, Filter Toggle */}
          <div className="flex items-center gap-2 mb-4">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-full p-1 flex-1">
              <Button
                onClick={() => setViewMode('feed')}
                variant={viewMode === 'feed' ? "default" : "ghost"}
                size="sm"
                className="rounded-full h-8 flex-1"
              >
                <LayoutList className="size-4" />
              </Button>
              <Button
                onClick={() => setViewMode('grid')}
                variant={viewMode === 'grid' ? "default" : "ghost"}
                size="sm"
                className="rounded-full h-8 flex-1"
              >
                <Grid3x3 className="size-4" />
              </Button>
            </div>

            {/* Filter Toggle Button */}
            <Button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              variant={selectedCategory !== 'All' ? "default" : "ghost"}
              size="sm"
              className="rounded-full h-8 gap-1 px-4"
            >
              <SlidersHorizontal className="size-4" />
              {selectedCategory !== 'All' && (
                <span className="size-2 rounded-full bg-white" />
              )}
            </Button>
          </div>

          {/* Collapsible Filters */}
          <AnimatePresence initial={false}>
            {filtersExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <motion.div
                  initial={{ y: -10 }}
                  animate={{ y: 0 }}
                  exit={{ y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="pb-2"
                >
                  <div className="flex flex-wrap gap-2">
                    {availableCategories.map((category) => (
                      <Button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        variant={selectedCategory === category ? "default" : "outline"}
                        size="sm"
                        className="rounded-full"
                      >
                        {category}
                      </Button>
                    ))}
                  </div>
                </motion.div>
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
              className="px-5 mb-12"
            >
              <div className="grid grid-cols-2 gap-4">
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
              <div
                className="max-w-3xl mx-auto flex flex-col"
                style={{ gap: '38px' }}
              >
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
            <h3 className="mb-2">No recipes found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>

      {/* Recipe Modal */}
      {selectedRecipe && (
        <RecipeModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onCookWithJamie={handleCookWithJamie}
        />
      )}

      {/* Cook with Jamie */}
      {cookingRecipe && (
        <CookWithJamie
          recipe={cookingRecipe}
          onClose={() => setCookingRecipe(null)}
        />
      )}

      {/* Chat with Jamie */}
      {chatOpen && (
        <ChatWithJamie
          onClose={() => setChatOpen(false)}
          onRecipeClick={(recipe) => setSelectedRecipe(recipe)}
        />
      )}

      {/* Floating Chat Button */}
      <AnimatePresence>
        {!chatOpen && !selectedRecipe && !cookingRecipe && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-40"
          >
            <Button
              onClick={() => setChatOpen(true)}
              size="lg"
              className="size-16 rounded-full shadow-2xl bg-[#46BEA8] hover:bg-[#327179] text-white border-4 border-white/30"
            >
              <MessageCircle className="size-7" />
            </Button>
            {/* Pulse Animation */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 rounded-full bg-[#46BEA8]"
              style={{ zIndex: -1 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 mt-20">
        <div className="container mx-auto px-4 py-12 text-center hidden">
          <div className="flex items-center justify-center gap-3 mb-3">
            <ChefHat className="size-5 text-[#46BEA8]" />
            <p className="text-muted-foreground">
              Made with love by Jamie Oliver AI Assistant
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Your personal cooking companion • 50 amazing recipes and counting
          </p>
        </div>
      </footer>

      {/* Toaster */}
      <Toaster />

      {/* Session Warning Dialog */}
      {showSessionWarning && (
        <AlertDialog
          open={showSessionWarning}
          onOpenChange={setShowSessionWarning}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Switch to {pendingRecipe?.title}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your current progress will be saved automatically.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel onClick={handleReturnToActiveSession}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleContinueWithNewRecipe}>
                Switch
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Loading Skeleton */}
      <AnimatePresence>
        {isLoading && loadingType === 'recipe' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <RecipeSkeletonLoader />
          </motion.div>
        )}
        {isLoading && loadingType === 'chat' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChatSkeletonLoader />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}