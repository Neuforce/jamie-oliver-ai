import { Recipe } from '../data/recipes';
import { Clock, Users, ChefHat } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
  variant?: 'grid' | 'feed';
}

export function RecipeCard({ recipe, onClick, variant = 'grid' }: RecipeCardProps) {
  const [hasSession, setHasSession] = useState(false);
  const [sessionProgress, setSessionProgress] = useState(0);

  useEffect(() => {
    const checkSession = () => {
      // Check if recipe is completed - if so, don't show as in progress
      const completedRecipe = localStorage.getItem(`completed-recipe-${recipe.id}`);
      if (completedRecipe) {
        setHasSession(false);
        return;
      }
      
      const session = localStorage.getItem(`cooking-session-${recipe.id}`);
      if (session) {
        try {
          const parsed = JSON.parse(session);
          const now = new Date().getTime();
          const sessionAge = now - parsed.timestamp;
          
          if (sessionAge < 24 * 60 * 60 * 1000) {
            setHasSession(true);
            setSessionProgress(((parsed.currentStep + 1) / recipe.instructions.length) * 100);
          } else {
            setHasSession(false);
            localStorage.removeItem(`cooking-session-${recipe.id}`);
          }
        } catch (e) {
          setHasSession(false);
        }
      } else {
        setHasSession(false);
      }
    };

    checkSession();
  }, [recipe.id, recipe.instructions.length]); // Only run on mount

  // Grid variant: compact with cropped image
  if (variant === 'grid') {
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="cursor-pointer"
        onClick={onClick}
      >
        <div className="relative overflow-hidden bg-white h-full rounded-[24px] shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_2px_-1px_rgba(0,0,0,0.10)]">
          {/* Edge-to-edge Image Container for Grid - Matching Figma Mock */}
          <div className="relative aspect-[196/245] overflow-hidden">
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover transition-opacity duration-300 hover:opacity-95"
            />
            
            {/* Gradient Overlay - matching Figma design */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 via-50% to-transparent" />
            
            {/* Badges at top */}
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2 z-10">
              {/* Category/Session Badge on left */}
              {hasSession ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-[#81EB67] text-white whitespace-nowrap">
                  <Clock className="size-3" />
                  In Progress
                </span>
              ) : (
                <span className="px-2 py-1 rounded-full text-xs bg-[rgba(3,2,19,0.9)] text-white whitespace-nowrap">
                  {recipe.category}
                </span>
              )}
            </div>

            {/* Content at bottom - matching Figma */}
            <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col gap-1.5 z-10">
              {/* Title */}
              <h3 className="text-sm leading-5 text-white line-clamp-2 tracking-[-0.15px]">
                {recipe.title}
              </h3>
              
              {/* Meta Info */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Clock className="size-3 text-white/90" strokeWidth={1.5} />
                  <span className="text-xs leading-4 text-white/90">{recipe.time}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="size-3 text-white/90" strokeWidth={1.5} />
                  <span className="text-xs leading-4 text-white/90">{recipe.servings}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ChefHat className="size-3 text-white/90" strokeWidth={1.5} />
                  <span className="text-xs leading-4 text-white/90">{recipe.difficulty}</span>
                </div>
              </div>
              
              {/* Progress Bar */}
              {hasSession && (
                <div className="mt-1 w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#81EB67] h-full rounded-full transition-all"
                    style={{ width: `${sessionProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Feed variant: full card with description
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer"
      onClick={onClick}
    >
      <div className="relative overflow-hidden bg-white rounded-[24px] shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_2px_-1px_rgba(0,0,0,0.10)]">
        {/* Title at the top */}
        <div className="p-4 pb-3">
          <h3 className="line-clamp-1">{recipe.title}</h3>
        </div>

        {/* Image Container */}
        <div className="relative aspect-square overflow-hidden">
          <img
            src={recipe.image}
            alt={recipe.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
          {/* Category Badge */}
          <div className="absolute top-3 left-3">
            <span className="px-3 py-1 rounded-full text-sm bg-primary/80 text-primary-foreground backdrop-blur-md">
              {recipe.category}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 pt-3">
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {recipe.description}
          </p>

          {/* Meta Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="size-4" />
              <span>{recipe.time}</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="size-4" />
              <span>{recipe.servings}</span>
            </div>
            <div className="flex items-center gap-1">
              <ChefHat className="size-4" />
              <span>{recipe.difficulty}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}