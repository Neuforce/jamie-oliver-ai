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
            className="fixed inset-0 bg-black/50 z-50"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-4 right-4 bottom-4 z-50"
            style={{ maxWidth: '400px', margin: '0 auto' }}
          >
            <div 
              className="bg-white overflow-hidden"
              style={{ 
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              }}
            >
              {/* Header */}
              <div 
                className="relative px-5 py-4"
                style={{ background: '#3D6E6C' }}
              >
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 p-1.5 rounded-full transition-colors"
                  style={{ background: 'rgba(255, 255, 255, 0.2)' }}
                >
                  <X className="size-4 text-white" />
                </button>
                
                <h2
                  style={{
                    fontFamily: 'var(--font-display, Poppins, sans-serif)',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'white',
                    textTransform: 'uppercase',
                    letterSpacing: '0.087px',
                    margin: 0,
                    paddingRight: '40px',
                  }}
                >
                  {recipe.title}
                </h2>
                
                {/* Meta info */}
                <div 
                  className="flex items-center gap-4 mt-3"
                  style={{
                    fontFamily: 'var(--font-body, Inter, sans-serif)',
                    fontSize: '13px',
                    color: 'rgba(255, 255, 255, 0.9)',
                  }}
                >
                  {recipe.estimated_time && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-4" />
                      {formatDuration(recipe.estimated_time)}
                    </span>
                  )}
                  {recipe.servings && (
                    <span className="flex items-center gap-1.5">
                      <Users className="size-4" />
                      {recipe.servings} servings
                    </span>
                  )}
                  {recipe.difficulty && (
                    <span className="flex items-center gap-1.5">
                      <ChefHat className="size-4" />
                      {recipe.difficulty}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Content */}
              <div className="p-5" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                {/* Description */}
                {recipe.description && (
                  <p
                    style={{
                      fontFamily: 'var(--font-body, Inter, sans-serif)',
                      fontSize: '14px',
                      lineHeight: 1.6,
                      color: '#234252',
                      margin: 0,
                      marginBottom: '20px',
                    }}
                  >
                    {recipe.description}
                  </p>
                )}
                
                {/* Ingredients preview */}
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                  <div className="mb-5">
                    <h3
                      style={{
                        fontFamily: 'var(--font-display, Poppins, sans-serif)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#5d5d5d',
                        letterSpacing: '0.15em',
                        marginBottom: '12px',
                      }}
                    >
                      INGREDIENTS ({recipe.ingredients.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {recipe.ingredients.slice(0, 8).map((ingredient, index) => (
                        <span
                          key={index}
                          style={{
                            display: 'inline-flex',
                            padding: '6px 12px',
                            borderRadius: '33554400px',
                            background: '#F2F5F6',
                            color: '#3D6E6C',
                            fontFamily: 'var(--font-body, Inter, sans-serif)',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          {ingredient.split(' ').slice(-2).join(' ')}
                        </span>
                      ))}
                      {recipe.ingredients.length > 8 && (
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '6px 12px',
                            borderRadius: '33554400px',
                            background: '#E6EAE9',
                            color: '#5d5d5d',
                            fontFamily: 'var(--font-body, Inter, sans-serif)',
                            fontSize: '12px',
                            fontWeight: 500,
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
                      style={{
                        fontFamily: 'var(--font-display, Poppins, sans-serif)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#5d5d5d',
                        letterSpacing: '0.15em',
                        marginBottom: '8px',
                      }}
                    >
                      {recipe.steps.length} STEPS
                    </h3>
                    <p
                      style={{
                        fontFamily: 'var(--font-body, Inter, sans-serif)',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        color: '#5d5d5d',
                        margin: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {recipe.steps[0]}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div 
                className="flex gap-3 p-5"
                style={{ borderTop: '1px solid #E6EAE9' }}
              >
                <button
                  onClick={() => onViewFull(recipe.recipe_id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full transition-colors hover:bg-gray-50"
                  style={{ 
                    border: '1px solid #3D6E6C',
                    color: '#3D6E6C',
                    fontFamily: 'var(--font-display, Poppins, sans-serif)',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  <ExternalLink className="size-4" />
                  Full Recipe
                </button>
                <button
                  onClick={() => onCook(recipe.recipe_id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-white transition-colors"
                  style={{ 
                    background: '#3D6E6C',
                    fontFamily: 'var(--font-display, Poppins, sans-serif)',
                    fontSize: '14px',
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
