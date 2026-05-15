import type { RecipeDetailData } from './api';
import type { BackendRecipeSummary } from '../data/recipeTransformer';

/**
 * NEU-620: Prefer opening RecipeModal after the user confirms (voice/text/tap).
 * Tracks the recipe tile from get_recipe_details (recipe_detail stream payload).
 */

export type MessageRecipeContext = ReadonlyArray<{
  type: string;
  recipeDetail?: RecipeDetailData | null;
}>;

/** Most recent Jamie turn that contains structured recipe_detail (slug-backed). */
export function getFocusedRecipeDetail(messages: MessageRecipeContext): RecipeDetailData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'jamie') continue;
    const d = msg.recipeDetail;
    if (d?.recipe_id && d.title) return d;
  }
  return null;
}

export function backendSummaryFromRecipeDetail(detail: RecipeDetailData): BackendRecipeSummary {
  return {
    recipe_id: detail.recipe_id,
    title: detail.title,
    description: detail.description || detail.title,
    servings: detail.servings,
    estimated_time: detail.estimated_time,
    difficulty: detail.difficulty,
  };
}

/** True when user clearly wants to see the full recipe sheet (RecipeModal path). Conservative for bare "yes"-style replies — requires short utterances. */
export function userAffirmsGoToFullRecipe(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t.length || t.length > 220) return false;

  const negative =
    /\b(no|nope|not\s+now|not\s+yet|nothing|later|stop|different\s+recipe|another\s+one|nothing\s+else|don't|dont)\b/;
  if (negative.test(t)) return false;

  const explicit =
    /\bfull\s+recipe\b|\brecipe\s+page\b|\brecipe\s+screen\b|receta\s+completa|ll[eé]vame\b|ll[eé]va\s+a\s+(la\s+)?receta|mostr[aá]r?me\b|quiero\s+ver(\s+la)?\s+receta\b|\btake\s+me\b|\b(open|show)\s+(me\s+)?(the\s+)?recipe\b/;
  if (explicit.test(t)) return true;

  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (t.length > 64 || wordCount > 12) return false;

  const shortAffirm =
    /^(yes|yeah|yep|yup|sure|okay|ok|please|Absolutely|certainly|go\s+ahead)([.!?]*)?$|^(yes\s+please|yeah\s+sure)$/i.test(
      t,
    );

  const esAffirm =
    /^(si|sí)(\s+[a-záéíóúñ.!?]{0,32})?$|^(vale|claro|dale|perfecto)([.!?]*)?$|^por\s+favor([.!?]*)?$/iu.test(t);

  return shortAffirm || esAffirm;
}
