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
  // Parse PT25M or PT1H30M format
  const match = isoTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return isoTime;
  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}min`;
};

// Course emoji mapping
const courseEmoji: Record<string, string> = {
  starter: '🥗',
  main: '🍽️',
  dessert: '🍰',
  side: '🥦',
  salad: '🥬',
};

// Course display names
const courseNames: Record<string, string> = {
  starter: 'Starter',
  main: 'Main Course',
  dessert: 'Dessert',
  side: 'Side Dish',
  salad: 'Salad',
};

// Recipe item component
const RecipeItem: React.FC<{
  recipe: ToolRecipe;
  onView: () => void;
  onCook: () => void;
  index: number;
}> = ({ recipe, onView, onCook, index }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.05 }}
    className="flex items-center justify-between p-3 rounded-xl bg-white border border-black/5 hover:border-jamie-primary/30 transition-all"
    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
  >
    <div className="flex-1 min-w-0">
      <h4 
        className="font-semibold text-sm truncate"
        style={{ color: 'var(--jamie-text-heading)' }}
      >
        {recipe.title}
      </h4>
      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--jamie-text-muted)' }}>
        {recipe.estimated_time && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatDuration(recipe.estimated_time)}
          </span>
        )}
        {recipe.difficulty && (
          <span className="flex items-center gap-1">
            <ChefHat className="size-3" />
            {recipe.difficulty}
          </span>
        )}
      </div>
    </div>
    
    <div className="flex items-center gap-2 ml-2">
      <button
        onClick={onView}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        title="View recipe"
      >
        <Eye className="size-4" style={{ color: 'var(--jamie-primary-dark)' }} />
      </button>
      <button
        onClick={onCook}
        className="p-2 rounded-full bg-jamie-primary hover:bg-jamie-primary-dark transition-colors"
        title="Start cooking"
      >
        <PlayCircle className="size-4 text-white" />
      </button>
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
}> = ({ courseName, recipes, onViewRecipe, onCookRecipe, sectionIndex }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: sectionIndex * 0.1 }}
    className="space-y-2"
  >
    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide"
      style={{ color: 'var(--jamie-text-muted)' }}
    >
      <span>{courseEmoji[courseName] || '🍴'}</span>
      {courseNames[courseName] || courseName}
    </h3>
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

export const MealPlanCard: React.FC<MealPlanCardProps> = ({
  mealPlan,
  onViewRecipe,
  onCookRecipe,
}) => {
  // Get courses in display order
  const courseOrder = ['starter', 'salad', 'main', 'side', 'dessert'];
  const activeCourses = courseOrder.filter(
    (course) => mealPlan.courses[course as keyof typeof mealPlan.courses]?.length
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #f8fffe 0%, #f0faf8 100%)',
        border: '1px solid rgba(70, 190, 168, 0.2)',
        boxShadow: '0 4px 20px rgba(70, 190, 168, 0.1)',
      }}
    >
      {/* Header */}
      <div 
        className="px-4 py-3"
        style={{
          background: 'linear-gradient(90deg, var(--jamie-primary) 0%, var(--jamie-primary-dark) 100%)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍽️</span>
            <h2 className="font-bold text-white text-lg">
              Your Meal Plan
            </h2>
          </div>
          <div className="flex items-center gap-2 text-white/90 text-sm">
            <Users className="size-4" />
            <span>Serves {mealPlan.serves}</span>
          </div>
        </div>
        <p className="text-white/80 text-sm mt-1 capitalize">
          {mealPlan.occasion} meal
        </p>
      </div>

      {/* Courses */}
      <div className="p-4 space-y-4">
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
          className="px-4 py-3 border-t"
          style={{ 
            borderColor: 'rgba(70, 190, 168, 0.2)',
            background: 'rgba(70, 190, 168, 0.05)',
          }}
        >
          <div className="flex items-start gap-2">
            <span className="text-base">💡</span>
            <div className="text-xs" style={{ color: 'var(--jamie-text-muted)' }}>
              <span className="font-semibold">Jamie's Tips: </span>
              {mealPlan.tips[0]}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
