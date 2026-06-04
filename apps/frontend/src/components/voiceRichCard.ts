import type { Recipe } from '../data/recipes';
import type { MealPlanData, RecipeDetailData, ShoppingListData } from '../lib/api';
import type { FeaturedPayload } from './ProcessCardTypes';

export type VoiceRichPreviewKind =
  | 'recipes'
  | 'recipe_detail'
  | 'meal_plan'
  | 'shopping_list'
  | 'process';

export interface VoiceRichPreview {
  kind: VoiceRichPreviewKind;
  title: string;
  thumbnailUrl?: string;
  emoji?: string;
  chips: string[];
}

export interface VoiceRichMessageLike {
  type: 'user' | 'jamie';
  recipes?: Recipe[];
  mealPlan?: MealPlanData;
  shoppingList?: ShoppingListData;
  recipeDetail?: RecipeDetailData;
  process?: { featured?: FeaturedPayload };
}

export function messageHasVoiceRichCard(message: VoiceRichMessageLike): boolean {
  if (message.type !== 'jamie') return false;
  if (message.recipes && message.recipes.length > 0) return true;
  if (message.mealPlan) return true;
  if (message.shoppingList) return true;
  if (message.recipeDetail) return true;
  if (message.process?.featured) return true;
  return false;
}

function chipsFromRecipe(recipe: {
  time?: string;
  difficulty?: string;
  estimated_time?: string;
}): string[] {
  const chips: string[] = [];
  const time = 'time' in recipe ? recipe.time : recipe.estimated_time;
  if (time) chips.push(time);
  if (recipe.difficulty) chips.push(recipe.difficulty);
  return chips.slice(0, 3);
}

function previewFromFeatured(featured: FeaturedPayload): VoiceRichPreview {
  switch (featured.kind) {
    case 'recipe':
      return {
        kind: 'recipes',
        title:
          featured.recipe.title.length > 48
            ? `${featured.recipe.title.slice(0, 45)}…`
            : featured.recipe.title,
        thumbnailUrl: featured.recipe.image,
        chips: chipsFromRecipe(featured.recipe),
      };
    case 'recipe_detail':
      return {
        kind: 'recipe_detail',
        title: featured.recipe.title,
        emoji: '🍳',
        chips: chipsFromRecipe(featured.recipe),
      };
    case 'meal_plan':
      return {
        kind: 'meal_plan',
        title: featured.mealPlan.occasion || 'Meal plan',
        emoji: '📋',
        chips: [
          `${featured.mealPlan.serves} servings`,
          ...Object.keys(featured.mealPlan.courses).filter(
            (k) =>
              featured.mealPlan.courses[
                k as keyof typeof featured.mealPlan.courses
              ]?.length,
          ).slice(0, 2),
        ].slice(0, 3),
      };
    case 'shopping_list':
      return {
        kind: 'shopping_list',
        title: 'Shopping list',
        emoji: '🛒',
        chips: [`${featured.shoppingList.total_items} items`],
      };
    default:
      return { kind: 'process', title: 'Jamie', emoji: '💚', chips: [] };
  }
}

export function getVoiceRichPreview(
  message: VoiceRichMessageLike,
): VoiceRichPreview | null {
  if (!messageHasVoiceRichCard(message)) return null;

  if (message.process?.featured) {
    return previewFromFeatured(message.process.featured);
  }

  if (message.recipes && message.recipes.length > 0) {
    const first = message.recipes[0];
    const count = message.recipes.length;
    return {
      kind: 'recipes',
      title:
        count > 1
          ? `${count} recipes`
          : first.title.length > 48
            ? `${first.title.slice(0, 45)}…`
            : first.title,
      thumbnailUrl: first.image,
      chips: chipsFromRecipe(first),
    };
  }

  if (message.mealPlan) {
    const mp = message.mealPlan;
    const courseCount = Object.values(mp.courses).reduce(
      (n, arr) => n + (arr?.length ?? 0),
      0,
    );
    return {
      kind: 'meal_plan',
      title: mp.occasion || 'Meal plan',
      emoji: '📋',
      chips: [`${mp.serves} servings`, `${courseCount} dishes`].slice(0, 3),
    };
  }

  if (message.shoppingList) {
    return {
      kind: 'shopping_list',
      title: 'Shopping list',
      emoji: '🛒',
      chips: [`${message.shoppingList.total_items} items`],
    };
  }

  if (message.recipeDetail) {
    return {
      kind: 'recipe_detail',
      title: message.recipeDetail.title,
      emoji: '🍳',
      chips: chipsFromRecipe(message.recipeDetail),
    };
  }

  return null;
}
