/**
 * Transform RecipeMatchResponse from backend to Recipe format for frontend
 */

import type { Recipe } from './recipes';
import type { RecipeMatchResponse } from '../lib/api';

// Recipe data from jamie-oliver-ai format (same as in recipeLoader.ts)
export interface JamieOliverRecipe {
  recipe: {
    id: string;
    title: string;
    description: string;
    estimated_total: string;
    locale: string;
    source: string;
    servings: number;
    difficulty: string;
  };
  ingredients: Array<{
    id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
  }>;
  utensils: Array<unknown>;
  steps: Array<{
    id: string;
    descr: string;
    instructions: string;
    type: string;
    auto_start: boolean;
    requires_confirm: boolean;
    depends_on: string[];
    next: string[];
  }>;
  events?: {
    tts_voice?: string;
    reminder_default?: {
      every: string;
    };
  };
  notes?: {
    text?: string;
  };
}

// Map recipe ID to image filename (same logic as in recipeLoader.ts)
function getImagePath(recipeId: string): string {
  const imageName = recipeId
    .replace(/-jamie-oliver-recipes$/, '')
    .toLowerCase();

  const imageMap: Record<string, string> = {
    'christmas-salad-jamie-oliver-recipes': 'christmas-salad',
    'christmas-salad': 'christmas-salad',
    'happy-fish-pie': 'happy-fish-pie',
    'smoked-salmon-pasta-jamie-oliver-recipes': 'smoked-salmon-pasta',
    'smoked-salmon-pasta': 'smoked-salmon-pasta',
    'somali-beef-stew-jamie-oliver-recipes': 'somali-beef-stew',
    'somali-beef-stew': 'somali-beef-stew',
    'tomato-mussel-pasta': 'tomato-mussel-pasta',
    'greek-salad': 'greek-salad',
    'fish-and-chips': 'easy-fish-and-chips',
    'thai-green-curry': 'thai-green-curry',
    'shrimp-scampi': 'shrimp-scampi',
    'pad-thai': 'pad-thai',
    'grilled-salmon-with-lemon': 'grilled-salmon',
    'chicken-tikka-masala': 'chicken-tikka-masala',
    'chicken-noodle-soup': 'chicken-noodle-soup',
    'chicken-caesar-salad': 'chicken-caesar-salad',
    'roast-chicken-dinner': 'roast-chicken-dinner',
    'pesto-pasta': 'pesto-pasta',
    'beef-wellington': 'beef-wellington',
    'beef-tacos': 'beef-tacos',
    'beef-kebabs': 'beef-kebabs',
    'classic-spaghetti-carbonara': 'classic-spaghetti-carbonara',
    'classic-lasagna': 'classic-lasagna',
    'classic-apple-pie': 'classic-apple-pie',
    'french-onion-soup': 'french-onion-soup',
    'fresh-tomato-soup': 'fresh-tomato-soup',
    'french-toast': 'french-toast',
    'full-english-breakfast': 'english-breakfast',
    'eggs-benedict': 'eggs-benedict',
    'mushroom-risotto': 'mushroom-risotto',
    'moussaka': 'moussaka',
    'quinoa-salad': 'quinoa-salad',
    'shepherds-pie': 'shepherd-s-pie',
    'steak-and-fries': 'steak-and-fries',
    'tiramisu': 'tiramisu',
    'vegetable-curry': 'vegetable-curry',
  };

  const mappedName = imageMap[recipeId] || imageMap[imageName] || imageName;
  return `/recipes-img/${mappedName}.webp`;
}

// Parse ISO 8601 duration (PT20M, PT1H5M) to "20 mins" format
function parseDuration(duration: string): string {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return '30 mins';

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes} mins`;
  }
}

// Map difficulty from jamie-oliver-ai to Recipe format
function mapDifficulty(difficulty: string): 'Easy' | 'Medium' | 'Hard' {
  const lower = difficulty.toLowerCase();
  if (lower.includes('not too tricky') || lower.includes('easy')) {
    return 'Easy';
  } else if (lower.includes('tricky') || lower.includes('hard')) {
    return 'Hard';
  }
  return 'Medium';
}

// Transform ingredients array to string array
function transformIngredients(ingredients: JamieOliverRecipe['ingredients']): string[] {
  return ingredients.map(ing => {
    const parts: string[] = [];
    if (ing.quantity !== null) {
      parts.push(ing.quantity.toString());
    }
    if (ing.unit) {
      parts.push(ing.unit);
    }
    parts.push(ing.name);
    return parts.join(' ');
  });
}

// Transform steps to instructions array
function transformInstructions(steps: JamieOliverRecipe['steps']): string[] {
  return steps.map(step => step.instructions);
}

// Extract category from title or use default
function extractCategory(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('pasta') || lower.includes('spaghetti')) return 'Italian';
  if (lower.includes('salad')) return 'Salads';
  if (lower.includes('stew') || lower.includes('curry')) return 'Main Course';
  if (lower.includes('pie')) return 'Main Course';
  return 'Main Course'; // Default category
}

/**
 * Transform RecipeMatchResponse from backend to Recipe format
 * @param match - The recipe match from the backend
 * @param fullRecipe - The full recipe data (from full_recipe field or loaded from JSON)
 * @param index - Optional index for numeric ID (if not provided, uses recipe_id hash)
 */
export function transformRecipeMatch(
  match: RecipeMatchResponse,
  fullRecipe: JamieOliverRecipe,
  index?: number
): Recipe {
  const recipe = fullRecipe.recipe;

  // Generate numeric ID from recipe_id if index not provided
  const numericId = index !== undefined
    ? index + 1
    : match.recipe_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10000;

  return {
    id: numericId,
    title: match.title || recipe.title,
    description: recipe.description || fullRecipe.steps[0]?.descr || recipe.title,
    category: extractCategory(recipe.title),
    difficulty: mapDifficulty(recipe.difficulty),
    time: parseDuration(recipe.estimated_total),
    servings: recipe.servings,
    image: getImagePath(match.recipe_id),
    ingredients: transformIngredients(fullRecipe.ingredients),
    instructions: transformInstructions(fullRecipe.steps),
    tips: fullRecipe.notes?.text
      ? fullRecipe.notes.text.split('\n').filter(line => line.trim().length > 0)
      : [],
  };
}

/**
 * Load recipe JSON from /recipes-json/ directory
 * This is used as fallback when full_recipe is not included in the API response
 * Recipes are served from public/recipes-json/ which is available at /recipes-json/ in both dev and prod
 */
export async function loadRecipeFromLocal(recipeId: string): Promise<JamieOliverRecipe | null> {
  try {
    // Try to get the recipe name from the ID
    const recipeName = recipeId.replace(/-jamie-oliver-recipes$/, '');

    // Try common patterns to find the recipe file
    const possibleNames = [
      recipeId,
      recipeName,
      recipeId.replace(/\.json$/, ''),
    ];

    for (const name of possibleNames) {
      try {
        const response = await fetch(`/recipes-json/${name}.json`);
        if (response.ok) {
          const recipe = await response.json() as JamieOliverRecipe;
          if (recipe && recipe.recipe && recipe.recipe.id === recipeId) {
            return recipe;
          }
        }
      } catch (e) {
        // Continue to next name
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to load recipe ${recipeId} from local files:`, error);
    return null;
  }
}
