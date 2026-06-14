import type { Recipe, BackendRecipeStep } from './recipes';
import { loadRecipeBySlug } from './loadRecipeBySlug';
import { API_BASE_URL } from '../lib/runtimeConfig';

interface ApiRecipeListItem {
  recipe_id: string;
  title?: string;
  description?: string;
  category?: string | null;
  complexity?: string | null;
  servings?: number | null;
  image_url?: string | null;
  full_recipe?: BackendRecipePayload;
}

// Recipe data from jamie-oliver-ai format
export interface BackendRecipePayload {
  recipe: {
    id: string;
    title: string;
    description: string;
    estimated_total?: string | null;
    locale: string;
    source: string;
    servings: number;
    difficulty?: string | null;
    /** From crawl / ingest; first element drives API category when present */
    categories?: string[];
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
    /**
     * Optional list of named timers for this step (e.g. simmer + rest).
     * Forwarded as-is into the frontend step model so the cook overlay
     * can render a TimerCarousel when length > 1.
     */
    timers?: Array<{ label?: string; duration: string }>;
    /** Optional video clip the cook overlay can show as a preview. */
    clip?: { thumbnailUrl: string; videoUrl: string };
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

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Parse ISO 8601 duration (PT20M, PT1H5M) to "20 mins" format
function parseDuration(duration: string | undefined | null): string {
  if (duration == null || typeof duration !== 'string' || !duration.trim()) {
    return '30 mins';
  }
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
function mapDifficulty(difficulty: string | undefined | null): 'Easy' | 'Medium' | 'Hard' {
  if (difficulty == null || typeof difficulty !== 'string') {
    return 'Medium';
  }
  const lower = difficulty.toLowerCase();
  if (lower.includes('not too tricky') || lower.includes('easy')) {
    return 'Easy';
  } else if (lower.includes('tricky') || lower.includes('hard')) {
    return 'Hard';
  }
  return 'Medium';
}

// Transform ingredients array to string array
function transformIngredients(ingredients: BackendRecipePayload['ingredients'] | undefined): string[] {
  if (!ingredients || !Array.isArray(ingredients)) {
    return [];
  }
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
function isCharacterSplitSteps(steps: BackendRecipePayload['steps'] | undefined): boolean {
  if (!steps || !Array.isArray(steps) || steps.length < 50) {
    return false;
  }
  const shortCount = steps.filter((step) => {
    const text = (step.instructions || step.descr || '').trim();
    return text.length <= 1;
  }).length;
  return shortCount / steps.length > 0.8;
}

function rebuildCharacterSplitSteps(
  steps: BackendRecipePayload['steps']
): BackendRecipePayload['steps'] {
  const joined = steps
    .map((step) => step.instructions || step.descr || '')
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])(?=[A-Z])/g, '$1|')
    .replace(/,(?=\s*(Meanwhile|When|Then|Next|Finally|To serve|Serve|Add|Tip|Stir|Cook|Use)\b)/g, ',|')
    .trim();

  const rawSegments = joined
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const mergedSegments: string[] = [];
  for (const segment of rawSegments) {
    if (mergedSegments.length === 0) {
      mergedSegments.push(segment);
      continue;
    }
    if (segment.length < 48) {
      mergedSegments[mergedSegments.length - 1] += ` ${segment}`;
    } else {
      mergedSegments.push(segment);
    }
  }

  const segments = mergedSegments.length > 0 ? mergedSegments : [joined];
  return segments.map((text, index) => {
    const currentId = `step_${index + 1}`;
    const nextId = index < segments.length - 1 ? `step_${index + 2}` : undefined;
    const summary = text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text;

    return {
      id: currentId,
      descr: summary,
      instructions: text,
      type: 'immediate',
      auto_start: index === 0,
      requires_confirm: true,
      depends_on: index > 0 ? [`step_${index}`] : [],
      next: nextId ? [nextId] : [],
    };
  });
}

function normalizeSteps(steps: BackendRecipePayload['steps'] | undefined): BackendRecipePayload['steps'] {
  if (!steps || !Array.isArray(steps)) {
    return [];
  }
  return isCharacterSplitSteps(steps) ? rebuildCharacterSplitSteps(steps) : steps;
}

function transformInstructions(steps: BackendRecipePayload['steps'] | undefined): string[] {
  return normalizeSteps(steps).map((step) => step.instructions);
}

// Capture backend step metadata so the UI can stay in sync with the engine
function transformBackendSteps(steps: BackendRecipePayload['steps'] | undefined): BackendRecipeStep[] {
  return normalizeSteps(steps).map((step) => ({
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
    /*
     * Forward the optional richer fields (multi-timer list + video clip)
     * untouched. When absent, the cook overlay falls back to the legacy
     * single-`duration` path so today's recipes don't regress.
     */
    timers: step.timers,
    clip: step.clip,
  }));
}

/** Title Case by word for slug or API labels (e.g. pasta -> Pasta, chicken-breast -> Chicken Breast). */
export function formatCategoryLabel(raw: string): string {
  return raw
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function extractCategory(
  title: string | undefined | null,
  ingredients?: BackendRecipePayload['ingredients'],
): string {
  if (title == null || typeof title !== 'string') {
    return 'Main Course';
  }
  const ingPart =
    ingredients && Array.isArray(ingredients)
      ? ingredients.map((i) => i.name).join(' ')
      : '';
  const lower = [title, ingPart].join(' ').toLowerCase();
  
  // Desserts & Sweets
  if (
    lower.includes('brownie') ||
    lower.includes('cookie') ||
    lower.includes('cake') ||
    lower.includes('pie') && (lower.includes('apple') || lower.includes('lemon') || lower.includes('cherry') || lower.includes('pumpkin')) ||
    lower.includes('tart') ||
    lower.includes('tiramisu') ||
    lower.includes('crème brûlée') ||
    lower.includes('creme brulee') ||
    lower.includes('pudding') ||
    lower.includes('ice cream') ||
    lower.includes('cheesecake')
  ) {
    return 'Desserts';
  }
  
  // Breads & Baked Goods
  if (
    lower.includes('bread') ||
    lower.includes('toast') && !lower.includes('french toast') ||
    lower.includes('garlic bread') ||
    lower.includes('focaccia') ||
    lower.includes('bagel')
  ) {
    return 'Breads';
  }
  
  // Breakfast
  if (
    lower.includes('breakfast') ||
    lower.includes('pancake') ||
    lower.includes('french toast') ||
    lower.includes('eggs benedict') ||
    lower.includes('omelette') ||
    lower.includes('waffle')
  ) {
    return 'Breakfast';
  }
  
  // Salads
  if (lower.includes('salad')) {
    return 'Salads';
  }
  
  // Soups
  if (lower.includes('soup') || lower.includes('stew') || lower.includes('chowder')) {
    return 'Soups';
  }
  
  // Pasta & Italian
  if (
    lower.includes('pasta') ||
    lower.includes('spaghetti') ||
    lower.includes('carbonara') ||
    lower.includes('lasagna') ||
    lower.includes('risotto') ||
    lower.includes('gnocchi') ||
    lower.includes('pesto') ||
    lower.includes('marinara') ||
    lower.includes('pizza') ||
    lower.includes('meatball')
  ) {
    return 'Italian';
  }
  
  // Asian
  if (
    lower.includes('thai') ||
    lower.includes('pad thai') ||
    lower.includes('curry') && !lower.includes('chicken curry') ||
    lower.includes('ramen') ||
    lower.includes('sushi') ||
    lower.includes('stir fry') ||
    lower.includes('stir-fry') ||
    lower.includes('noodle') && !lower.includes('chicken noodle soup') ||
    lower.includes('dim sum') ||
    lower.includes('teriyaki')
  ) {
    return 'Asian';
  }
  
  // Mexican
  if (
    lower.includes('taco') ||
    lower.includes('burrito') ||
    lower.includes('fajita') ||
    lower.includes('enchilada') ||
    lower.includes('quesadilla') ||
    lower.includes('guacamole')
  ) {
    return 'Mexican';
  }
  
  // Seafood
  if (
    lower.includes('fish') ||
    lower.includes('salmon') ||
    lower.includes('shrimp') ||
    lower.includes('lobster') ||
    lower.includes('mussel') ||
    lower.includes('scampi') ||
    lower.includes('seafood') ||
    lower.includes('crab') ||
    lower.includes('tuna')
  ) {
    return 'Seafood';
  }
  
  // Grilled & BBQ
  if (
    lower.includes('kebab') ||
    lower.includes('bbq') ||
    lower.includes('barbecue') ||
    lower.includes('grilled') ||
    lower.includes('wings')
  ) {
    return 'Grilled';
  }
  
  // Burgers & Sandwiches
  if (
    lower.includes('burger') ||
    lower.includes('sandwich') ||
    lower.includes('wrap')
  ) {
    return 'Sandwiches';
  }
  
  // Chicken dishes
  if (lower.includes('chicken')) {
    return 'Poultry';
  }
  
  // Beef dishes
  if (
    lower.includes('beef') ||
    lower.includes('steak') ||
    lower.includes('wellington')
  ) {
    return 'Beef';
  }
  
  // Pork dishes
  if (lower.includes('pork') || lower.includes('bacon') || lower.includes('ham')) {
    return 'Pork';
  }
  
  // Vegetarian indicator
  if (
    lower.includes('vegetable') ||
    lower.includes('veggie') ||
    lower.includes('quinoa') ||
    lower.includes('avocado toast')
  ) {
    return 'Vegetarian';
  }
  
  // Comfort Food / Main Course (default for savory pies, etc.)
  if (
    lower.includes('pie') || // Shepherd's pie, fish pie
    lower.includes('moussaka') ||
    lower.includes('roast')
  ) {
    return 'Comfort Food';
  }
  
  // Default
  return 'Main Course';
}

/**
 * Browse/filter category for catalog cards. Prefers title/description heuristics
 * (Salads, Soups, Italian, …) over Supabase metadata slugs (chicken, eggs, …).
 * NEU-629 summary catalog only had metadata — filters looked like ingredients.
 */
export function resolveBrowseCategory(
  title: string | undefined,
  description: string | undefined,
  apiCategory?: string | null,
): string {
  const hintIngredients = description?.trim()
    ? [{ name: description.trim() }]
    : undefined;
  const fromHeuristic = extractCategory(title, hintIngredients);
  if (fromHeuristic !== 'Main Course') {
    return fromHeuristic;
  }
  if (apiCategory?.trim()) {
    return formatCategoryLabel(apiCategory.trim());
  }
  return fromHeuristic;
}

// Transform jamie-oliver-ai recipe to joui format
export function transformRecipe(
  jamieRecipe: BackendRecipePayload,
  index: number,
  options?: { apiCategory?: string | null }
): Recipe {
  const recipe = jamieRecipe.recipe;
  const steps = normalizeSteps(jamieRecipe.steps);
  const backendSteps = transformBackendSteps(steps);
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

  const rawExplicit =
    (options?.apiCategory != null && String(options.apiCategory).trim() !== ''
      ? String(options.apiCategory).trim()
      : null) ??
    recipe.categories?.[0]?.trim() ??
    null;
  const category = rawExplicit
    ? formatCategoryLabel(rawExplicit)
    : extractCategory(recipe.title, jamieRecipe.ingredients);
  const normalizedPayload: BackendRecipePayload = {
    ...jamieRecipe,
    steps,
  };

  return {
    id: index + 1,
    backendId: recipe.id,
    title: recipe.title ?? 'Recipe',
    description: recipe.description || steps[0]?.descr || recipe.title || 'Recipe',
    category,
    difficulty: mapDifficulty(recipe.difficulty),
    time: parseDuration(recipe.estimated_total),
    servings: recipe.servings,
    image: getImagePath(recipe.id ?? 'recipe'),
    ingredients: transformIngredients(jamieRecipe.ingredients),
    instructions: transformInstructions(steps),
    tips: jamieRecipe.notes?.text 
      ? jamieRecipe.notes.text.split('\n').filter(line => line.trim().length > 0)
      : [],
    utensils: transformUtensils(jamieRecipe.utensils),
    backendSteps,
    rawRecipePayload: normalizedPayload,
  };
}

/** Card-level recipe from GET /api/v1/recipes (no full_recipe). */
export function transformApiSummary(apiRecipe: ApiRecipeListItem, index: number): Recipe {
  const recipeId = apiRecipe.recipe_id?.trim() || `recipe-${index + 1}`;
  const title = apiRecipe.title?.trim() || slugToTitle(recipeId);
  const description = apiRecipe.description?.trim() || '';
  const category = resolveBrowseCategory(title, description, apiRecipe.category);

  return {
    id: index + 1,
    backendId: recipeId,
    title,
    description,
    category,
    difficulty: mapDifficulty(apiRecipe.complexity),
    time: '30 mins',
    servings: apiRecipe.servings ?? 4,
    image: apiRecipe.image_url?.trim() || getImagePath(recipeId),
    ingredients: [],
    instructions: [],
    tips: [],
  };
}

export function isRecipeHydrated(recipe: Recipe): boolean {
  return Boolean(recipe.rawRecipePayload && (recipe.backendSteps?.length || recipe.instructions.length > 0));
}

export function upsertRecipeInCache(recipe: Recipe): void {
  if (!cachedRecipes?.length) {
    return;
  }
  const key = recipe.backendId || String(recipe.id);
  const idx = cachedRecipes.findIndex(
    (entry) => (entry.backendId || String(entry.id)) === key,
  );
  if (idx < 0) {
    return;
  }
  cachedRecipes[idx] = {
    ...cachedRecipes[idx],
    ...recipe,
    id: cachedRecipes[idx].id,
  };
}

/** Fetch full recipe JSON when the catalog entry is summary-only. */
export async function hydrateRecipe(recipe: Recipe): Promise<Recipe> {
  if (isRecipeHydrated(recipe)) {
    return recipe;
  }

  const slug = recipe.backendId?.trim();
  if (!slug) {
    return recipe;
  }

  const full = await loadRecipeBySlug(slug);
  if (!full) {
    return recipe;
  }

  const merged: Recipe = {
    ...recipe,
    ...full,
    id: recipe.id,
    backendId: slug,
  };
  upsertRecipeInCache(merged);
  return merged;
}

// Load recipes from Supabase API with fallback to local files
// API endpoint: /api/v1/recipes (backend-search service)
// Local fallback: public/recipes-json/ (development mode)

let cachedRecipes: Recipe[] | null = null;

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
    if (!API_BASE_URL?.trim()) {
      throw new Error('VITE_API_BASE_URL is missing; cannot load recipes from API in this environment.');
    }
    const url = `${API_BASE_URL}/api/v1/recipes?limit=500`;
    console.log(`[RecipeLoader] Fetching catalog from API: ${url}`);
    
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
    for (const apiRecipe of data.recipes as ApiRecipeListItem[]) {
      if (apiRecipe.full_recipe && 'recipe' in apiRecipe.full_recipe) {
        const apiCat =
          typeof apiRecipe.category === 'string' && apiRecipe.category.trim() !== ''
            ? apiRecipe.category
            : null;
        recipes.push(
          transformRecipe(apiRecipe.full_recipe as BackendRecipePayload, index, {
            apiCategory: apiCat,
          }),
        );
        index++;
        continue;
      }

      if (apiRecipe.recipe_id) {
        recipes.push(transformApiSummary(apiRecipe, index));
        index++;
        continue;
      }

      console.warn('[RecipeLoader] Skipping recipe without recipe_id:', apiRecipe.title);
      skipped++;
    }

    console.log(`[RecipeLoader] ✅ Loaded ${recipes.length} catalog recipes from API (skipped: ${skipped})`);
    
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
 * Lightweight local catalog — list file only (hydrate on modal/cook).
 */
async function loadRecipesFromLocalSummaries(): Promise<Recipe[]> {
  try {
    const listResponse = await fetch('/recipes-json/recipes-list.json');
    if (!listResponse.ok) {
      console.error('Failed to load recipes list:', listResponse.statusText);
      return [];
    }

    const recipeNames: string[] = await listResponse.json();
    const recipes = recipeNames.map((name, index) =>
      transformApiSummary(
        {
          recipe_id: name,
          title: slugToTitle(name),
        },
        index,
      ),
    );

    console.log(`[RecipeLoader] Loaded ${recipes.length} local catalog summaries`);
    return recipes;
  } catch (e) {
    console.error('Failed to load local recipe summaries:', e);
    return [];
  }
}

/**
 * Full local JSON files (dev fidelity when editing recipe payloads).
 */
async function loadRecipesFromLocalFull(): Promise<Recipe[]> {
  const recipes: Recipe[] = [];
  let index = 0;

  try {
    const listResponse = await fetch('/recipes-json/recipes-list.json');
    if (!listResponse.ok) {
      console.error('Failed to load recipes list:', listResponse.statusText);
      return [];
    }

    const recipeNames: string[] = await listResponse.json();

    const loadedRecipes = await Promise.all(
      recipeNames.map(async (name) => {
        try {
          const response = await fetch(`/recipes-json/${name}.json`);
          if (response.ok) {
            return (await response.json()) as BackendRecipePayload;
          }
          console.warn(`Failed to load recipe ${name}: ${response.statusText}`);
          return null;
        } catch (e) {
          console.warn(`Failed to load recipe ${name}:`, e);
          return null;
        }
      }),
    );

    for (const recipe of loadedRecipes) {
      if (recipe && 'recipe' in recipe) {
        recipes.push(transformRecipe(recipe as BackendRecipePayload, index));
        index++;
      }
    }

    console.log(`[RecipeLoader] Loaded ${recipes.length} recipes from local files (dev full)`);
    return recipes;
  } catch (e) {
    console.error('Failed to load recipes from local files:', e);
    return [];
  }
}

async function loadRecipesFromLocal(): Promise<Recipe[]> {
  if (import.meta.env.DEV) {
    return loadRecipesFromLocalFull();
  }
  return loadRecipesFromLocalSummaries();
}

export async function loadRecipes(): Promise<Recipe[]> {
  // Return cached recipes if available
  if (cachedRecipes) {
    return cachedRecipes;
  }

  let recipes: Recipe[] = [];

  // Try API first. Local JSON fallback only in dev or when explicitly allowed — otherwise prod
  // would silently show ~56 bundled recipes when the API URL is misconfigured.
  const allowLocalFallback =
    import.meta.env.DEV || import.meta.env.VITE_ALLOW_LOCAL_RECIPES === 'true';

  try {
    recipes = await loadRecipesFromAPI();
  } catch (e) {
    if (allowLocalFallback) {
      console.warn('[RecipeLoader] API failed, using local recipes-json (dev / VITE_ALLOW_LOCAL_RECIPES):', e);
      recipes = await loadRecipesFromLocal();
    } else {
      console.error('[RecipeLoader] API load failed and local fallback disabled in production:', e);
      recipes = [];
    }
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
