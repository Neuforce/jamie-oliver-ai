import React, { useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { CheckCircle2, ChefHat, ChevronDown, ClipboardList, CookingPot, Search, Soup } from 'lucide-react';
import type {
  ProcessCardState,
  ProcessStep,
  ProcessStepIcon,
  StepStatus,
  ToolName,
  FeaturedPayload,
} from './ProcessCardTypes';
import { JamieHeart } from './JamieHeart';
import './ProcessCard.css';

interface ProcessCardProps {
  state: ProcessCardState;
  /**
   * Render function for the featured payload. Kept as a prop so the
   * ProcessCard stays decoupled from your Recipe/MealPlan/ShoppingList
   * components — consumer supplies the visuals.
   */
  renderFeatured: (payload: FeaturedPayload) => ReactNode;
  /**
   * Whether the step list starts expanded. Default true — collapses to
   * false once the card has rendered once and a new card arrives.
   * (Decision owned by ChatView, not the card.)
   */
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * ProcessCard
 * -----------
 *
 * Jamie's response card when a tool was called. Replaces the standalone
 * transcript bubble for turns that involve a tool.
 *
 * Layout:
 *   ┌────────────────────────────┐
 *   │ ♡ JAMIE                    │
 *   │ Right — lasagne it is.     │   ← quote (placeholder until done)
 *   │                            │
 *   │ ▾ Searching for recipes    │   ← collapsible header
 *   │   ◌ Search for recipes     │   ← step row (spinner / ✓ / muted ◌)
 *   │                            │
 *   │ ┌──────────────────────┐   │
 *   │ │   [featured payload]  │   │   ← rendered by consumer
 *   │ └──────────────────────┘   │
 *   └────────────────────────────┘
 *
 * Streaming model:
 *   - `tool_call` fires → state.status = 'executing', no quote, no featured
 *   - tool-specific data event fires → state.featured set, step still executing
 *   - `done` fires → status = 'done', quote set
 *   - error → status = 'error', quote set to Jamie's fallback
 *
 * Accessibility:
 *   - Collapsible header is a real button with aria-expanded
 *   - Step row has aria-live for status changes during executing → done
 */
export function ProcessCard({
  state,
  renderFeatured,
  defaultExpanded = true,
  className,
}: ProcessCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  /*
   * Derive the header label directly from the real steps the agent took.
   *
   *   - While any step is still running, we show its executing verb
   *     ("Searching recipes..."). This is the step the user is waiting on.
   *   - Once everything finishes we show a neutral summary ("Steps" / "Step")
   *     — the individual step rows below tell the full story, so the header
   *     doesn't need to pick one step to call out.
   *   - On error we surface that the turn broke so the user has a clear
   *     signal even when the card is collapsed.
   *
   * This replaces the previous hardcoded per-tool rubric which fabricated
   * fake steps (e.g. "Create step by step recipes" / "Prepare
   * recommendations") that the agent never actually ran.
   */
  /*
   * Defensive default: `state.steps` is required by the type, but in practice
   * a stale ProcessCardState (left over from HMR, or a future payload that
   * forgot to supply it) would crash the card. Treat "no list" the same as
   * "empty list" and keep rendering.
   */
  const steps = state.steps ?? [];
  const activeStep = steps.find((s) => s.status === 'executing');
  const headerLabel = (() => {
    if (state.status === 'error') return 'Something went wrong';
    if (activeStep) return `${activeStep.label}...`;
    if (steps.length === 0) return 'Thinking...';
    return steps.length === 1 ? 'Step' : `Steps (${steps.length})`;
  })();

  return (
    <div className={'process-card' + (className ? ` ${className}` : '')}>
      <div className="process-card__badge">
        <JamieHeart className="process-card__heart" />
        <span className="process-card__speaker">JAMIE</span>
      </div>

      <Quote quote={state.quote} status={state.status} />

      {steps.length > 0 && (
        <>
          <button
            type="button"
            className="process-card__header"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls="process-card-steps"
          >
            <span
              className="process-card__header-label"
              data-state={state.status}
            >
              {headerLabel}
            </span>
            <ChevronDown
              size={16}
              className="process-card__chevron"
              data-open={expanded}
              aria-hidden="true"
            />
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                id="process-card-steps"
                className="process-card__steps"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="process-card__step-list">
                  {steps.map((step, index) => (
                    <StepRow
                      key={step.id}
                      status={step.status}
                      label={step.label}
                      icon={step.icon}
                      isLast={index === steps.length - 1}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {state.featured && (
        <motion.div
          className="process-card__featured"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
        >
          {renderFeatured(state.featured)}
        </motion.div>
      )}
    </div>
  );
}

function Quote({
  quote,
  status,
}: {
  quote: string | undefined;
  status: StepStatus;
}) {
  const isPlaceholder = !quote;
  const placeholderText =
    status === 'error' ? 'Hmm, let me try again…' : 'Let me check…';

  return (
    <div
      className="process-card__quote"
      data-placeholder={isPlaceholder || undefined}
      aria-live="polite"
    >
      {/*
       * The model frequently returns light markdown in its quotes (bold
       * recipe names with `**Foo**`, occasional italics). Rendering with
       * ReactMarkdown keeps that formatting visible; the component map
       * below scopes it to inline elements — the quote should never
       * contain blocks like headings or lists.
       */}
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="process-card__quote-p">{children}</p>,
          strong: ({ children }) => (
            <strong className="process-card__quote-strong">{children}</strong>
          ),
          em: ({ children }) => <em>{children}</em>,
          code: ({ children }) => <code className="process-card__quote-code">{children}</code>,
        }}
      >
        {quote ?? placeholderText}
      </ReactMarkdown>
    </div>
  );
}

function StepRow({
  status,
  label,
  icon,
  isLast,
}: {
  status: StepStatus;
  label: string;
  icon: ProcessStepIcon;
  isLast: boolean;
}) {
  return (
    <div className="process-card__row">
      <span
        className="process-card__icon"
        data-state={status}
        aria-label={
          status === 'executing'
            ? 'In progress'
            : status === 'done'
              ? 'Completed'
              : 'Could not complete'
        }
        role="img"
      >
        {status === 'done' ? <CheckCircle2 size={16} /> : <StepIcon icon={icon} />}
      </span>
      {!isLast && <span className="process-card__connector" aria-hidden="true" />}
      <span className="process-card__step-label" data-state={status}>
        {label}
      </span>
    </div>
  );
}

function StepIcon({ icon }: { icon: ProcessStepIcon }) {
  switch (icon) {
    case 'steps':
      return <Soup size={14} />;
    case 'chef':
      return <ChefHat size={14} />;
    case 'recipe':
      return <CookingPot size={14} />;
    case 'plan':
    case 'list':
      return <ClipboardList size={14} />;
    case 'search':
    default:
      return <Search size={14} />;
  }
}

/**
 * Helper: pick the featured payload from a message's raw tool results.
 * A single Jamie turn can carry multiple tool outputs — this decides
 * which one the process card should embed.
 *
 * Rule: use whichever output matches the tool that was called. If the
 * tool was `search_recipes` or `suggest_recipes_for_mood`, the featured
 * payload is the first recipe; the rest stay available for a carousel
 * rendered as a sibling below the card.
 */
export function selectFeatured(args: {
  tool: ToolName;
  recipes?: unknown[];
  mealPlan?: unknown;
  recipeDetail?: unknown;
  shoppingList?: unknown;
}): FeaturedPayload | undefined {
  const { tool } = args;

  if (
    (tool === 'search_recipes' || tool === 'suggest_recipes_for_mood') &&
    args.recipes &&
    args.recipes.length > 0
  ) {
    return {
      kind: 'recipe',
      recipe: args.recipes[0] as FeaturedPayload extends { kind: 'recipe' }
        ? FeaturedPayload['recipe']
        : never,
    };
  }
  if (tool === 'plan_meal' && args.mealPlan) {
    return {
      kind: 'meal_plan',
      mealPlan: args.mealPlan as FeaturedPayload extends { kind: 'meal_plan' }
        ? FeaturedPayload['mealPlan']
        : never,
    };
  }
  if (tool === 'get_recipe_details' && args.recipeDetail) {
    return {
      kind: 'recipe_detail',
      recipe: args.recipeDetail as FeaturedPayload extends {
        kind: 'recipe_detail';
      }
        ? FeaturedPayload['recipe']
        : never,
    };
  }
  if (tool === 'create_shopping_list' && args.shoppingList) {
    return {
      kind: 'shopping_list',
      shoppingList: args.shoppingList as FeaturedPayload extends {
        kind: 'shopping_list';
      }
        ? FeaturedPayload['shoppingList']
        : never,
    };
  }
  return undefined;
}

export default ProcessCard;
