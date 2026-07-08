import type { Transition } from 'motion/react';

export const motionDuration = {
  fast: 0.18,
  base: 0.32,
  slow: 0.42,
} as const;

export const motionEase = {
  /** The existing "drag release" curve already used at 320ms in VoiceModeRoller.css. */
  drag: [0.32, 0.72, 0, 1] as const,
  standard: 'easeOut' as const,
};

export const cardMorphTransition: Transition = {
  duration: motionDuration.base,
  ease: motionEase.drag,
};

export const fadeTransition: Transition = {
  duration: motionDuration.slow,
  ease: motionEase.standard,
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Collapse any transition to instant when the user has requested reduced motion. */
export function safeTransition(transition: Transition): Transition {
  return prefersReducedMotion() ? { duration: 0 } : transition;
}
