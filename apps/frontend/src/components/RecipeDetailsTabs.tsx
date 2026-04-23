import React, { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Recipe } from '../data/recipes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { VideoStepCard } from './cooking/VideoStepCard';

export type RecipeDetailsTabId = 'ingredients' | 'steps' | 'videos' | 'tips';

interface RecipeDetailsTabsProps {
  recipe: Recipe;
  /**
   * Tab selected on first render. Defaults to `ingredients` — the most
   * common pre-cook question. Consumer can override (e.g. deep link
   * into Steps).
   */
  defaultTab?: RecipeDetailsTabId;
  /**
   * When provided, the matching row in the Steps tab is marked
   * `data-current="true"` so cook-mode consumers can highlight where
   * the user is in the overall recipe. 0-indexed.
   */
  currentStepIndex?: number;
  /**
   * Optional handler used by the Steps tab to let the cook surface jump
   * focus to a given step. If omitted, step rows are non-interactive.
   */
  onJumpToStep?: (stepIndex: number) => void;
  /**
   * Extra class hook for consumers that need to tweak layout without
   * duplicating the internal structure.
   */
  className?: string;
}

/**
 * Shared 4-tab recipe detail surface — Ingredients / Steps / Videos / Tips.
 *
 * Single source of truth for the pre-cook (RecipeModal) and in-cook
 * (CookWithJamie details panel) tabs. Every class name intentionally
 * stays prefixed with `jamie-recipe-modal__*` because those tokens are
 * already defined in `index.css` and shared across both surfaces — no
 * need to fork or rename.
 */
export function RecipeDetailsTabs({
  recipe,
  defaultTab = 'ingredients',
  currentStepIndex,
  onJumpToStep,
  className,
}: RecipeDetailsTabsProps) {
  const [activeTab, setActiveTab] = useState<RecipeDetailsTabId>(defaultTab);

  const stepRows = useMemo(() => {
    if (recipe.backendSteps && recipe.backendSteps.length > 0) {
      return recipe.backendSteps.map((step, idx) => ({
        idx,
        title: step.descr || `Step ${idx + 1}`,
        body: step.instructions || '',
        clip: step.clip,
      }));
    }
    return (recipe.instructions ?? []).map((text, idx) => ({
      idx,
      title: `Step ${idx + 1}`,
      body: text,
      clip: undefined as
        | { thumbnailUrl: string; videoUrl: string }
        | undefined,
    }));
  }, [recipe.backendSteps, recipe.instructions]);

  const videoSteps = useMemo(
    () => stepRows.filter((row) => !!row.clip),
    [stepRows],
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as RecipeDetailsTabId)}
      className={`jamie-recipe-modal__tabs${className ? ` ${className}` : ''}`}
    >
      <TabsList className="jamie-recipe-modal__segmented">
        <TabsTrigger
          value="ingredients"
          className="jamie-recipe-modal__segmented-option"
          data-active={activeTab === 'ingredients' || undefined}
        >
          Ingredients
        </TabsTrigger>
        <TabsTrigger
          value="steps"
          className="jamie-recipe-modal__segmented-option"
          data-active={activeTab === 'steps' || undefined}
        >
          Steps
        </TabsTrigger>
        <TabsTrigger
          value="videos"
          className="jamie-recipe-modal__segmented-option"
          data-active={activeTab === 'videos' || undefined}
        >
          Videos
        </TabsTrigger>
        <TabsTrigger
          value="tips"
          className="jamie-recipe-modal__segmented-option"
          data-active={activeTab === 'tips' || undefined}
        >
          Tips
        </TabsTrigger>
      </TabsList>

      <div className="jamie-recipe-modal__panels">
        <TabsContent value="ingredients" className="mt-0">
          <ul className="jamie-recipe-modal__ingredients">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={index} className="jamie-recipe-modal__ingredient-row">
                <span
                  className="jamie-recipe-modal__ingredient-dot"
                  aria-hidden="true"
                />
                <span>{ingredient}</span>
              </li>
            ))}
          </ul>

          {recipe.utensils && recipe.utensils.length > 0 && (
            <section
              className="jamie-recipe-modal__utensils"
              aria-labelledby="recipe-details-utensils-heading"
            >
              <h3
                id="recipe-details-utensils-heading"
                className="jamie-recipe-modal__section-heading"
              >
                You'll need
              </h3>
              <ul className="jamie-recipe-modal__utensil-chips">
                {recipe.utensils.map((utensil, idx) => (
                  <li
                    key={`${utensil}-${idx}`}
                    className="jamie-recipe-modal__utensil-chip"
                  >
                    {utensil}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TabsContent>

        <TabsContent value="steps" className="mt-0">
          {stepRows.length === 0 ? (
            <p className="jamie-recipe-modal__empty">
              No written steps yet — Jamie will guide you by voice.
            </p>
          ) : (
            <ol className="jamie-recipe-modal__steps">
              {stepRows.map((row) => {
                const isCurrent = row.idx === currentStepIndex;
                const jumpable = typeof onJumpToStep === 'function';
                return (
                  <li
                    key={row.idx}
                    className="jamie-recipe-modal__step-row"
                    data-current={isCurrent || undefined}
                    onClick={
                      jumpable ? () => onJumpToStep!(row.idx) : undefined
                    }
                    style={jumpable ? { cursor: 'pointer' } : undefined}
                  >
                    <span
                      className="jamie-recipe-modal__step-number"
                      aria-hidden="true"
                    >
                      {String(row.idx + 1).padStart(2, '0')}
                    </span>
                    <div className="jamie-recipe-modal__step-body">
                      <h4 className="jamie-recipe-modal__step-title">
                        {row.title}
                      </h4>
                      {row.body && (
                        <p className="jamie-recipe-modal__step-copy">
                          {row.body}
                        </p>
                      )}
                      {row.clip && (
                        <button
                          type="button"
                          className="jamie-recipe-modal__step-play"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              row.clip!.videoUrl,
                              '_blank',
                              'noopener,noreferrer',
                            );
                          }}
                          aria-label={`Play video for step ${row.idx + 1}`}
                        >
                          <Play size={12} fill="currentColor" />
                          Play clip
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="videos" className="mt-0">
          {videoSteps.length === 0 ? (
            <p className="jamie-recipe-modal__empty">
              No step videos for this recipe yet — Jamie will walk you through
              each step by voice when you start cooking.
            </p>
          ) : (
            <ul className="jamie-recipe-modal__videos">
              {videoSteps.map((row) => (
                <li key={row.idx} className="jamie-recipe-modal__video-row">
                  <VideoStepCard
                    stepNumber={row.idx + 1}
                    title={row.title}
                    thumbnailUrl={row.clip!.thumbnailUrl}
                    onPlay={() => {
                      const url = row.clip!.videoUrl;
                      if (url) {
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tips" className="mt-0">
          {recipe.tips && recipe.tips.length > 0 ? (
            <ul className="jamie-recipe-modal__tips">
              {recipe.tips.map((tip, idx) => (
                <li key={idx} className="jamie-recipe-modal__tip-row">
                  <span
                    className="jamie-recipe-modal__tip-marker"
                    aria-hidden="true"
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <p className="jamie-recipe-modal__tip-copy">{tip}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="jamie-recipe-modal__empty">
              No tips yet — Jamie will share what he notices as you cook.
            </p>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}

export default RecipeDetailsTabs;
