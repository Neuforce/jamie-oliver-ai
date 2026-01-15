import type { Recipe, BackendRecipeStep } from './recipes';

// Recipe data from jamie-oliver-ai format
export interface BackendRecipePayload {
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
  utensils: Array<any>;
  steps: Array<{
    id: string;
    descr: string;
    instructions: string;
    type: string;
    auto_start: boolean;
    requires_confirm: boolean;
    depends_on: string[];
    next: string[];
    duration?: string;
    reminder?: {
      every?: string;
    };
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

// Map recipe ID to image filename
function getImagePath(recipeId: string): string {
  // Remove common suffixes and normalize
  let imageName = recipeId
    .replace(/-jamie-oliver-recipes$/, '')
    .toLowerCase();
  
  // Map known recipe IDs to image filenames
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

// Map difficulty from jamie-oliver-ai to joui format
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
function transformIngredients(ingredients: BackendRecipePayload['ingredients']): string[] {
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
function transformInstructions(steps: BackendRecipePayload['steps']): string[] {
  return steps.map(step => step.instructions);
}

// Capture backend step metadata so the UI can stay in sync with the engine
function transformBackendSteps(steps: BackendRecipePayload['steps']): BackendRecipeStep[] {
  return steps.map(step => ({
    id: step.id,
    descr: step.descr,
    instructions: step.instructions,
    type: step.type || 'immediate',
    autoStart: step.auto_start ?? true,
    requiresConfirm: step.requires_confirm ?? false,
    duration: step.duration,
    reminderEvery: step.reminder?.every,
    dependsOn: step.depends_on || [],
    next: step.next || [],
  }));
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

// Transform jamie-oliver-ai recipe to joui format
function transformRecipe(jamieRecipe: BackendRecipePayload, index: number): Recipe {
  const recipe = jamieRecipe.recipe;
  const backendSteps = transformBackendSteps(jamieRecipe.steps);
  const transformUtensils = (utensils?: Array<any>): string[] => {
    if (!utensils || !Array.isArray(utensils)) return [];
    return utensils
      .map((u) => {
        if (typeof u === 'string') return u;
        if (typeof u === 'object' && u !== null) {
          return (u as any).name || (u as any).label || (u as any).descr || (u as any).id;
        }
        return null;
      })
      .filter((v): v is string => Boolean(v));
  };
  
  return {
    id: index + 1, // Use index as numeric ID
    backendId: recipe.id,
    title: recipe.title,
    description: recipe.description || jamieRecipe.steps[0]?.descr || recipe.title,
    category: extractCategory(recipe.title),
    difficulty: mapDifficulty(recipe.difficulty),
    time: parseDuration(recipe.estimated_total),
    servings: recipe.servings,
    image: getImagePath(recipe.id),
    ingredients: transformIngredients(jamieRecipe.ingredients),
    instructions: transformInstructions(jamieRecipe.steps),
    tips: jamieRecipe.notes?.text 
      ? jamieRecipe.notes.text.split('\n').filter(line => line.trim().length > 0)
      : [],
    utensils: transformUtensils(jamieRecipe.utensils),
    backendSteps,
    rawRecipePayload: jamieRecipe,
  };
}

// Load recipes from Supabase API with fallback to local files
// API endpoint: /api/v1/recipes (backend-search service)
// Local fallback: public/recipes-json/ (development mode)

let cachedRecipes: Recipe[] | null = null;

// @ts-expect-error - Vite provides import.meta.env
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Clear the recipe cache to force a fresh load from API
 */
export function clearRecipeCache(): void {
  cachedRecipes = null;
  console.log('Recipe cache cleared');
}

/**
 * Load recipes from Supabase via backend-search API
 */
async function loadRecipesFromAPI(): Promise<Recipe[]> {
  const recipes: Recipe[] = [];
  
  try {
    // Fetch all recipes with full JSON from API
    const url = `${API_BASE_URL}/api/v1/recipes?include_full=true&limit=100`;
    console.log(`[RecipeLoader] Fetching from API: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`[RecipeLoader] API response:`, {
      source: data.source,
      total: data.total,
      recipesCount: data.recipes?.length || 0,
    });
    
    if (!data.recipes || data.recipes.length === 0) {
      throw new Error('No recipes returned from API');
    }
    
    // Transform API response to Recipe format
    let index = 0;
    let skipped = 0;
    for (const apiRecipe of data.recipes) {
      if (apiRecipe.full_recipe && 'recipe' in apiRecipe.full_recipe) {
        recipes.push(transformRecipe(apiRecipe.full_recipe as BackendRecipePayload, index));
        index++;
      } else {
        console.warn(`[RecipeLoader] Skipping recipe without full_recipe:`, apiRecipe.recipe_id || apiRecipe.title);
        skipped++;
      }
    }
    
    console.log(`[RecipeLoader] ✅ Loaded ${recipes.length} recipes from Supabase (skipped: ${skipped})`);
    
    if (recipes.length === 0) {
      throw new Error('All recipes were skipped - no valid full_recipe data');
    }
    
    return recipes;
  } catch (error) {
    console.error('[RecipeLoader] ❌ Failed to load from API:', error);
    throw error;
  }
}

/**
 * Load recipes from local JSON files (fallback)
 */
async function loadRecipesFromLocal(): Promise<Recipe[]> {
  const recipes: Recipe[] = [];
  let index = 0;

  try {
    // Fetch recipes list
    const listResponse = await fetch('/recipes-json/recipes-list.json');
    if (!listResponse.ok) {
      console.error('Failed to load recipes list:', listResponse.statusText);
      return [];
    }

    const recipeNames: string[] = await listResponse.json();
    
    // Fetch all recipes in parallel
    const loadedRecipes = await Promise.all(
      recipeNames.map(async (name) => {
        try {
          const response = await fetch(`/recipes-json/${name}.json`);
          if (response.ok) {
            return await response.json() as BackendRecipePayload;
          }
          console.warn(`Failed to load recipe ${name}: ${response.statusText}`);
          return null;
        } catch (e) {
          console.warn(`Failed to load recipe ${name}:`, e);
          return null;
        }
      })
    );
    
    // Transform and add recipes
    for (const recipe of loadedRecipes) {
      if (recipe && 'recipe' in recipe) {
        recipes.push(transformRecipe(recipe, index));
        index++;
      }
    }
    
    console.log(`Loaded ${recipes.length} recipes from local files (fallback)`);
    return recipes;
  } catch (e) {
    console.error('Failed to load recipes from local files:', e);
    return [];
  }
}

export async function loadRecipes(): Promise<Recipe[]> {
  // Return cached recipes if available
  if (cachedRecipes) {
    return cachedRecipes;
  }

  let recipes: Recipe[] = [];

  // Try API first, fallback to local files
  try {
    recipes = await loadRecipesFromAPI();
  } catch {
    recipes = await loadRecipesFromLocal();
  }
  
  // Sort by title for consistency and cache
  cachedRecipes = recipes.sort((a, b) => a.title.localeCompare(b.title));
  return cachedRecipes;
}

// Synchronous version for backward compatibility
// Returns empty array initially, will be populated after loadRecipes() is called
export function loadRecipesSync(): Recipe[] {
  return cachedRecipes || [];
}
