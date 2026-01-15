import type { BackendRecipePayload } from './recipeLoader';

export interface BackendRecipeStep {
  id: string;
  descr: string;
  instructions: string;
  type: string;
  autoStart: boolean;
  requiresConfirm: boolean;
  duration?: string;
  reminderEvery?: string;
  dependsOn: string[];
  next: string[];
}

export interface Recipe {
  id: number;
  /**
   * ID used by the backend recipe engine (slug, e.g. 'smoked-salmon-pasta').
   * Needed so the voice agent can load the exact same recipe.
   */
  backendId?: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  time: string;
  servings: number;
  image: string;
  ingredients: string[];
  instructions: string[];
  tips: string[];
  utensils?: string[];
  /**
   * Full fidelity copy of backend steps so the UI can stay in sync with voice.
   */
  backendSteps?: BackendRecipeStep[];
  /**
   * Full backend recipe payload (as authored in JSON) so we can send it to the voice agent.
   */
  rawRecipePayload?: BackendRecipePayload;
}

import { loadRecipes, loadRecipesSync } from './recipeLoader';

// Load recipes from JSON files
// Recipes are loaded asynchronously from /recipes-json/ directory
// This array will be empty initially and populated after initializeRecipes() is called
export const recipes: Recipe[] = [];

// Async loader for production builds
let recipesPromise: Promise<Recipe[]> | null = null;
export async function loadRecipesAsync(): Promise<Recipe[]> {
  if (!recipesPromise) {
    recipesPromise = loadRecipes();
  }
  return recipesPromise;
}

// Initialize recipes async in production (call this in App.tsx useEffect)
export async function initializeRecipes(): Promise<Recipe[]> {
  const loaded = await loadRecipesAsync();
  // Update the recipes array if it was empty
  if (recipes.length === 0 && loaded.length > 0) {
    recipes.push(...loaded);
  }
  return loaded;
}

// Derive categories from loaded recipes
// This will be empty initially in production, but will be populated after initializeRecipes()
export const categories: string[] = [
  "All",
  ...Array.from(new Set(recipes.map(r => r.category))).sort()
];

// Helper to get categories after recipes are loaded
export function getCategories(recipesList: Recipe[]): string[] {
  return [
    "All",
    ...Array.from(new Set(recipesList.map(r => r.category))).sort()
  ];
}
