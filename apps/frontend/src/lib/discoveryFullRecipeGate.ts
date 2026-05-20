import type { RecipeDetailData } from './api';
import type { BackendRecipeSummary } from '../data/recipeTransformer';

/**
 * NEU-620: Prefer opening RecipeModal after the user confirms (voice/text/tap).
 * Tracks the recipe tile from get_recipe_details (recipe_detail stream payload).
 *
 * NEU-621: When the model only emitted a search carousel (`recipes` on the message)
 * and never called `get_recipe_details`, we still resolve a slug from the carousel
 * so "open that recipe" opens the sheet instead of sending another chat turn.
 */

/** Minimal recipe ref for carousel matching (matches `Recipe` fields we need). */
export type CarouselRecipeRef = Readonly<{
  backendId?: string;
  title: string;
  description?: string;
}>;

export type MessageRecipeContext = ReadonlyArray<{
  type: string;
  recipeDetail?: RecipeDetailData | null;
  recipes?: ReadonlyArray<CarouselRecipeRef> | null;
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

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How well the utterance matches a recipe title (0–1). */
function titleMatchScore(utteranceNorm: string, title: string): number {
  const t = normalizeForMatch(title);
  if (!utteranceNorm || !t) return 0;
  if (utteranceNorm.includes(t)) return 1;
  const uWords = new Set(utteranceNorm.split(' ').filter((w) => w.length > 2));
  const tWords = t.split(' ').filter((w) => w.length > 2);
  if (tWords.length === 0) return 0;
  let hits = 0;
  for (const w of tWords) {
    if (uWords.has(w)) hits++;
  }
  return hits / tWords.length;
}

function carouselRecipeToDetail(ref: CarouselRecipeRef): RecipeDetailData | null {
  const id = ref.backendId?.trim();
  const title = ref.title?.trim();
  if (!id || !title) return null;
  return {
    recipe_id: id,
    title,
    description: (ref.description?.trim() || title),
    ingredients: [],
    steps: [],
  };
}

/**
 * Pick one carousel row when the user asks to open the full recipe.
 * Single-result carousels need no title in the utterance; multi-result needs overlap.
 */
export function pickCarouselRecipeForOpen(
  recipes: ReadonlyArray<CarouselRecipeRef> | null | undefined,
  userUtterance: string,
): RecipeDetailData | null {
  const list = recipes?.filter((r) => Boolean(r.backendId?.trim() && r.title?.trim())) ?? [];
  if (list.length === 0) return null;
  if (list.length === 1) return carouselRecipeToDetail(list[0]);

  const u = normalizeForMatch(userUtterance);
  let best: { ref: CarouselRecipeRef; score: number } | null = null;
  for (const ref of list) {
    const score = titleMatchScore(u, ref.title);
    if (!best || score > best.score) best = { ref, score };
  }
  if (best && best.score >= 0.45) return carouselRecipeToDetail(best.ref);

  const genericOpen =
    /\b(open|show)\s+(one|it|that|this|them)\b|\bopen\s+up\b|\blet\s+me\s+(see|open)\s+it\b/iu.test(userUtterance.trim());
  if (genericOpen && list[0]) return carouselRecipeToDetail(list[0]);

  return null;
}

/** Prefer recipe_detail; else most recent Jamie message with a matching carousel pick. */
export function getRecipeDetailForOpenIntent(
  messages: MessageRecipeContext,
  userUtterance: string,
): RecipeDetailData | null {
  const fromTool = getFocusedRecipeDetail(messages);
  if (fromTool) return fromTool;

  const u = userUtterance.trim();
  if (!u) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'jamie') continue;
    const picked = pickCarouselRecipeForOpen(msg.recipes, u);
    if (picked) return picked;
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
    /\bfull\s+recipe\b|\brecipe\s+page\b|\brecipe\s+screen\b|receta\s+completa|ll[eé]vame\b|ll[eé]va\s+a\s+(la\s+)?receta|mostr[aá]r?me\b|quiero\s+ver(\s+la)?\s+receta\b|\btake\s+me\b|\b(open|show)\s+(me\s+)?(the\s+)?recipe\b|\bopen\s+(it|that|one|this|them)\b|\bshow\s+(me\s+)?(it|that|one|this)\b|\bi\s*(?:want|would like|'?d like)\s+to\s+(open|see)(?:\s+(the|a|that))?\s*(?:recipe)?\b|\b(let\s+me\s+)?(see|view)\s+(the\s+)?recipe\b/iu;
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
