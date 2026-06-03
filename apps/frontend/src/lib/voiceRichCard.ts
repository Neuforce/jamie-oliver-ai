import type { MealPlanData, RecipeDetailData, ShoppingListData } from './api';
import type { Recipe } from '../data/recipes';
import type { ProcessCardState } from '../components/ProcessCardTypes';
import type { FeaturedPayload } from '../components/ProcessCardTypes';

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
  recipes?: ReadonlyArray<Recipe> | null;
  mealPlan?: MealPlanData | null;
  shoppingList?: ShoppingListData | null;
  recipeDetail?: RecipeDetailData | null;
  process?: ProcessCardState | null;
}>;

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

function subtitleFromFeatured(featured: FeaturedPayload): string | undefined {
  switch (featured.kind) {
    case 'recipe':
      return subtitleFromRecipeTitles([featured.recipe]);
    case 'meal_plan':
      return subtitleFromMealPlan(featured.mealPlan);
    case 'shopping_list':
      return subtitleFromShoppingList(featured.shoppingList);
    case 'recipe_detail': {
      const description = featured.recipe.description?.trim();
      return description ? truncateSubtitle(description) : undefined;
    }
    default:
      return undefined;
  }
}

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
    const description = message.recipeDetail.description?.trim();
    return {
      kind: 'recipe_detail',
      title: message.recipeDetail.title,
      emoji: '🍳',
      chips: chipsFromRecipeDetail(message.recipeDetail),
      subtitle: description ? truncateSubtitle(description) : undefined,
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
      subtitle: subtitleFromRecipeTitles(message.recipes),
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
      subtitle: subtitleFromMealPlan(message.mealPlan),
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
      subtitle: subtitleFromShoppingList(message.shoppingList),
    };
  }

  if (message.process?.featured) {
    const featured = message.process.featured;
    const subtitle = subtitleFromFeatured(featured);
    switch (featured.kind) {
      case 'recipe': {
        const recipe = featured.recipe;
        return {
          kind: 'process',
          title: recipe.title,
          emoji: '🥘',
          chips: chipsFromRecipe(recipe),
          imageUrl: recipe.image,
          subtitle,
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
          subtitle,
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
          subtitle,
        };
      }
      case 'recipe_detail':
        return {
          kind: 'process',
          title: featured.recipe.title,
          emoji: '🍳',
          chips: chipsFromRecipeDetail(featured.recipe),
          subtitle,
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
