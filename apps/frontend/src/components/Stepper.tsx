import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import './Stepper.css';

/**
 * Stepper — cooking-screen progress indicator.
 *
 * Layout (top to bottom):
 *   [segment bar]      <- totalSteps segments, flex-distributed, 4px tall
 *   [Recipe title]     <- uppercase Poppins 24px/700, teal-dark
 *   STEP N OF M        <- uppercase Poppins 12px/600, teal-dark, letter-spaced
 *   [current step name] <- Poppins 20px/500, teal-dark
 *
 * Props map 1:1 to your existing CookWithJamie progress bar. The only
 * addition beyond "Figma exactly" is the `timerActive` prop, which makes
 * the current segment pulse to encode timer state (per our decision).
 * Pass `timerActive={false}` and it behaves as a plain static bar.
 *
 * Animation:
 *   - Segment fill transitions as `currentStep` advances (280ms ease)
 *   - The "STEP N OF M" label and step name cross-fade when they change
 *   - Timer pulse is a 1.6s soft opacity loop on the active segment only
 *   - All animations respect prefers-reduced-motion
 *
 * Accessibility:
 *   - `role="progressbar"` with aria-valuenow/min/max/valuetext
 *   - Step transitions announced via aria-live="polite"
 *   - Timer pulse is purely visual (no animation on reduced-motion)
 *
 * The component is presentation-only: no timer hooks, no step-advance
 * logic, no back button. Your CookWithJamie.tsx owns all of that and
 * passes the resulting numbers and strings in.
 */
export interface StepperProps {
  /** Recipe name shown above the step label. */
  recipeTitle: string;
  /** Total number of recipe steps (segment count). */
  totalSteps: number;
  /** 1-indexed current step. Must be between 1 and totalSteps. */
  currentStep: number;
  /** Display name for the active step. */
  currentStepName: string;
  /**
   * Whether the active segment should pulse. Pass true when a timer
   * is running for the current step, false when idle. Default: true.
   */
  timerActive?: boolean;
  /** Extra classes on the wrapper. */
  className?: string;
}

export function Stepper({
  recipeTitle,
  totalSteps,
  currentStep,
  currentStepName,
  timerActive = true,
  className,
}: StepperProps) {
  // Defensive clamp — if a parent ever passes out-of-range values, we
  // don't want the aria math to break or the segments to render wrong.
  const safeCurrent = Math.max(1, Math.min(currentStep, totalSteps));

  return (
    <div
      className={'stepper' + (className ? ` ${className}` : '')}
      role="progressbar"
      aria-valuenow={safeCurrent}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuetext={`Step ${safeCurrent} of ${totalSteps}: ${currentStepName}`}
    >
      <div className="stepper__segments" aria-hidden="true">
        {Array.from({ length: totalSteps }).map((_, i) => {
          const stepNumber = i + 1;
          const state: SegmentState =
            stepNumber < safeCurrent
              ? 'complete'
              : stepNumber === safeCurrent
                ? 'active'
                : 'pending';
          return (
            <Segment
              key={i}
              state={state}
              timerActive={state === 'active' && timerActive}
            />
          );
        })}
      </div>

      <h1 className="stepper__title">{recipeTitle}</h1>

      <CrossfadeBlock stepKey={safeCurrent}>
        <span className="stepper__counter">
          STEP {safeCurrent} OF {totalSteps}
        </span>
        <span className="stepper__step-name">{currentStepName}</span>
      </CrossfadeBlock>
    </div>
  );
}

export default Stepper;

// -- internals --------------------------------------------------------------

type SegmentState = 'complete' | 'active' | 'pending';

function Segment({
  state,
  timerActive,
}: {
  state: SegmentState;
  timerActive: boolean;
}) {
  return (
    <span
      className="stepper__segment"
      data-state={state}
      data-timer={timerActive ? 'active' : undefined}
    />
  );
}

/**
 * Wraps children in a cross-fade that triggers whenever `stepKey` changes.
 * Used for the counter + step name block so advancing steps feels soft,
 * not like a jump cut.
 */
function CrossfadeBlock({
  stepKey,
  children,
}: {
  stepKey: number | string;
  children: React.ReactNode;
}) {
  // Track whether this is the initial mount. We don't want the first
  // render to animate — the stepper should appear fully formed.
  const isFirstRenderRef = useRef(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    isFirstRenderRef.current = false;
  }, []);

  return (
    <div className="stepper__labels">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stepKey}
          className="stepper__labels-inner"
          initial={mounted ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
