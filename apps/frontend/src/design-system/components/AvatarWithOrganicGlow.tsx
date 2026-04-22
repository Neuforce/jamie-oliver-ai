import React, { useMemo } from 'react';
import './AvatarWithOrganicGlow.css';

/**
 * Visual states the glow reacts to. Simpler than the raw voice state machine —
 * the adapter below collapses `useVoiceChat`'s 7 states into these 4.
 */
export type GlowState = 'idle' | 'listening' | 'speaking' | 'processing';

export interface AvatarWithOrganicGlowProps {
  /** Avatar image URL. */
  src: string;
  /** Alt text. */
  alt: string;
  /** Pixel size of the avatar image (the glow extends beyond this). Default 120. */
  size?: number;
  /** Visual state driving the glow intensity and motion. */
  state?: GlowState;
  /**
   * When true, forces the glow to the idle (dim) presentation regardless of
   * `state`. Use this when the microphone is muted — a breathing glow would
   * imply Jamie can hear you when he can't.
   */
  muted?: boolean;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

/**
 * Jamie's avatar with a calm, organic glow.
 *
 * Two colored radial gradients and one warm-white gradient drift on different
 * timings (14s / 11s / 17s) so they never sync up — the aesthetic is aurora,
 * not pulse. State changes affect brightness and scale, never rhythm.
 *
 * All animation is pure CSS — runs on the GPU with zero main-thread cost,
 * safe to mount alongside voice streaming on mobile.
 */
export function AvatarWithOrganicGlow({
  src,
  alt,
  size = 120,
  state = 'idle',
  muted = false,
  className,
}: AvatarWithOrganicGlowProps) {
  const effectiveState: GlowState = muted ? 'idle' : state;

  // Wrapper is 1.5× avatar size so the blurred glow has room to breathe.
  // The blur radius and glow extent below assume this ratio.
  const wrapperSize = useMemo(() => Math.round(size * 1.5), [size]);

  return (
    <div
      className={
        'jamie-glow' + (className ? ` ${className}` : '')
      }
      data-state={effectiveState}
      style={
        {
          width: `${wrapperSize}px`,
          height: `${wrapperSize}px`,
          ['--jamie-avatar-size' as string]: `${size}px`,
        } as React.CSSProperties
      }
    >
      <div className="jamie-glow__layer jamie-glow__layer--a" aria-hidden="true" />
      <div className="jamie-glow__layer jamie-glow__layer--b" aria-hidden="true" />
      <div className="jamie-glow__layer jamie-glow__layer--c" aria-hidden="true" />
      <img
        src={src}
        alt={alt}
        className="jamie-glow__avatar"
        draggable={false}
      />
    </div>
  );
}

/**
 * Maps the full 7-state voice machine from `useVoiceChat` down to the 4
 * visual states the glow understands. Exported so the same mapping can be
 * reused elsewhere (e.g. a toolbar indicator).
 *
 * The backend names mirror `VoiceChatState` in `hooks/useVoiceChat`.
 */
export function voiceStateToGlowState(
  voiceState:
    | 'idle'
    | 'connecting'
    | 'listening'
    | 'user_speaking'
    | 'processing'
    | 'assistant_speaking'
    | 'barge_in_pending',
): GlowState {
  switch (voiceState) {
    case 'listening':
    case 'user_speaking':
      return 'listening';
    case 'processing':
      return 'processing';
    case 'assistant_speaking':
    case 'barge_in_pending':
      return 'speaking';
    case 'idle':
    case 'connecting':
    default:
      return 'idle';
  }
}

export default AvatarWithOrganicGlow;
