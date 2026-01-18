import React from 'react';
import { motion } from 'motion/react';
import { Clock, Users, ChefHat, ChevronRight } from 'lucide-react';
import type { MealPlanData, ToolRecipe } from '../lib/api';

interface MealPlanCardProps {
  mealPlan: MealPlanData;
  onViewRecipe: (recipeId: string) => void;
  onCookRecipe: (recipeId: string) => void;
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
  return `${minutes}min`;
};

// Course display names
const courseNames: Record<string, string> = {
  starter: 'Starter',
  salad: 'Salad',
  main: 'Main Course',
  side: 'Side',
  dessert: 'Dessert',
};

// Recipe row component - simple, clickable
const RecipeRow: React.FC<{
  recipe: ToolRecipe;
  onClick: () => void;
}> = ({ recipe, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="w-full text-left"
    style={{
      padding: '16px 0',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <h4
        style={{
          color: 'var(--jamie-text-heading, #2C5F5D)',
          fontFamily: 'var(--font-display, Poppins, sans-serif)',
          fontSize: '15px',
          fontWeight: 600,
          lineHeight: 1.3,
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
          margin: 0,
        }}
      >
        {recipe.title}
      </h4>
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginTop: '6px',
          fontFamily: 'var(--font-display, Poppins, sans-serif)',
          fontSize: '13px',
          color: 'var(--jamie-text-muted, #717182)',
        }}
      >
        {recipe.estimated_time && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock className="size-3.5" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
            {formatDuration(recipe.estimated_time)}
          </span>
        )}
        {recipe.difficulty && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ChefHat className="size-3.5" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
            {recipe.difficulty}
          </span>
        )}
      </div>
    </div>
    <ChevronRight 
      className="size-5 shrink-0" 
      style={{ color: 'var(--jamie-text-muted, #717182)' }} 
    />
  </motion.button>
);

export const MealPlanCard: React.FC<MealPlanCardProps> = ({
  mealPlan,
  onViewRecipe,
}) => {
  const courseOrder = ['starter', 'salad', 'main', 'side', 'dessert'];
  const activeCourses = courseOrder.filter(
    (course) => mealPlan.courses[course as keyof typeof mealPlan.courses]?.length
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden bg-white"
      style={{
        borderRadius: '24px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Header - minimal */}
      <div style={{ padding: '20px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display, Poppins, sans-serif)',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--jamie-text-heading, #2C5F5D)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              margin: 0,
            }}
          >
            Your Meal Plan
          </h2>
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-display, Poppins, sans-serif)',
              fontSize: '14px',
              color: 'var(--jamie-text-muted, #717182)',
            }}
          >
            <Users className="size-4" style={{ color: 'var(--jamie-primary, #46BEA8)' }} />
            <span>Serves {mealPlan.serves}</span>
          </div>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-display, Poppins, sans-serif)',
            fontSize: '14px',
            color: 'var(--jamie-text-muted, #717182)',
            marginTop: '4px',
            textTransform: 'capitalize',
          }}
        >
          {mealPlan.occasion}
        </p>
      </div>

      {/* Courses */}
      <div style={{ padding: '0 24px 24px' }}>
        {activeCourses.map((course, sectionIndex) => {
          const recipes = mealPlan.courses[course as keyof typeof mealPlan.courses];
          if (!recipes?.length) return null;
          
          return (
            <div key={course}>
              {/* Section header */}
              <div
                style={{
                  fontFamily: 'var(--font-display, Poppins, sans-serif)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--jamie-text-muted, #717182)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  paddingTop: sectionIndex > 0 ? '8px' : '0',
                  paddingBottom: '4px',
                  borderTop: sectionIndex > 0 ? '1px solid #E6EAE9' : 'none',
                }}
              >
                {courseNames[course] || course}
              </div>
              
              {/* Recipe rows */}
              {recipes.map((recipe, index) => (
                <React.Fragment key={recipe.recipe_id}>
                  <RecipeRow
                    recipe={recipe}
                    onClick={() => onViewRecipe(recipe.recipe_id)}
                  />
                  {index < recipes.length - 1 && (
                    <div style={{ height: '1px', background: '#F2F5F6' }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};
