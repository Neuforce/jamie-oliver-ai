import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Recipe } from '../data/recipes';
import { ArrowLeft, RotateCcw, Lock, Clock, Users, ChefHat, Play, Share2 } from 'lucide-react';
import { SupertabPurchaseButton, type SupertabPurchaseButtonHandle } from './SupertabPurchaseButton';
import { toast } from './ui/sonner';
import type { RecipeAccessResponse } from '../lib/api';
import { routeToUrl } from '../lib/permalinks';
import type { RecipePurchaseResolution } from '../lib/supertab';
import { RecipeDetailsTabs } from './RecipeDetailsTabs';
// @ts-expect-error - Vite resolves figma:asset imports
import logoImage from 'figma:asset/36d2b220ecc79c7cc02eeec9462a431d28659cd4.png';

interface RecipeModalProps {
  recipe: Recipe | null;
  onClose: () => void;
  onCookWithJamie: () => void;
  recipeAccess?: RecipeAccessResponse | null;
  isAccessLoading?: boolean;
  accessLoadFailed?: boolean;
  onRetryAccessLoad?: () => void;
  onPurchaseResolved?: (resolution: RecipePurchaseResolution) => void;
  /** Extra bottom padding while the modal has portaled voice strip (launcher or active dock). */
  reserveBottomForVoiceDock?: boolean;
}

export type RecipeModalHandle = {
  /** Opens the same Supertab checkout as tapping "Put it on my Tab" in this modal — no duplicate mount. */
  openMyTabPurchaseFlow: () => Promise<void>;
};

/**
 * RecipeModal — pre-cook recipe detail surface.
 *
 * Inspired by Jamie_06 / Jamie_07 (back + "Let's cook" header, uppercase
 * title, segmented pill tabs, clean bullet lists) but expanded to
 * surface the richness of the underlying recipe data: hero image,
 * short description, time/servings/difficulty meta row, and overview
 * tabs (Ingredients, Steps) before the cook session starts.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ [<]                         [  Let's cook  ] │  ← header
 *   │  ┌────────────────────────────────────────┐  │
 *   │  │                                        │  │
 *   │  │            hero image 16:9             │  │  ← visual anchor
 *   │  │  [ CATEGORY ]                          │  │
 *   │  └────────────────────────────────────────┘  │
 *   │ JAMIE'S CLASSIC FAMILY LASAGNE               │  ← uppercase title
 *   │ ⏱ 45 min   👥 4 servings   👨‍🍳 Medium         │  ← meta row
 *   │ Rich short description paragraph…            │  ← lede
 *   │ [——————— 4 of 7 segments (optional) ———————] │  ← only if savedSession
 *   │                                              │
 *   │ ( Ingredients | Steps )                      │  ← segmented pill tabs
 *   │                                              │
 *   │ content list (per-tab)…                      │
 *   └──────────────────────────────────────────────┘
 *
 * Access states:
 *   - unlocked → "Let's cook" pill on the right
 *   - resumable → "Resume" pill (still ink-teal) + segment-bar progress
 *     indicator under the title + quiet "Start fresh" link
 *   - locked   → "Unlock" pill on the right; the real Supertab
 *     purchase widget sits directly below the title so the commerce
 *     flow stays explicit
 */
export const RecipeModal = forwardRef<RecipeModalHandle, RecipeModalProps>(function RecipeModal(
  {
  recipe,
  onClose,
  onCookWithJamie,
  recipeAccess,
  isAccessLoading = false,
  accessLoadFailed = false,
  onRetryAccessLoad,
  onPurchaseResolved,
  reserveBottomForVoiceDock = false,
  },
  ref,
) {
  const [savedSession, setSavedSession] = useState<any>(null);
  const purchaseButtonRef = useRef<SupertabPurchaseButtonHandle | null>(null);

  useEffect(() => {
    if (!recipe) {
      setSavedSession(null);
      return;
    }
    const session = localStorage.getItem(`cooking-session-${recipe.id}`);
    if (!session) {
      setSavedSession(null);
      return;
    }
    try {
      const parsed = JSON.parse(session);
      const age = Date.now() - parsed.timestamp;
      if (age < 24 * 60 * 60 * 1000) {
        setSavedSession(parsed);
      } else {
        localStorage.removeItem(`cooking-session-${recipe.id}`);
        setSavedSession(null);
      }
    } catch {
      setSavedSession(null);
    }
  }, [recipe]);

  useImperativeHandle(ref, () => ({
    openMyTabPurchaseFlow: async () => {
      if (!recipe) {
        return;
      }
      // Voice path: App already verified locked access — do not gate on stale recipeAccess props.
      document
        .querySelector('[data-supertab-pane]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await purchaseButtonRef.current?.openPurchaseExperience();
    },
  }), [recipe]);

  const handleShare = useCallback(async () => {
    if (!recipe?.backendId) {
      return;
    }

    const url = `${window.location.origin}${routeToUrl({ kind: 'recipe', slug: recipe.backendId })}`;

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: recipe.title, url });
        return;
      }

      await navigator.clipboard.writeText(url);
      toast.success('Link copied', {
        description: 'Recipe link copied to clipboard',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied', {
          description: 'Recipe link copied to clipboard',
        });
      } catch {
        toast.error('Could not copy link');
      }
    }
  }, [recipe]);

  if (!recipe) return null;

  const shareUrl = recipe.backendId
    ? `${window.location.origin}${routeToUrl({ kind: 'recipe', slug: recipe.backendId })}`
    : null;

  const isLocked = recipeAccess?.accessState === 'locked';
  const canCook = recipeAccess?.accessState === 'free' || recipeAccess?.accessState === 'owned';
  const canResumeSavedSession = !!savedSession && canCook;

  const resumeStepsCount = recipe.instructions.length;
  const resumeCurrentStep = savedSession
    ? Math.min(savedSession.currentStep + 1, resumeStepsCount)
    : 0;

  /*
   * Header right-slot pill. One component decides the three access
   * states so the markup stays boring.
   */
  const primaryCta = (() => {
    if (isAccessLoading) {
      return (
        <button
          type="button"
          className="jamie-recipe-modal__header-pill"
          disabled
          aria-label="Checking access"
        >
          Checking…
        </button>
      );
    }
    if (isLocked) {
      return (
        <button
          type="button"
          className="jamie-recipe-modal__header-pill"
          onClick={() => {
            document
              .querySelector('[data-supertab-pane]')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          aria-label="Unlock recipe"
        >
          <Lock size={14} aria-hidden="true" />
          Unlock
        </button>
      );
    }
    if (!canCook) {
      if (!recipe.backendId) {
        return (
          <button
            type="button"
            className="jamie-recipe-modal__header-pill"
            disabled
            aria-label="Recipe unavailable"
          >
            Unavailable
          </button>
        );
      }
      if (accessLoadFailed && onRetryAccessLoad) {
        return (
          <button
            type="button"
            className="jamie-recipe-modal__header-pill"
            onClick={onRetryAccessLoad}
            aria-label="Retry access check"
          >
            Retry
          </button>
        );
      }
      return (
        <button
          type="button"
          className="jamie-recipe-modal__header-pill"
          disabled
          aria-label="Access unavailable"
        >
          Unavailable
        </button>
      );
    }
    if (canResumeSavedSession) {
      return (
        <button
          type="button"
          className="jamie-recipe-modal__header-pill"
          onClick={onCookWithJamie}
          aria-label={`Resume cooking — step ${resumeCurrentStep} of ${resumeStepsCount}`}
        >
          <Play size={14} aria-hidden="true" fill="currentColor" />
          Resume
        </button>
      );
    }
    return (
      <button
        type="button"
        className="jamie-recipe-modal__header-pill"
        onClick={onCookWithJamie}
        aria-label="Let's cook"
      >
        Let's cook
      </button>
    );
  })();

  return (
    <div
      className="fixed inset-0 z-50 bg-background"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/*
       * Header — Jamie_06/07: back circle (left), "Let's cook" pill
       * (right). No logo, no centered brand. Uses `.jamie-cook-header`
       * shared with the cook screen so pre-cook and cook surfaces
       * feel like one continuous space.
       */}
      <header className="jamie-app-header-shell">
        <div className="jamie-shell-width jamie-cook-header">
          <div
            className={
              shareUrl
                ? 'jamie-cook-header__side jamie-cook-header__side--multi'
                : 'jamie-cook-header__side'
            }
          >
            <button
              type="button"
              onClick={onClose}
              className="jamie-icon-button"
              aria-label="Close recipe"
            >
              <ArrowLeft size={20} />
            </button>
            {shareUrl && (
              <button
                type="button"
                onClick={() => void handleShare()}
                className="jamie-icon-button"
                aria-label="Share recipe"
              >
                <Share2 size={20} />
              </button>
            )}
          </div>

          <div className="jamie-cook-header__center">
            <img
              src={logoImage}
              alt="Jamie Oliver"
              className="jamie-cook-header__logo"
              draggable={false}
            />
          </div>

          <div className="jamie-cook-header__side jamie-cook-header__side--end jamie-cook-header__side--pill">
            {primaryCta}
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div
          className={
            reserveBottomForVoiceDock
              ? 'jamie-shell-width jamie-recipe-modal-body jamie-recipe-modal-body--voice-dock-reserve'
              : 'jamie-shell-width jamie-recipe-modal-body'
          }
        >
          {/*
           * Hero image. Sits at the top of the scrollable body — one
           * generous 16:9 panel with a soft inset shadow and rounded
           * corners. Category pill overlays the top-left corner to
           * give the page an identity anchor before the user reads
           * the title.
           */}
          {recipe.image && (
            <div className="jamie-recipe-modal__hero">
              <img
                src={recipe.image}
                alt=""
                className="jamie-recipe-modal__hero-img"
                loading="eager"
              />
              {recipe.category && (
                <span className="jamie-recipe-modal__hero-badge">
                  {recipe.category}
                </span>
              )}
            </div>
          )}

          {/*
           * Large uppercase ink-teal title. Sits directly under the
           * hero and anchors the content column.
           */}
          <h1 className="jamie-recipe-modal__title">{recipe.title}</h1>

          {/*
           * Compact metadata row — time · servings · difficulty. Uses
           * the same ink-teal-on-muted color pair as the rest of the
           * page so it reads as caption, not CTA. Kept above any
           * resume progress bar so the essentials are first.
           */}
          <ul className="jamie-recipe-modal__meta" aria-label="Recipe details">
            {recipe.time && (
              <li className="jamie-recipe-modal__meta-item">
                <Clock size={14} aria-hidden="true" />
                <span>{recipe.time}</span>
              </li>
            )}
            {recipe.servings !== undefined && (
              <li className="jamie-recipe-modal__meta-item">
                <Users size={14} aria-hidden="true" />
                <span>
                  {recipe.servings}{' '}
                  {recipe.servings === 1 ? 'serving' : 'servings'}
                </span>
              </li>
            )}
            {recipe.difficulty && (
              <li className="jamie-recipe-modal__meta-item">
                <ChefHat size={14} aria-hidden="true" />
                <span>{recipe.difficulty}</span>
              </li>
            )}
          </ul>

          {/*
           * Short descriptive lede — the recipe's own intro paragraph.
           * Kept below the meta row so the essentials (time, servings,
           * difficulty) scan first, then the context of *why* this
           * recipe is interesting. Uses a softer color so it reads
           * as supporting prose rather than chrome.
           */}
          {recipe.description && (
            <p className="jamie-recipe-modal__lede">{recipe.description}</p>
          )}

          {/*
           * Optional resume progress bar — appears only when a saved
           * session exists. Segments here are the same 4px pill
           * segments used by the Stepper in the cook screen so the
           * visual language stays consistent.
           */}
          {canResumeSavedSession && (
            <div className="jamie-recipe-modal__resume">
              <div
                className="jamie-recipe-modal__progress stepper__segments"
                role="progressbar"
                aria-valuenow={resumeCurrentStep}
                aria-valuemin={1}
                aria-valuemax={resumeStepsCount}
                aria-valuetext={`Step ${resumeCurrentStep} of ${resumeStepsCount}`}
              >
                {Array.from({ length: resumeStepsCount }).map((_, i) => {
                  const stepNumber = i + 1;
                  const state =
                    stepNumber < resumeCurrentStep
                      ? 'complete'
                      : stepNumber === resumeCurrentStep
                        ? 'active'
                        : 'pending';
                  return (
                    <span
                      key={i}
                      className="stepper__segment"
                      data-state={state}
                      aria-hidden="true"
                    />
                  );
                })}
              </div>

              <div className="jamie-recipe-modal__resume-row">
                <span className="jamie-recipe-modal__resume-caption">
                  In progress — Step {resumeCurrentStep} of {resumeStepsCount}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(`cooking-session-${recipe.id}`);
                    setSavedSession(null);
                    toast.success('Session cleared', {
                      description: 'You can start fresh now',
                    });
                  }}
                  className="jamie-recipe-modal__ghost-link"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Start fresh
                </button>
              </div>
            </div>
          )}

          {/*
           * Locked-state commerce pane. Kept explicit (in-body, not
           * hidden behind the header pill) so the purchase affordance
           * is never ambiguous. The header pill scrolls to this pane
           * when tapped while locked.
           */}
          {isLocked && recipeAccess && (
            <div
              className="jamie-recipe-modal__supertab"
              data-supertab-pane="true"
            >
              <SupertabPurchaseButton
                ref={purchaseButtonRef}
                access={recipeAccess}
                onResolved={onPurchaseResolved}
              />
            </div>
          )}

          {/*
           * Tab block is now a shared component (see
           * `RecipeDetailsTabs.tsx`) so RecipeModal (pre-cook) and
           * CookWithJamie (in-cook reference panel) render identical
           * content from a single source of truth. Keeps the design
           * system consistent — ingredients and steps use the same
           * segmented pill tabs, typography, and list styles.
           * Videos / Tips remain in cook mode (`variant="full"`).
           */}
          <RecipeDetailsTabs recipe={recipe} variant="overview" />
        </div>
      </div>
    </div>
    );
});
RecipeModal.displayName = 'RecipeModal';
