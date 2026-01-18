import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, Users, ChefHat, PlayCircle, ExternalLink } from 'lucide-react';
import type { RecipeDetailData } from '../lib/api';

interface RecipeQuickViewProps {
  recipe: RecipeDetailData;
  isOpen: boolean;
  onClose: () => void;
  onViewFull: (recipeId: string) => void;
  onCook: (recipeId: string) => void;
}

// Helper to format duration
const formatDuration = (isoTime?: string): string => {
  if (!isoTime) return '';
  const match = isoTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return isoTime;
  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes} min`;
};

export const RecipeQuickView: React.FC<RecipeQuickViewProps> = ({
  recipe,
  isOpen,
  onClose,
  onViewFull,
  onCook,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-50"
            style={{ backdropFilter: 'blur(4px)' }}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-4 right-4 bottom-4 z-50 max-w-md mx-auto"
          >
            <div 
              className="bg-white rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
            >
              {/* Header */}
              <div 
                className="relative px-4 py-4"
                style={{
                  background: 'linear-gradient(135deg, var(--jamie-primary) 0%, var(--jamie-primary-dark) 100%)',
                }}
              >
                <button
                  onClick={onClose}
                  className="absolute right-3 top-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <X className="size-4 text-white" />
                </button>
                
                <h2 
                  className="font-bold text-lg text-white pr-8"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {recipe.title}
                </h2>
                
                {/* Meta info */}
                <div className="flex items-center gap-4 mt-2 text-white/90 text-sm">
                  {recipe.estimated_time && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-4" />
                      {formatDuration(recipe.estimated_time)}
                    </span>
                  )}
                  {recipe.servings && (
                    <span className="flex items-center gap-1">
                      <Users className="size-4" />
                      {recipe.servings} servings
                    </span>
                  )}
                  {recipe.difficulty && (
                    <span className="flex items-center gap-1">
                      <ChefHat className="size-4" />
                      {recipe.difficulty}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Content */}
              <div className="p-4 max-h-[40vh] overflow-y-auto">
                {/* Description */}
                {recipe.description && (
                  <p 
                    className="text-sm mb-4"
                    style={{ 
                      color: 'var(--jamie-text-body)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {recipe.description}
                  </p>
                )}
                
                {/* Ingredients preview */}
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                  <div className="mb-4">
                    <h3 
                      className="text-xs font-bold uppercase tracking-wide mb-2"
                      style={{ color: 'var(--jamie-text-muted)' }}
                    >
                      Ingredients ({recipe.ingredients.length})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {recipe.ingredients.slice(0, 8).map((ingredient, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 rounded-full text-xs"
                          style={{
                            background: 'var(--jamie-primary)',
                            color: 'white',
                            opacity: 0.9,
                          }}
                        >
                          {ingredient.split(' ').slice(-2).join(' ')}
                        </span>
                      ))}
                      {recipe.ingredients.length > 8 && (
                        <span
                          className="px-2 py-1 rounded-full text-xs"
                          style={{
                            background: 'var(--jamie-text-muted)',
                            color: 'white',
                          }}
                        >
                          +{recipe.ingredients.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Steps preview */}
                {recipe.steps && recipe.steps.length > 0 && (
                  <div>
                    <h3 
                      className="text-xs font-bold uppercase tracking-wide mb-2"
                      style={{ color: 'var(--jamie-text-muted)' }}
                    >
                      {recipe.steps.length} Steps
                    </h3>
                    <p 
                      className="text-sm line-clamp-2"
                      style={{ color: 'var(--jamie-text-body)' }}
                    >
                      {recipe.steps[0]}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div 
                className="flex gap-3 p-4 border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  onClick={() => onViewFull(recipe.recipe_id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-colors hover:bg-gray-50"
                  style={{ 
                    borderColor: 'var(--jamie-primary-dark)',
                    color: 'var(--jamie-primary-dark)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                  }}
                >
                  <ExternalLink className="size-4" />
                  Full Recipe
                </button>
                <button
                  onClick={() => onCook(recipe.recipe_id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white transition-colors"
                  style={{ 
                    background: 'linear-gradient(90deg, var(--jamie-primary) 0%, var(--jamie-primary-dark) 100%)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                  }}
                >
                  <PlayCircle className="size-4" />
                  Cook Now!
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
