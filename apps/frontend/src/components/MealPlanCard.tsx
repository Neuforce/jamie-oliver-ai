import React from 'react';
import { motion } from 'motion/react';
import { Clock, Users, ChefHat, Eye, PlayCircle } from 'lucide-react';
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

// Course display config
const courseConfig: Record<string, { label: string; emoji: string }> = {
  starter: { label: 'STARTER', emoji: '🥗' },
  salad: { label: 'SALAD', emoji: '🥬' },
  main: { label: 'MAIN COURSE', emoji: '🍽️' },
  side: { label: 'SIDE DISH', emoji: '🥦' },
  dessert: { label: 'DESSERT', emoji: '🍰' },
};

// Styled badge matching RecipeCard
const badgeStyle: React.CSSProperties = {
  height: '27px',
  padding: '6px 12px',
  borderRadius: '33554400px',
  background: '#3D6E6C',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -4px rgba(0, 0, 0, 0.10)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  color: 'white',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  fontFamily: 'var(--font-body, Inter, sans-serif)',
};

// Recipe item component
const RecipeItem: React.FC<{
  recipe: ToolRecipe;
  onView: () => void;
  onCook: () => void;
  index: number;
}> = ({ recipe, onView, onCook, index }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05 }}
    className="bg-white overflow-hidden"
    style={{
      borderRadius: '16px',
      border: '1px solid rgba(0, 0, 0, 0.06)',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
    }}
  >
    <div className="p-4 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <h4
          style={{
            color: '#3D6E6C',
            fontFamily: 'var(--font-display, Poppins, sans-serif)',
            fontSize: '14px',
            fontWeight: 600,
            lineHeight: '20px',
            textTransform: 'uppercase',
            letterSpacing: '0.087px',
            margin: 0,
          }}
        >
          {recipe.title}
        </h4>
        <div 
          className="flex items-center gap-4 mt-2"
          style={{
            fontFamily: 'var(--font-body, Inter, sans-serif)',
            fontSize: '13px',
            color: '#5d5d5d',
          }}
        >
          {recipe.estimated_time && (
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" style={{ color: '#3D6E6C' }} />
              {formatDuration(recipe.estimated_time)}
            </span>
          )}
          {recipe.difficulty && (
            <span className="flex items-center gap-1.5">
              <ChefHat className="size-3.5" style={{ color: '#3D6E6C' }} />
              {recipe.difficulty}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onView(); }}
          className="p-2.5 rounded-full transition-colors hover:bg-gray-100"
          style={{ border: '1px solid rgba(0, 0, 0, 0.08)' }}
          title="View recipe"
        >
          <Eye className="size-4" style={{ color: '#3D6E6C' }} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCook(); }}
          className="p-2.5 rounded-full transition-colors"
          style={{ 
            background: '#3D6E6C',
            border: 'none',
          }}
          title="Start cooking"
        >
          <PlayCircle className="size-4 text-white" />
        </button>
      </div>
    </div>
  </motion.div>
);

// Course section component
const CourseSection: React.FC<{
  courseName: string;
  recipes: ToolRecipe[];
  onViewRecipe: (recipeId: string) => void;
  onCookRecipe: (recipeId: string) => void;
  sectionIndex: number;
}> = ({ courseName, recipes, onViewRecipe, onCookRecipe, sectionIndex }) => {
  const config = courseConfig[courseName] || { label: courseName.toUpperCase(), emoji: '🍴' };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: sectionIndex * 0.1 }}
    >
      <div 
        className="flex items-center gap-2 mb-3"
        style={{
          fontFamily: 'var(--font-display, Poppins, sans-serif)',
          fontSize: '11px',
          fontWeight: 700,
          color: '#5d5d5d',
          letterSpacing: '0.15em',
        }}
      >
        <span style={{ fontSize: '14px' }}>{config.emoji}</span>
        {config.label}
      </div>
      <div className="space-y-2">
        {recipes.map((recipe, index) => (
          <RecipeItem
            key={recipe.recipe_id}
            recipe={recipe}
            onView={() => onViewRecipe(recipe.recipe_id)}
            onCook={() => onCookRecipe(recipe.recipe_id)}
            index={index}
          />
        ))}
      </div>
    </motion.div>
  );
};

export const MealPlanCard: React.FC<MealPlanCardProps> = ({
  mealPlan,
  onViewRecipe,
  onCookRecipe,
}) => {
  const courseOrder = ['starter', 'salad', 'main', 'side', 'dessert'];
  const activeCourses = courseOrder.filter(
    (course) => mealPlan.courses[course as keyof typeof mealPlan.courses]?.length
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="overflow-hidden bg-white"
      style={{
        borderRadius: '24px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Header */}
      <div 
        className="px-5 py-4"
        style={{ background: '#3D6E6C' }}
      >
        <div className="flex items-center justify-between">
          <h2
            style={{
              fontFamily: 'var(--font-display, Poppins, sans-serif)',
              fontSize: '16px',
              fontWeight: 700,
              color: 'white',
              textTransform: 'uppercase',
              letterSpacing: '0.087px',
              margin: 0,
            }}
          >
            Your Meal Plan
          </h2>
          <div 
            className="flex items-center gap-1.5"
            style={{
              fontFamily: 'var(--font-body, Inter, sans-serif)',
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.9)',
            }}
          >
            <Users className="size-4" />
            <span>Serves {mealPlan.serves}</span>
          </div>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-body, Inter, sans-serif)',
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.75)',
            marginTop: '4px',
            textTransform: 'capitalize',
          }}
        >
          {mealPlan.occasion} meal
        </p>
      </div>

      {/* Courses */}
      <div className="p-5 space-y-5">
        {activeCourses.map((course, index) => {
          const recipes = mealPlan.courses[course as keyof typeof mealPlan.courses];
          if (!recipes?.length) return null;
          
          return (
            <CourseSection
              key={course}
              courseName={course}
              recipes={recipes}
              onViewRecipe={onViewRecipe}
              onCookRecipe={onCookRecipe}
              sectionIndex={index}
            />
          );
        })}
      </div>

      {/* Tips */}
      {mealPlan.tips && mealPlan.tips.length > 0 && (
        <div 
          className="px-5 py-4"
          style={{ 
            borderTop: '1px solid #E6EAE9',
            background: '#F8FAFA',
          }}
        >
          <div className="flex items-start gap-3">
            <span style={{ fontSize: '16px' }}>💡</span>
            <p
              style={{
                fontFamily: 'var(--font-body, Inter, sans-serif)',
                fontSize: '13px',
                color: '#5d5d5d',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              <span style={{ fontWeight: 600, color: '#3D6E6C' }}>Jamie's Tip: </span>
              {mealPlan.tips[0]}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
};
