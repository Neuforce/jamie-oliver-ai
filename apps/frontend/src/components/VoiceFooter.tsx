import React from 'react';
import { MessageCircle, MicOff, Square } from 'lucide-react';

/**
 * VoiceFooter — the docked voice control row used by both ChatView
 * (voice mode) and CookWithJamie. Consolidates the avatar-with-glow
 * mute toggle + stop button + secondary ghost action into one
 * component so the two surfaces share *one* source of truth for what
 * the voice dock looks like and how it behaves.
 *
 * No new visuals: all styling is delivered by the existing
 * `.jamie-voice-*` CSS already in index.css. This component is purely
 * about markup consolidation.
 *
 * States:
 *   - `avatarState` drives the glow via `data-state` — the CSS rules
 *     pick up `idle | listening | speaking | muted`.
 *   - `isMicMuted` reveals the small mic-off pip overlay on the avatar
 *     and flips the mute button's aria-pressed.
 *   - Stop button uses the icon-only variant by default; pass
 *     `stopVariant="icon-label"` to render with a trailing "Stop"
 *     label (the cook surface before this refactor used that).
 */
export type VoiceAvatarState = 'muted' | 'speaking' | 'listening' | 'idle';

export interface VoiceFooterProps {
  /** Source URL for the circular Jamie avatar. */
  avatarSrc: string;
  /** Drives the glow ring around the avatar. */
  avatarState: VoiceAvatarState;
  /** Current mute state (used for aria + the mic-off pip). */
  isMicMuted: boolean;
  /** Called when the user taps the avatar to toggle mute. */
  onToggleMute: () => void;
  /** Called when the user taps the primary stop control. */
  onStop: () => void;
  /** Accessible label + tooltip text for the stop button. */
  stopLabel?: string;
  /** Extra tooltip detail surfaced on the stop button (avatar state). */
  stopDetail?: string;
  /** Choose the stop button chrome — icon-only vs icon+label. */
  stopVariant?: 'icon' | 'icon-label';

  /** Optional secondary action rendered on the left (e.g. "back to chat"). */
  ghostAction?: {
    icon?: React.ReactNode;
    onClick: () => void;
    ariaLabel: string;
  };

  className?: string;
}

export function VoiceFooter({
  avatarSrc,
  avatarState,
  isMicMuted,
  onToggleMute,
  onStop,
  stopLabel = 'Stop',
  stopDetail,
  stopVariant = 'icon',
  ghostAction,
  className,
}: VoiceFooterProps) {
  return (
    <div
      className={
        'jamie-voice-footer' + (className ? ` ${className}` : '')
      }
    >
      <div className="jamie-voice-footer-row">
        {ghostAction ? (
          <button
            type="button"
            className="jamie-voice-ghost-button"
            onClick={ghostAction.onClick}
            aria-label={ghostAction.ariaLabel}
          >
            {ghostAction.icon ?? <MessageCircle className="size-5" />}
          </button>
        ) : (
          /* Keep the slot so flex justify-between still balances. */
          <span className="jamie-voice-ghost-button" aria-hidden="true" />
        )}

        {/*
         * Avatar doubles as the mute toggle. The glow ring encodes
         * conversational state (speaking/listening/muted/idle) via
         * the `data-state` selector in index.css — no JS drives the
         * animation, it's pure CSS.
         */}
        <button
          type="button"
          className="jamie-voice-avatar-wrap"
          data-state={avatarState}
          onClick={onToggleMute}
          aria-pressed={isMicMuted}
          aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          <span className="jamie-voice-avatar-glow" aria-hidden="true" />
          <img src={avatarSrc} alt="" className="jamie-voice-avatar" />
          {isMicMuted && (
            <span className="jamie-voice-avatar-mute-pip" aria-hidden="true">
              <MicOff className="size-3.5" strokeWidth={2.25} />
            </span>
          )}
        </button>

        <button
          type="button"
          className="jamie-voice-stop-button"
          data-variant={stopVariant}
          onClick={onStop}
          title={stopDetail ?? stopLabel}
          aria-label={stopLabel}
        >
          <Square
            className={stopVariant === 'icon-label' ? 'size-3.5' : 'size-4'}
            fill="currentColor"
          />
          {stopVariant === 'icon-label' && (
            <span className="jamie-voice-stop-button__label">{stopLabel}</span>
          )}
        </button>
      </div>
    </div>
  );
}

export default VoiceFooter;
