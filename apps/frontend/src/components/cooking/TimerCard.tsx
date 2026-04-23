import React from 'react';
import { motion } from 'motion/react';
import './TimerCard.css';

/**
 * TimerCard — the big `mm:ss` countdown with a single primary pill
 * action, drawn in the Jamie cooking visual language (white surface,
 * soft shadow, tabular numerals, ink-teal brand accent).
 *
 * Variants:
 *   - `full`  : full-width inside its parent (single-timer steps,
 *               Jamie_09 / Jamie_12).
 *   - `slide` : fixed-width slide with peek, used by TimerCarousel
 *               when a step has multiple named timers (Jamie_19).
 *
 * Everything rendered is driven by props — this component owns no
 * tick logic. CookWithJamie (or any parent) holds the seconds and
 * running state and passes them in.
 */
export type TimerCardVariant = 'full' | 'slide';

export interface TimerCardProps {
  /** Remaining time in whole seconds (clamped to >= 0). */
  seconds: number;
  /** Whether the timer is currently counting down. Toggles the action pill. */
  running: boolean;
  /** Optional uppercase micro-label rendered above the numeric ("SIMMER", "REST"). */
  label?: string;
  /** Called when the pill is pressed. Parent decides start/pause semantics. */
  onToggle: () => void;
  /** Visual variant — full-width vs fixed-width slide. */
  variant?: TimerCardVariant;
  /** Additional class names on the root. */
  className?: string;
}

export function TimerCard({
  seconds,
  running,
  label,
  onToggle,
  variant = 'full',
  className,
}: TimerCardProps) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const display = formatClock(safeSeconds);

  return (
    <motion.div
      className={
        'jamie-timer-card' +
        ` jamie-timer-card--${variant}` +
        (running ? ' is-running' : '') +
        (className ? ` ${className}` : '')
      }
      data-running={running || undefined}
    >
      {label && <span className="jamie-timer-card__label">{label}</span>}

      <span
        className="jamie-timer-card__clock"
        aria-live="polite"
        aria-atomic="true"
      >
        {display}
      </span>

      <button
        type="button"
        className="jamie-timer-card__action"
        onClick={onToggle}
        aria-label={running ? 'Pause timer' : 'Start timer'}
      >
        {running ? 'Pause timer' : 'Start timer'}
      </button>
    </motion.div>
  );
}

export default TimerCard;

/**
 * Format a whole number of seconds as `mm:ss` (or `h:mm:ss` past an
 * hour). Keeps the leading minute digits un-padded so "10:00" renders
 * as "10:00" and not "010:00" — matches the mock exactly.
 */
function formatClock(total: number): string {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}
