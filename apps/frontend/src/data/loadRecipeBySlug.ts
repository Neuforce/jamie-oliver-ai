import type { Recipe } from './recipes';
import {
  transformRecipeMatch,
  loadRecipeFromLocal,
  type JamieOliverRecipe,
} from './recipeTransformer';
import { getRecipeById } from '../lib/api';

/**
 * Resolve a recipe by stable backend slug (recipe_id / backendId).
 */
export async function loadRecipeBySlug(slug: string): Promise<Recipe | null> {
  const recipeId = slug.trim();
  if (!recipeId) {
    return null;
  }

  try {
    const response = await getRecipeById(recipeId);
    if (response.full_recipe && 'recipe' in response.full_recipe) {
      return transformRecipeMatch(
        {
          recipe_id: recipeId,
          title: response.title || recipeId,
          similarity_score: 1,
          combined_score: 1,
          file_path: response.file_path || '',
          match_explanation: '',
          matching_chunks: [],
        },
        response.full_recipe as JamieOliverRecipe,
        0,
      );
    }
  } catch {
    // Fall through to local bundle
  }

  const localRecipe = await loadRecipeFromLocal(recipeId);
  if (!localRecipe) {
    return null;
  }

  return transformRecipeMatch(
    {
      recipe_id: recipeId,
      title: localRecipe.recipe?.title || recipeId,
      similarity_score: 1,
      combined_score: 1,
      file_path: '',
      match_explanation: '',
      matching_chunks: [],
    },
    localRecipe,
    0,
  );
}
