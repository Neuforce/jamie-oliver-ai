import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, Users, ChefHat, ArrowRight } from 'lucide-react';
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
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
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
              <div style={{ padding: '20px 24px', position: 'relative' }}>
                <button
                  onClick={onClose}
                  style={{
                    position: 'absolute',
                    right: '16px',
                    top: '16px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '16px',
                    background: '#F2F5F6',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X className="size-4" style={{ color: 'var(--jamie-text-muted, #717182)' }} />
                </button>
                
                <h2
                  style={{
                    fontFamily: 'var(--font-display, Poppins, sans-serif)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--jamie-text-heading, #2C5F5D)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    margin: 0,
                    paddingRight: '40px',
                    lineHeight: 1.3,
                  }}
                >
                  {recipe.title}
                </h2>
                
                {/* Meta info */}
                <div 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    marginTop: '12px',
                    fontFamily: 'var(--font-display, Poppins, sans-serif)',
                    fontSize: '14px',
                    color: 'var(--jamie-text-muted, #717182)',
                  }}
                >
                  {recipe.estimated_time && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock className="size-4" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
                      {formatDuration(recipe.estimated_time)}
                    </span>
                  )}
                  {recipe.servings && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users className="size-4" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
                      {recipe.servings}
                    </span>
                  )}
                  {recipe.difficulty && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ChefHat className="size-4" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
                      {recipe.difficulty}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Description */}
              {recipe.description && (
                <div style={{ padding: '0 24px 20px' }}>
                  <p
                    style={{
                      fontFamily: 'var(--font-display, Poppins, sans-serif)',
                      fontSize: '15px',
                      lineHeight: 1.6,
                      color: 'var(--jamie-text-primary, #234252)',
                      margin: 0,
                    }}
                  >
                    {recipe.description}
                  </p>
                </div>
              )}
              
              {/* Ingredients preview */}
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div style={{ padding: '0 24px 20px' }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display, Poppins, sans-serif)',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--jamie-text-muted, #717182)',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      marginBottom: '12px',
                    }}
                  >
                    {recipe.ingredients.length} Ingredients
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-display, Poppins, sans-serif)',
                      fontSize: '14px',
                      color: 'var(--jamie-text-muted, #717182)',
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {recipe.ingredients.slice(0, 5).join(' · ')}
                    {recipe.ingredients.length > 5 && ` · +${recipe.ingredients.length - 5} more`}
                  </p>
                </div>
              )}
              
              {/* View button */}
              <div style={{ padding: '0 24px 24px' }}>
                <button
                  onClick={() => onViewFull(recipe.recipe_id)}
                  style={{
                    width: '100%',
                    height: '50px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 14px 0 24px',
                    borderRadius: '24px',
                    border: 'none',
                    background: '#29514F',
                    color: 'white',
                    fontFamily: 'var(--font-display, Poppins, sans-serif)',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#1f423f')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#29514F')}
                >
                  <span>View Full Recipe</span>
                  <span
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '9px',
                      background: 'rgba(255,255,255,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowRight className="size-4" />
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
