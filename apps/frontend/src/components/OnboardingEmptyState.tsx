import React from 'react';
import { motion } from 'motion/react';
import { AvatarWithOrganicGlow } from '../design-system/components/AvatarWithOrganicGlow';
import { TalkToJamiePillButton, type TalkToJamiePillState } from './TalkToJamiePillButton';
// @ts-expect-error - Vite resolves figma:asset imports
import jamieAvatarLarge from 'figma:asset/9998d3c8aa18fde4e634353cc1af4c783bd57297.png';

/**
 * Onboarding (empty-state) block for ChatView.
 *
 * Voice-first hierarchy:
 *   1. Jamie avatar + greeting (identity)
 *   2. Large "Tap to talk" voice CTA (primary action)
 *   3. "or ask by text" divider
 *   4. Starter text-prompt chips (secondary action)
 *
 * The voice button is deliberately the most prominent element so new
 * users immediately understand this is a voice-first experience.
 * Text prompts stay available as a clear fallback, separated by a
 * subtle "or" divider so neither option feels hidden.
 */

const CONTENT_MAX_WIDTH = 360;

const STARTERS = [
  'What can I cook in 20 minutes?',
  'Help me use up some chicken thighs',
  'Something comforting for tonight',
  'Plan a dinner party for friends',
] as const;

type VoiceButtonState = TalkToJamiePillState;

interface OnboardingEmptyStateProps {
  /** Called when a starter chip is tapped — forwards the chip text. */
  onStart: (prompt: string) => void;
  /** Activates voice mode when the primary voice CTA is tapped. */
  onVoiceStart?: () => void;
  /**
   * Reflects the live connection state so the button can transition from
   * "Tap to talk" → "Connecting…" → "Listening…" without leaving the
   * onboarding screen (the screen stays mounted until the first message).
   * Defaults to 'idle'.
   */
  voiceState?: VoiceButtonState;
  /** Override starter prompts for A/B testing. */
  starters?: readonly string[];
}

export function OnboardingEmptyState({
  onStart,
  onVoiceStart,
  voiceState = 'idle',
  starters = STARTERS,
}: OnboardingEmptyStateProps) {
  return (
    <div className="jamie-scroll-area">
      <div className="jamie-shell-width">
        <div className="jamie-surface-panel jamie-onboarding-panel relative z-10 px-5 py-7">

          {/* ── Avatar + Greeting ───────────────────────────────────── */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            className="jamie-onboarding-hero flex flex-col items-center mb-8"
          >
            <AvatarWithOrganicGlow
              src={jamieAvatarLarge}
              alt="Jamie Oliver"
              size={147}
              state="idle"
              muted
            />

            <motion.h1
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.18, duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              style={{
                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                fontWeight: 400,
                fontSize: '26px',
                lineHeight: '40px',
                color: 'var(--jamie-text-heading, #3D6E6C)',
                textAlign: 'center',
                marginTop: '24px',
                marginBottom: 0,
              }}
            >
              I&rsquo;m Jamie Oliver.
            </motion.h1>

            <motion.p
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.28, duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              style={{
                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                fontWeight: 400,
                fontSize: '16px',
                lineHeight: '28px',
                color: 'var(--jamie-text-body, #234252)',
                textAlign: 'center',
                margin: '8px 0 0',
              }}
            >
              Find the recipe, nail every step, hands free.
              <br />
              What are we cooking?
            </motion.p>
          </motion.div>

          {/* ── Primary voice CTA ───────────────────────────────────── */}
          {onVoiceStart && (
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.36, duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              className="jamie-onboarding-voice flex flex-col items-center mb-6"
            >
              <TalkToJamiePillButton
                state={voiceState}
                onClick={onVoiceStart}
                disabled={voiceState === 'connecting'}
              />
            </motion.div>
          )}

          {/* ── "or" divider ────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.44, duration: 0.4 }}
            className="jamie-onboarding-divider flex items-center mx-auto mb-5"
            style={{ maxWidth: `${CONTENT_MAX_WIDTH}px`, width: '100%', gap: '12px' }}
          >
            <span
              style={{
                flex: 1,
                height: '1px',
                background: 'rgba(61, 110, 108, 0.12)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                fontSize: '13px',
                color: 'var(--jamie-text-muted, #7a9090)',
                whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
              }}
            >
              or ask by text
            </span>
            <span
              style={{
                flex: 1,
                height: '1px',
                background: 'rgba(61, 110, 108, 0.12)',
              }}
            />
          </motion.div>

          {/* ── Text starter chips (secondary) ──────────────────────── */}
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.48, duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            className="flex flex-col items-center gap-3 mb-2 mx-auto"
            style={{ maxWidth: CONTENT_MAX_WIDTH }}
          >
            {starters.map((prompt, index) => (
              <motion.button
                key={prompt}
                onClick={() => onStart(prompt)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.52 + index * 0.05,
                  duration: 0.35,
                  ease: [0.32, 0.72, 0, 1],
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full text-left transition-colors"
                style={{
                  minHeight: '50px',
                  padding: '12px 18px 12px 24px',
                  borderRadius: '200px',
                  border: '1px solid rgba(61, 110, 108, 0.14)',
                  background: 'rgba(255, 255, 255, 0.80)',
                  fontFamily: 'var(--font-display, Poppins, sans-serif)',
                  fontSize: '15px',
                  lineHeight: 1.5,
                  color: 'var(--jamie-text-body, #234252)',
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: '0 6px 16px rgba(35, 66, 82, 0.05)',
                  maxWidth: `${CONTENT_MAX_WIDTH}px`,
                  width: '100%',
                  cursor: 'pointer',
                }}
              >
                {prompt}
              </motion.button>
            ))}
          </motion.div>

        </div>
      </div>
    </div>
  );
}

export default OnboardingEmptyState;
