/**
 * Types for the process card — shared between the component and the
 * orchestration helper that turns streaming events into card state.
 */

import type {
  MealPlanData,
  RecipeDetailData,
  ShoppingListData,
} from '../lib/api';
import type { Recipe } from '../data/recipes';

/**
 * Tools your chat agent can call. Keep in sync with the
 * `event.type === 'tool_call'` names your backend emits.
 */
export type ToolName =
  | 'search_recipes'
  | 'suggest_recipes_for_mood'
  | 'get_recipe_details'
  | 'plan_meal'
  | 'create_shopping_list';

export type ProcessStepIcon =
  | 'search'
  | 'steps'
  | 'chef'
  | 'recipe'
  | 'plan'
  | 'list';

/**
 * Display metadata per tool. Unlike the previous revision, we do NOT
 * pre-bake a multi-step rubric here — the process card renders the real
 * sequence of tool calls the agent emitted. This map only supplies the
 * human copy + icon for a single step derived from one tool invocation.
 */
export interface ToolStepDisplay {
  /** Label shown on the step row while executing. */
  executingLabel: string;
  /** Label shown once the step completes. */
  doneLabel: string;
  /** Icon used on the step row. */
  icon: ProcessStepIcon;
}

export const TOOL_STEP_DISPLAY: Record<ToolName, ToolStepDisplay> = {
  search_recipes: {
    executingLabel: 'Searching recipes',
    doneLabel: 'Searched recipes',
    icon: 'search',
  },
  suggest_recipes_for_mood: {
    executingLabel: 'Matching recipes to your mood',
    doneLabel: 'Matched recipes to your mood',
    icon: 'search',
  },
  get_recipe_details: {
    executingLabel: 'Getting recipe details',
    doneLabel: 'Got recipe details',
    icon: 'recipe',
  },
  plan_meal: {
    executingLabel: 'Planning your meal',
    doneLabel: 'Built meal plan',
    icon: 'plan',
  },
  create_shopping_list: {
    executingLabel: 'Building shopping list',
    doneLabel: 'Built shopping list',
    icon: 'list',
  },
};

export type StepStatus = 'executing' | 'done' | 'error';

/**
 * One step the agent actually took, derived from a real `tool_call`
 * streaming event. Appended in order of arrival.
 */
export interface ProcessStep {
  /** Stable id; `tool_call_id` from the backend when available, else a client-generated one. */
  id: string;
  tool: ToolName;
  label: string;
  icon: ProcessStepIcon;
  status: StepStatus;
}

/**
 * The full state of a process card at a moment in time. ChatView builds
 * this up across streaming events and passes it to ProcessCard.
 *
 *   - `tool` records the primary tool used by `selectFeatured` to pick the
 *     featured payload; it stays as the first tool the agent called (for
 *     that turn) so payload routing is deterministic.
 *   - `status` is the overall status of the turn: executing while any
 *     step is still in flight; done when the agent finished; error if
 *     something broke.
 *   - `steps` is the actual ordered list the user sees — one entry per
 *     real tool call. No placeholder rubric.
 */
export interface ProcessCardState {
  tool: ToolName;
  status: StepStatus;
  quote?: string;
  featured?: FeaturedPayload;
  steps: ProcessStep[];
}

/**
 * Discriminated union of what the tool returned. Only one of these is
 * ever set on a given card; the "featured" pick depends on the tool.
 */
export type FeaturedPayload =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'recipe_detail'; recipe: RecipeDetailData }
  | { kind: 'meal_plan'; mealPlan: MealPlanData }
  | { kind: 'shopping_list'; shoppingList: ShoppingListData };
