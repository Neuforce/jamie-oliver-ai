import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import './StepDoneCelebration.css';

/**
 * StepDoneCelebration — the quick "STEP N DONE" moment that plays when
 * the user finishes a step (Jamie_15). Full-bleed inside its parent,
 * it shows an animated ink-teal check, the completed step number, and
 * a teaser for the next step.
 *
 * Behavior per design:
 *   - Auto-advances after `durationMs` (default 1500ms) by firing
 *     `onComplete`. CookWithJamie owns the actual step transition.
 *   - Tapping anywhere on the card skips the remaining wait and fires
 *     `onComplete` immediately.
 *   - Respects `prefers-reduced-motion` (scale-in is still there but
 *     we skip the pulse).
 */
export interface StepDoneCelebrationProps {
  /** 1-indexed number of the step that was just completed. */
  stepNumber: number;
  /** Display name of the *next* step; shown as "NextStepName →". */
  nextStepName?: string;
  /** Fired when auto-advance elapses or the user taps. */
  onComplete: () => void;
  /** Override the auto-advance window (ms). Default 1500. */
  durationMs?: number;
  className?: string;
}

export function StepDoneCelebration({
  stepNumber,
  nextStepName,
  onComplete,
  durationMs = 1500,
  className,
}: StepDoneCelebrationProps) {
  /*
   * Ref guards against double-firing when the user taps in the final
   * few ms before auto-advance — the timer + the click handler can
   * both race; whichever fires first wins.
   */
  const firedRef = useRef(false);
  const handleComplete = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onComplete();
  };

  useEffect(() => {
    const t = window.setTimeout(handleComplete, durationMs);
    return () => window.clearTimeout(t);
    // `onComplete` is intentionally not in deps — we capture the first
    // value and hold it for the duration of the celebration so the
    // parent swapping callbacks mid-flight can't retrigger the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  return (
    <motion.button
      type="button"
      className={'jamie-step-done' + (className ? ` ${className}` : '')}
      onClick={handleComplete}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      aria-label={`Step ${stepNumber} done. Tap to continue.`}
    >
      <span className="jamie-step-done__kicker">STEP {stepNumber} DONE</span>

      <motion.span
        className="jamie-step-done__icon"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.05 }}
        aria-hidden="true"
      >
        <CheckCircle2 size={72} strokeWidth={2} />
      </motion.span>

      {nextStepName && (
        <span className="jamie-step-done__next">
          {nextStepName}
          <ArrowRight size={18} aria-hidden="true" />
        </span>
      )}
    </motion.button>
  );
}

export default StepDoneCelebration;
