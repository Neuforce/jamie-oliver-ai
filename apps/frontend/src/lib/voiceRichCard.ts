import type { MealPlanData, RecipeDetailData, ShoppingListData } from './api';
import type { Recipe } from '../data/recipes';
import type { ProcessCardState } from '../components/ProcessCardTypes';
import type { FeaturedPayload } from '../components/ProcessCardTypes';
import { selectFeatured } from '../components/ProcessCard';
import { type ToolInvocationPart } from './chatStream';

export type VoiceRichCardKind =
  | 'recipes'
  | 'meal_plan'
  | 'shopping_list'
  | 'recipe_detail'
  | 'process';

export interface VoiceRichCardPreviewData {
  kind: VoiceRichCardKind;
  title: string;
  emoji: string;
  chips: string[];
  imageUrl?: string;
  subtitle?: string;
}

/** Minimal Jamie message shape for voice rich-card detection. */
export type VoiceRichMessageSource = Readonly<{
  type: 'user' | 'jamie';
  toolParts?: ReadonlyArray<ToolInvocationPart> | null;
  recipes?: ReadonlyArray<Recipe> | null;
  mealPlan?: MealPlanData | null;
  shoppingList?: ShoppingListData | null;
  recipeDetail?: RecipeDetailData | null;
  process?: ProcessCardState | null;
}>;

export interface VoiceFeaturedSelection {
  featured: FeaturedPayload;
  /** Full recipe list when the featured surface is a carousel. */
  recipes?: ReadonlyArray<Recipe>;
}

function collectFieldsFromToolParts(parts: ReadonlyArray<ToolInvocationPart>): {
  recipes?: ReadonlyArray<Recipe>;
  mealPlan?: MealPlanData;
  shoppingList?: ShoppingListData;
  recipeDetail?: RecipeDetailData;
} {
  let recipes: ReadonlyArray<Recipe> | undefined;
  let mealPlan: MealPlanData | undefined;
  let shoppingList: ShoppingListData | undefined;
  let recipeDetail: RecipeDetailData | undefined;

  for (const part of parts) {
    if (part.recipeDetail) recipeDetail = part.recipeDetail;
    if (part.mealPlan) mealPlan = part.mealPlan;
    if (part.shoppingList) shoppingList = part.shoppingList;
    if (part.recipes?.length) recipes = part.recipes;
  }

  return { recipes, mealPlan, shoppingList, recipeDetail };
}

function mergedPayloadFields(message: VoiceRichMessageSource): {
  recipes?: ReadonlyArray<Recipe>;
  mealPlan?: MealPlanData;
  shoppingList?: ShoppingListData;
  recipeDetail?: RecipeDetailData;
} {
  if (message.toolParts?.length) {
    return collectFieldsFromToolParts(message.toolParts);
  }
  return {
    recipes: message.recipes ?? undefined,
    mealPlan: message.mealPlan ?? undefined,
    shoppingList: message.shoppingList ?? undefined,
    recipeDetail: message.recipeDetail ?? undefined,
  };
}

/**
 * Single featured rich surface for voice — same priority as chat `selectFeatured`:
 * recipeDetail → mealPlan → shoppingList → recipes.
 */
export function resolveVoiceFeatured(
  message: VoiceRichMessageSource,
): VoiceFeaturedSelection | null {
  if (message.type !== 'jamie') {
    return null;
  }

  if (message.process?.featured) {
    const featured = message.process.featured;
    if (featured.kind === 'recipe') {
      return {
        featured,
        recipes: message.recipes?.length ? message.recipes : [featured.recipe],
      };
    }
    return { featured };
  }

  const fields = mergedPayloadFields(message);
  const featured = selectFeatured({
    tool: 'search_recipes',
    recipeDetail: fields.recipeDetail,
    mealPlan: fields.mealPlan,
    shoppingList: fields.shoppingList,
    recipes: fields.recipes ? [...fields.recipes] : undefined,
  });

  if (!featured) {
    return null;
  }

  if (featured.kind === 'recipe') {
    return {
      featured,
      recipes: fields.recipes?.length ? fields.recipes : [featured.recipe],
    };
  }

  return { featured };
}

const SUBTITLE_MAX_LEN = 100;

function truncateSubtitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= SUBTITLE_MAX_LEN) {
    return trimmed;
  }
  return `${trimmed.slice(0, SUBTITLE_MAX_LEN - 1).trim()}…`;
}

function subtitleFromRecipeTitles(recipes: ReadonlyArray<Recipe>): string | undefined {
  if (recipes.length === 0) {
    return undefined;
  }
  if (recipes.length === 1) {
    const description = recipes[0].description?.trim();
    return description ? truncateSubtitle(description) : undefined;
  }
  const names = recipes.slice(0, 3).map((recipe) => recipe.title);
  const joined = names.join(', ');
  const suffix = recipes.length > 3 ? '…' : '';
  return truncateSubtitle(`${joined}${suffix}`);
}

function subtitleFromMealPlan(mealPlan: MealPlanData): string | undefined {
  const courseLabels: string[] = [];
  const courses = mealPlan.courses ?? {};
  if (courses.starter?.length) courseLabels.push('Starter');
  if (courses.main?.length) courseLabels.push('Main');
  if (courses.dessert?.length) courseLabels.push('Dessert');
  if (courses.side?.length) courseLabels.push('Side');
  if (courses.salad?.length) courseLabels.push('Salad');
  if (courseLabels.length > 0) {
    return courseLabels.join(', ');
  }
  const courseCount = Object.values(courses).reduce(
    (total, course) => total + (course?.length ?? 0),
    0,
  );
  return courseCount > 0 ? `${courseCount} dishes planned` : undefined;
}

function subtitleFromShoppingList(shoppingList: ShoppingListData): string | undefined {
  const items = shoppingList.shopping_list ?? [];
  if (items.length === 0) {
    return undefined;
  }
  const names = items.slice(0, 3).map((entry) => entry.item);
  const suffix = items.length > 3 ? '…' : '';
  return truncateSubtitle(`${names.join(', ')}${suffix}`);
}

function chipsFromRecipe(recipe: Recipe): string[] {
  const chips: string[] = [];
  if (recipe.time) chips.push(recipe.time);
  if (recipe.difficulty) chips.push(recipe.difficulty);
  if (recipe.servings !== undefined) {
    chips.push(`${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}`);
  }
  return chips.slice(0, 3);
}

function chipsFromRecipeDetail(detail: RecipeDetailData): string[] {
  const chips: string[] = [];
  if (detail.estimated_time) chips.push(detail.estimated_time);
  if (detail.difficulty) chips.push(detail.difficulty);
  if (detail.ingredient_count) chips.push(`${detail.ingredient_count} ingredients`);
  return chips.slice(0, 3);
}

function previewFromFeaturedSelection(
  selection: VoiceFeaturedSelection,
): VoiceRichCardPreviewData {
  const { featured, recipes } = selection;

  switch (featured.kind) {
    case 'recipe': {
      const list = recipes ?? [featured.recipe];
      const first = list[0];
      const count = list.length;
      return {
        kind: 'recipes',
        title: count === 1 ? first.title : `${count} recipes`,
        emoji: '🥘',
        chips: chipsFromRecipe(first),
        imageUrl: first.image,
        subtitle: subtitleFromRecipeTitles(list),
      };
    }
    case 'meal_plan': {
      const mp = featured.mealPlan;
      const courseCount = Object.values(mp.courses ?? {}).reduce(
        (total, course) => total + (course?.length ?? 0),
        0,
      );
      const chips: string[] = [];
      if (mp.occasion) chips.push(mp.occasion);
      if (mp.serves) chips.push(`${mp.serves} servings`);
      return {
        kind: 'meal_plan',
        title: mp.occasion ? `${mp.occasion} meal plan` : 'Meal plan',
        emoji: '📅',
        chips: chips.length > 0 ? chips.slice(0, 3) : courseCount > 0 ? [`${courseCount} dishes`] : [],
        subtitle: subtitleFromMealPlan(mp),
      };
    }
    case 'shopping_list': {
      const count = featured.shoppingList.total_items
        ?? featured.shoppingList.shopping_list?.length
        ?? 0;
      return {
        kind: 'shopping_list',
        title: 'Shopping list',
        emoji: '🛒',
        chips: count > 0 ? [`${count} items`] : [],
        subtitle: subtitleFromShoppingList(featured.shoppingList),
      };
    }
    case 'recipe_detail': {
      const description = featured.recipe.description?.trim();
      return {
        kind: 'recipe_detail',
        title: featured.recipe.title,
        emoji: '🍳',
        chips: chipsFromRecipeDetail(featured.recipe),
        subtitle: description ? truncateSubtitle(description) : undefined,
      };
    }
    default:
      return {
        kind: 'process',
        title: "Jamie's suggestion",
        emoji: '✨',
        chips: [],
      };
  }
}

export type VoiceStackRole = 'top' | 'middle' | 'back';

export function hasVoiceRecipePayload(message: VoiceRichMessageSource): boolean {
  return Boolean(
    (message.recipes && message.recipes.length > 0)
    || (message.recipeDetail?.recipe_id && message.recipeDetail.title),
  );
}

/**
 * Whether voice mode should render the compact rich-card preview instead of
 * the full featured surface.
 *
 * - Top card: compact when collapsed (including recipes); full when expanded.
 * - Middle/back: compact for non-recipe rich cards only (recipes stay full-size).
 */
export function shouldShowVoiceCompactPreview(
  message: VoiceRichMessageSource,
  voiceRole: VoiceStackRole | undefined,
  voiceExpanded: boolean,
): boolean {
  if (!isVoiceExpandableMessage(message) || !getVoiceRichCardPreview(message)) {
    return false;
  }
  if (voiceRole === 'top') {
    return !voiceExpanded;
  }
  return !hasVoiceRecipePayload(message);
}

export function isVoiceExpandableMessage(message: VoiceRichMessageSource): boolean {
  return resolveVoiceFeatured(message) !== null;
}

export function getVoiceRichCardPreview(
  message: VoiceRichMessageSource,
): VoiceRichCardPreviewData | null {
  const selection = resolveVoiceFeatured(message);
  if (!selection) {
    return null;
  }
  return previewFromFeaturedSelection(selection);
}
