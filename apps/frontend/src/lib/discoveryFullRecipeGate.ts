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
  content?: string;
  recipeDetail?: RecipeDetailData | null;
  recipes?: ReadonlyArray<CarouselRecipeRef> | null;
}>;

export type RecipeOpenIntentOptions = Readonly<{
  /** When the recipe sheet is already open in the app. */
  focusedBackendId?: string | null;
}>;

const FULL_RECIPE_OFFER =
  /\bfull\s+recipe\b|\brecipe\s+(view|screen|page)\b|\btake\s+(you|me)\s+there\b|\bopen\s+the\s+full\b|\bwould you like to go\b|\bgo\s+to\s+the\s+full\b/iu;

/** Jamie's last turn offered navigating to the full recipe sheet (not just "fancy trying it?"). */
export function jamieRecentlyOfferedFullRecipeView(messages: MessageRecipeContext): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'user') return false;
    if (msg.type === 'jamie' && msg.content?.trim()) {
      return FULL_RECIPE_OFFER.test(msg.content);
    }
  }
  return false;
}

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

/**
 * Prefer the newest search carousel (single result) over older recipe_detail tiles
 * from prior sessions still in localStorage — fixes wrong-recipe opens on bare "yes".
 */
export function getLatestSingleRecipeFromConversation(
  messages: MessageRecipeContext,
): RecipeDetailData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'jamie') continue;
    const list = msg.recipes?.filter((r) => Boolean(r.backendId?.trim() && r.title?.trim())) ?? [];
    if (list.length === 1) {
      return carouselRecipeToDetail(list[0]);
    }
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

function recipeDetailFromBackendId(
  messages: MessageRecipeContext,
  backendId: string,
): RecipeDetailData | null {
  const id = backendId.trim();
  if (!id) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'jamie') continue;
    if (msg.recipeDetail?.recipe_id === id && msg.recipeDetail.title) {
      return msg.recipeDetail;
    }
    for (const ref of msg.recipes ?? []) {
      if (ref.backendId?.trim() === id && ref.title?.trim()) {
        return carouselRecipeToDetail(ref);
      }
    }
  }

  return {
    recipe_id: id,
    title: id.replace(/-/g, ' '),
    description: '',
    ingredients: [],
    steps: [],
  };
}

/** Strip "let's see the …" / "show me the …" so title matching sees the dish name. */
function utteranceDishHint(userUtterance: string): string {
  let hint = normalizeForMatch(userUtterance);
  const prefixes = [
    /^let s see (the |a )?/,
    /^let me see (the |a )?/,
    /^show me (the |a )?/,
    /^i want to see (the |a )?/,
    /^i d like to see (the |a )?/,
    /^can (i|we) see (the |a )?/,
    /^open (the |a )?/,
    /^view (the |a )?/,
    /^take me to (the |a )?/,
  ];
  for (const pattern of prefixes) {
    hint = hint.replace(pattern, '');
  }
  return hint.trim();
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
  const dishHint = utteranceDishHint(userUtterance);
  let best: { ref: CarouselRecipeRef; score: number } | null = null;
  for (const ref of list) {
    const score = Math.max(
      titleMatchScore(u, ref.title),
      dishHint ? titleMatchScore(dishHint, ref.title) : 0,
    );
    if (!best || score > best.score) best = { ref, score };
  }
  if (best && best.score >= 0.45) return carouselRecipeToDetail(best.ref);

  const genericOpen =
    /\b(open|show)\s+(one|it|that|this|them)\b|\bopen\s+up\b|\blet\s+me\s+(see|open)\s+it\b/iu.test(userUtterance.trim());
  if (genericOpen && list[0]) return carouselRecipeToDetail(list[0]);

  return null;
}

function findCarouselMatchInRecentJamieTurns(
  messages: MessageRecipeContext,
  userUtterance: string,
): RecipeDetailData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'jamie') continue;
    const picked = pickCarouselRecipeForOpen(msg.recipes, userUtterance);
    if (picked) return picked;
  }
  return null;
}

/**
 * Voice/text: user names a dish from the carousel ("let's see the fish tacos")
 * without saying the word "recipe".
 */
export function userRequestsSpecificRecipeOpen(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 140) return false;

  const negative =
    /\b(no|nope|not\s+now|not\s+yet|nothing|later|stop|different\s+recipe|another\s+one|don't|dont)\b/i;
  if (negative.test(t)) return false;

  return (
    /\b(let'?s|let me)\s+see\b/i.test(t) ||
    /\bshow\s+me\b/i.test(t) ||
    /\b(i\s+)?want\s+to\s+see\b/i.test(t) ||
    /\b(can\s+(i|we)|could\s+(i|we))\s+see\b/i.test(t) ||
    /\b(open|view)\s+(the\s+)?/i.test(t) ||
    /\btake\s+me\s+to\b/i.test(t)
  );
}

/** True when we should open RecipeModal from a final voice transcript (client-side). */
export function shouldOpenRecipeFromVoiceUtterance(
  text: string,
  messages: MessageRecipeContext,
): boolean {
  if (userRequestsSpecificRecipeOpen(text)) return true;
  return userAffirmsGoToFullRecipe(text, messages);
}

/**
 * Resolve which recipe to open. Carousel match wins when the user names a dish;
 * short affirmations ("yes", "open it") use the latest carousel / detail, not stale history.
 */
export function getRecipeDetailForOpenIntent(
  messages: MessageRecipeContext,
  userUtterance: string,
  options?: RecipeOpenIntentOptions,
): RecipeDetailData | null {
  const u = userUtterance.trim();
  if (!u) return null;

  const focusedId = options?.focusedBackendId?.trim();
  if (focusedId && userExplicitlyRequestsFullRecipe(u)) {
    return recipeDetailFromBackendId(messages, focusedId);
  }

  const carouselMatch = findCarouselMatchInRecentJamieTurns(messages, u);

  if (userRequestsSpecificRecipeOpen(u) && carouselMatch) {
    return carouselMatch;
  }

  if (userAffirmsGoToFullRecipe(u, messages)) {
    return (
      carouselMatch
      ?? getLatestSingleRecipeFromConversation(messages)
      ?? getFocusedRecipeDetail(messages)
    );
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

/** Explicit navigation to the full recipe sheet (always opens when resolvable). */
export function userExplicitlyRequestsFullRecipe(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t.length || t.length > 220) return false;

  const negative =
    /\b(no|nope|not\s+now|not\s+yet|nothing|later|stop|different\s+recipe|another\s+one|nothing\s+else|don't|dont)\b/;
  if (negative.test(t)) return false;

  return (
    /\bfull\s+recipe\b|\brecipe\s+page\b|\brecipe\s+screen\b|receta\s+completa|ll[eé]vame\b|ll[eé]va\s+a\s+(la\s+)?receta|mostr[aá]r?me\b|quiero\s+ver(\s+la)?\s+receta\b|\btake\s+me\b|\b(open|show)\s+(me\s+)?(the\s+)?recipe\b|\bopen\s+(it|that|one|this|them)\b|\bshow\s+(me\s+)?(it|that|one|this)\b|\bi\s*(?:want|would like|'?d like)\s+to\s+(open|see)(?:\s+(the|a|that))?\s*(?:recipe)?\b|\b(let\s+me\s+)?(see|view)\s+(the\s+)?recipe\b|\bplease\s+open\b/iu.test(
      t,
    )
  );
}

/** Short "yes" only counts when Jamie just offered the full recipe sheet — not "fancy trying it?". */
export function userAffirmsGoToFullRecipe(
  text: string,
  messages: MessageRecipeContext,
): boolean {
  if (userExplicitlyRequestsFullRecipe(text)) return true;

  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t.length || t.length > 220) return false;

  const negative =
    /\b(no|nope|not\s+now|not\s+yet|nothing|later|stop|different\s+recipe|another\s+one|nothing\s+else|don't|dont)\b/;
  if (negative.test(t)) return false;

  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (t.length > 64 || wordCount > 12) return false;

  const normalized = t.replace(/,/g, '').trim();

  const shortAffirm =
    /^(yes|yeah|yep|yup|sure|okay|ok|please|absolutely|certainly|go\s+ahead)([.!?]*)?$|^(yes\s+please|yeah\s+sure)$/i.test(
      normalized,
    );

  const esAffirm =
    /^(si|sí)(\s+[a-záéíóúñ.!?]{0,32})?$|^(vale|claro|dale|perfecto)([.!?]*)?$|^por\s+favor([.!?]*)?$/iu.test(
      normalized,
    );

  if (!shortAffirm && !esAffirm) return false;

  return jamieRecentlyOfferedFullRecipeView(messages);
}
