import React, { useCallback, useEffect, useRef, useState } from 'react';
import './TimerCarousel.css';

const SWIPE_THRESHOLD_PX = 36;

/**
 * TimerCarousel — horizontal peek carousel for cook steps that have
 * more than one named timer (SIMMER + REST, etc.). Matches Jamie_19:
 * the active slide is centered with adjacent slides peeking in from
 * the sides, and a row of dots sits underneath.
 *
 * This component is generic on purpose. Pass in any array of children
 * (we use `TimerCard variant="slide"`) and it handles:
 *   - horizontal swipe with a configurable threshold
 *   - trackpad wheel nav on desktop
 *   - keyboard `ArrowLeft` / `ArrowRight` when focused
 *   - dots that reflect and drive `activeIndex`
 *
 * Layout is done with translateX on an inner track so the peek is
 * purely visual — no extra DOM, no measurement hacks.
 */
export interface TimerCarouselProps {
  /** Each child becomes one slide. Length drives dot count. */
  children: React.ReactNode;
  /** Optional controlled index. If omitted, the component holds its own state. */
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  /** aria-label for the carousel region. */
  ariaLabel?: string;
  className?: string;
}

export function TimerCarousel({
  children,
  activeIndex: controlledIndex,
  onActiveIndexChange,
  ariaLabel = 'Step timers',
  className,
}: TimerCarouselProps) {
  const slides = React.Children.toArray(children);
  const count = slides.length;

  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex =
    controlledIndex !== undefined
      ? Math.max(0, Math.min(controlledIndex, count - 1))
      : internalIndex;

  const setActive = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, count - 1));
      if (controlledIndex === undefined) setInternalIndex(clamped);
      onActiveIndexChange?.(clamped);
    },
    [controlledIndex, count, onActiveIndexChange],
  );

  const handlePrev = useCallback(() => setActive(activeIndex - 1), [activeIndex, setActive]);
  const handleNext = useCallback(() => setActive(activeIndex + 1), [activeIndex, setActive]);

  /*
   * Swipe handling. Mirrors the pattern in RecipeCarousel — we decide
   * direction on pointerUp so movement during the drag doesn't fight
   * with scroll gestures or the voice dock.
   */
  const swipeState = useRef<{ startX: number; startY: number; pointerId: number | null }>({
    startX: 0,
    startY: 0,
    pointerId: null,
  });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    swipeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
  }, []);

  const onPointerUp = useCallback(
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

  const onPointerCancel = useCallback(() => {
    swipeState.current = { startX: 0, startY: 0, pointerId: null };
  }, []);

  /*
   * Mouse-wheel nav on desktop. We only act on meaningfully horizontal
   * deltas (or shift+wheel) to avoid hijacking vertical page scroll.
   * We also throttle with a ref-guard so one spin of the wheel moves
   * one slide, not ten.
   */
  const wheelLockRef = useRef(false);
  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!horizontal) return;
      e.preventDefault();
      if (wheelLockRef.current) return;
      const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (Math.abs(dx) < 10) return;
      wheelLockRef.current = true;
      if (dx > 0) handleNext();
      else handlePrev();
      window.setTimeout(() => {
        wheelLockRef.current = false;
      }, 280);
    },
    [handleNext, handlePrev],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    },
    [handleNext, handlePrev],
  );

  // Keep controlled index in sync if the parent shrinks `count`.
  useEffect(() => {
    if (activeIndex > count - 1) setActive(count - 1);
  }, [count, activeIndex, setActive]);

  if (count === 0) return null;

  return (
    <div
      className={'jamie-timer-carousel' + (className ? ` ${className}` : '')}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
    >
      <div className="jamie-timer-carousel__viewport">
        <div
          className="jamie-timer-carousel__track"
          style={{
            transform: `translateX(calc(50% - ${activeIndex * 276}px - 130px))`,
            // 260px slide + 16px gap = 276; -130px pulls the center of
            // the active slide onto the viewport center. Keep in sync
            // with the fixed slide width in TimerCard.css if you tune
            // it — this is the trade-off for not measuring in JS.
          }}
        >
          {slides.map((child, idx) => (
            <div
              key={idx}
              className="jamie-timer-carousel__slide"
              data-active={idx === activeIndex || undefined}
              aria-hidden={idx !== activeIndex || undefined}
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="jamie-timer-carousel__dots" role="tablist">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              className="jamie-timer-carousel__dot"
              data-active={idx === activeIndex || undefined}
              aria-selected={idx === activeIndex}
              aria-label={`Show timer ${idx + 1}`}
              onClick={() => setActive(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default TimerCarousel;
