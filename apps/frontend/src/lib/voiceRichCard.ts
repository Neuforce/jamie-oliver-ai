import type { MealPlanData, RecipeDetailData, ShoppingListData } from './api';
import type { Recipe } from '../data/recipes';
import type { ProcessCardState } from '../components/ProcessCardTypes';

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
}

/** Minimal Jamie message shape for voice rich-card detection. */
export type VoiceRichMessageSource = Readonly<{
  type: 'user' | 'jamie';
  recipes?: ReadonlyArray<Recipe> | null;
  mealPlan?: MealPlanData | null;
  shoppingList?: ShoppingListData | null;
  recipeDetail?: RecipeDetailData | null;
  process?: ProcessCardState | null;
}>;

export function isVoiceExpandableMessage(message: VoiceRichMessageSource): boolean {
  if (message.type !== 'jamie') {
    return false;
  }
  if (message.process?.featured) {
    return true;
  }
  if (message.recipes && message.recipes.length > 0) {
    return true;
  }
  if (message.mealPlan) {
    return true;
  }
  if (message.shoppingList) {
    return true;
  }
  if (message.recipeDetail?.recipe_id && message.recipeDetail.title) {
    return true;
  }
  return false;
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

export function getVoiceRichCardPreview(
  message: VoiceRichMessageSource,
): VoiceRichCardPreviewData | null {
  if (!isVoiceExpandableMessage(message)) {
    return null;
  }

  if (message.recipeDetail?.title) {
    return {
      kind: 'recipe_detail',
      title: message.recipeDetail.title,
      emoji: '🍳',
      chips: chipsFromRecipeDetail(message.recipeDetail),
    };
  }

  if (message.recipes && message.recipes.length > 0) {
    const first = message.recipes[0];
    const count = message.recipes.length;
    return {
      kind: 'recipes',
      title: count === 1 ? first.title : `${count} recipes`,
      emoji: '🥘',
      chips: chipsFromRecipe(first),
      imageUrl: first.image,
    };
  }

  if (message.mealPlan) {
    const courseCount = Object.values(message.mealPlan.courses ?? {}).reduce(
      (total, course) => total + (course?.length ?? 0),
      0,
    );
    const chips: string[] = [];
    if (message.mealPlan.occasion) chips.push(message.mealPlan.occasion);
    if (message.mealPlan.serves) {
      chips.push(`${message.mealPlan.serves} servings`);
    }
    return {
      kind: 'meal_plan',
      title: message.mealPlan.occasion
        ? `${message.mealPlan.occasion} meal plan`
        : 'Meal plan',
      emoji: '📅',
      chips: chips.length > 0 ? chips.slice(0, 3) : courseCount > 0 ? [`${courseCount} dishes`] : [],
    };
  }

  if (message.shoppingList) {
    const count = message.shoppingList.total_items
      ?? message.shoppingList.shopping_list?.length
      ?? 0;
    return {
      kind: 'shopping_list',
      title: 'Shopping list',
      emoji: '🛒',
      chips: count > 0 ? [`${count} items`] : [],
    };
  }

  if (message.process?.featured) {
    const featured = message.process.featured;
    switch (featured.kind) {
      case 'recipe': {
        const recipe = featured.recipe;
        return {
          kind: 'process',
          title: recipe.title,
          emoji: '🥘',
          chips: chipsFromRecipe(recipe),
          imageUrl: recipe.image,
        };
      }
      case 'meal_plan':
        return {
          kind: 'process',
          title: featured.mealPlan.occasion
            ? `${featured.mealPlan.occasion} meal plan`
            : 'Meal plan',
          emoji: '📅',
          chips: featured.mealPlan.serves
            ? [`${featured.mealPlan.serves} servings`]
            : [],
        };
      case 'shopping_list': {
        const itemCount = featured.shoppingList.total_items
          ?? featured.shoppingList.shopping_list?.length
          ?? 0;
        return {
          kind: 'process',
          title: 'Shopping list',
          emoji: '🛒',
          chips: itemCount > 0 ? [`${itemCount} items`] : [],
        };
      }
      case 'recipe_detail':
        return {
          kind: 'process',
          title: featured.recipe.title,
          emoji: '🍳',
          chips: chipsFromRecipeDetail(featured.recipe),
        };
      default:
        return {
          kind: 'process',
          title: 'Jamie\'s suggestion',
          emoji: '✨',
          chips: [],
        };
    }
  }

  return null;
}
