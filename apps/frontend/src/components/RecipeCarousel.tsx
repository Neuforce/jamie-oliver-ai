import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Recipe } from '../data/recipes';
import { RecipeCard } from './RecipeCard';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StackRole } from './VoiceModeRoller';

const SWIPE_THRESHOLD_PX = 36;

interface RecipeCarouselProps {
  recipes: Recipe[];
  onRecipeClick: (recipe: Recipe) => void;
  singleSlide?: boolean; // Force single slide display (e.g., for chat)
  voiceMode?: boolean;
  voiceRole?: StackRole;
}

export function RecipeCarousel({
  recipes,
  onRecipeClick,
  singleSlide = false,
  voiceMode = false,
  voiceRole,
}: RecipeCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slidesToShow, setSlidesToShow] = useState(singleSlide ? 1 : 3);

  useEffect(() => {
    if (singleSlide) {
      setSlidesToShow(1);
      return;
    }

    const handleResize = () => {
      if (window.innerWidth < 640) {
        setSlidesToShow(1);
      } else if (window.innerWidth < 1024) {
        setSlidesToShow(2);
      } else {
        setSlidesToShow(3);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [singleSlide]);

  const maxIndex = Math.max(0, recipes.length - slidesToShow);
  /*
   * Voice mode uses a stacked roller (top/middle/back). Only the top card
   * is fully visible and interactive; middle/back cards peek out below and
   * must NOT steal touch/pagination interactions from the top card.
   */
  const isTopVoiceCard = !voiceMode || voiceRole === 'top' || voiceRole === undefined;
  /*
   * Single-slide carousel caps at 335px in BOTH chat and voice mode.
   * Without the cap, the recipe image ballooned to fill the voice-mode
   * card width (~640px) which looked oversized next to the chat-mode
   * cards. One cap everywhere keeps recipe visuals consistent.
   */
  const singleSlideMaxWidth = 335;

  useEffect(() => {
    setCurrentIndex((prev) => Math.min(prev, maxIndex));
  }, [maxIndex]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
  }, [maxIndex]);

  const visibleRecipes = recipes.slice(currentIndex, currentIndex + slidesToShow);

  const navigateTo = (index: number) => {
    setCurrentIndex(index);
  };

  /*
   * Horizontal swipe handling for the voice-mode single-slide carousel.
   *
   * The roller owns vertical drag; we intercept pointer events at the
   * carousel to detect a horizontal swipe, converting past the threshold
   * into prev/next navigation. onPointerDownCapture stops the pointerdown
   * from reaching the roller so it never starts a vertical drag.
   */
  const swipeState = useRef<{ startX: number; startY: number; pointerId: number | null }>({
    startX: 0,
    startY: 0,
    pointerId: null,
  });

  const stopRollerDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const handleSwipeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    swipeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
  }, []);

  const handleSwipeMove = useCallback((_e: React.PointerEvent<HTMLDivElement>) => {
    // No-op: we decide on pointerUp. Kept for future inertia if needed.
  }, []);

  const handleSwipeEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const { startX, startY, pointerId } = swipeState.current;
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      swipeState.current = { startX: 0, startY: 0, pointerId: null };
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) handleNext();
      else handlePrev();
    },
    [handleNext, handlePrev],
  );

  const handleSwipeCancel = useCallback(() => {
    swipeState.current = { startX: 0, startY: 0, pointerId: null };
  }, []);

  return (
    <div className="relative">
      {/* Navigation Buttons */}
      {!singleSlide && currentIndex > 0 && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          variant="outline"
          size="sm"
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 rounded-full size-8 p-0 shadow-lg bg-background"
        >
          <ChevronLeft className="size-4" />
        </Button>
      )}

      {!singleSlide && currentIndex < maxIndex && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          variant="outline"
          size="sm"
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 rounded-full size-8 p-0 shadow-lg bg-background"
        >
          <ChevronRight className="size-4" />
        </Button>
      )}

      {/* Carousel Content */}
      <div className="overflow-hidden">
        {singleSlide ? (
          <div
            className="relative mx-auto w-full"
            style={
              singleSlideMaxWidth ? { maxWidth: `${singleSlideMaxWidth}px` } : undefined
            }
            {...(voiceMode ? { onPointerDownCapture: stopRollerDrag } : undefined)}
          >
            {/*
              * Navigation arrows — identical between chat and voice mode.
              *
              * Placement: absolute, vertically centered on the recipe image
              * (the recipe card owns the full container height, so
              * `top: 50%` lands on the middle of the image, NOT on the
              * title bar at the bottom). They sit just inside the left /
              * right edges of the card so they read as part of the image,
              * floating pill-shaped buttons with a soft drop shadow.
              *
              * Gated by `isTopVoiceCard` so back/middle stacked cards in
              * voice mode don't render their own phantom arrows.
              */}
            {isTopVoiceCard && currentIndex > 0 && (
              <button
                type="button"
                data-voice-interactive="true"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                aria-label="Previous recipe"
                className="jamie-carousel-nav jamie-carousel-nav--prev"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            {isTopVoiceCard && currentIndex < maxIndex && (
              <button
                type="button"
                data-voice-interactive="true"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                aria-label="Next recipe"
                className="jamie-carousel-nav jamie-carousel-nav--next"
              >
                <ChevronRight className="size-4" />
              </button>
            )}

            <div
              className="flex items-center justify-center"
              {...(voiceMode && isTopVoiceCard
                ? {
                    onPointerDown: handleSwipeStart,
                    onPointerMove: handleSwipeMove,
                    onPointerUp: handleSwipeEnd,
                    onPointerCancel: handleSwipeCancel,
                    style: { touchAction: 'pan-y' },
                  }
                : undefined)}
            >
              {visibleRecipes.map((recipe) => (
                <div key={recipe.id} className="w-full">
                  <RecipeCard
                    recipe={recipe}
                    onClick={() => onRecipeClick(recipe)}
                    variant="chat"
                  />
                </div>
              ))}
            </div>

            {isTopVoiceCard && recipes.length > slidesToShow && (
              <div
                className="pointer-events-auto absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center justify-center gap-1.5"
                data-voice-interactive="true"
              >
                {Array.from({ length: maxIndex + 1 }).map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    data-voice-interactive="true"
                    aria-label={`Go to recipe ${index + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTo(index);
                    }}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentIndex
                        ? 'w-5 bg-white'
                        : 'w-1.5 bg-white/55 hover:bg-white/80'
                    }`}
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${slidesToShow}, minmax(0, 1fr))`,
            }}
          >
            {visibleRecipes.map((recipe) => (
              <div key={recipe.id}>
                <RecipeCard
                  recipe={recipe}
                  onClick={() => onRecipeClick(recipe)}
                  variant="chat"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dots Indicator */}
      {!singleSlide && recipes.length > slidesToShow && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {Array.from({ length: maxIndex + 1 }).map((_, index) => (
            <button
              key={index}
              type="button"
              data-voice-interactive="true"
              onClick={(e) => {
                e.stopPropagation();
                navigateTo(index);
              }}
              className={`h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'w-6 bg-primary'
                  : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
