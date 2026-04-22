import React from 'react';
import { motion } from 'motion/react';
import { AvatarWithOrganicGlow } from '../design-system/components/AvatarWithOrganicGlow';
import jamieAvatarLarge from 'figma:asset/9998d3c8aa18fde4e634353cc1af4c783bd57297.png';

/**
 * Onboarding (empty-state) block for ChatView.
 *
 * This is the refresh of the "before any messages" hero content to match
 * the Figma_02 spec:
 *   - Hero avatar, 147px, with the organic glow (state=idle, mic muted)
 *   - "I'm Jamie Oliver." heading, Poppins 26px/400, teal-dark
 *   - "What are we cooking?" subtitle, Poppins 16px/400, body color
 *   - 4 starter chips, 54px tall, #d8e2e2 border, pill radius 200
 *
 * Usage: replace the current `!hasMessages && !isTyping` branch in
 * ChatView.tsx with a call to <OnboardingEmptyState onStart={handleSendMessage} />.
 *
 * Copy (per our decision):
 *   Heading:      "I'm Jamie Oliver."
 *   Subtitle:     "Find the recipe, nail every step, hands free.
 *                  What are we cooking?"
 *   Starters:     Four phrasings the user will actually send to Jamie
 *                 when tapped. Each one probes a different capability:
 *                 time constraint, specific cuisine, ingredient-based
 *                 search, and multi-meal planning — so taps reveal the
 *                 agent's range.
 */

const CONTENT_MAX_WIDTH = 600;

const STARTERS = [
  'What can I cook in 30 minutes?',
  'A simple pasta for tonight',
  "What can I make with chicken thighs?",
  'Plan my dinners for the week',
] as const;

interface OnboardingEmptyStateProps {
  /** Called when a starter chip is tapped. Forwards the chip text. */
  onStart: (prompt: string) => void;
  /** Override starter prompts if the product team wants to A/B test. */
  starters?: readonly string[];
}

export function OnboardingEmptyState({
  onStart,
  starters = STARTERS,
}: OnboardingEmptyStateProps) {
  return (
    <div className="jamie-scroll-area">
      <div className="jamie-shell-width">
        <div className="jamie-surface-panel relative z-10 px-5 py-7">
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            className="flex flex-col items-center mb-8"
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
              transition={{
                delay: 0.18,
                duration: 0.5,
                ease: [0.32, 0.72, 0, 1],
              }}
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
              transition={{
                delay: 0.28,
                duration: 0.5,
                ease: [0.32, 0.72, 0, 1],
              }}
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

          {/* Starter chips */}
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.38,
              duration: 0.5,
              ease: [0.32, 0.72, 0, 1],
            }}
            className="flex flex-col items-center gap-3 mb-6 mx-auto"
            style={{ maxWidth: CONTENT_MAX_WIDTH }}
          >
            {starters.map((prompt, index) => (
              <motion.button
                key={prompt}
                onClick={() => onStart(prompt)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.42 + index * 0.06,
                  duration: 0.4,
                  ease: [0.32, 0.72, 0, 1],
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full text-left transition-colors"
                style={{
                  minHeight: '54px',
                  padding: '14px 18px 14px 28px',
                  borderRadius: '200px',
                  border: '1px solid rgba(61, 110, 108, 0.14)',
                  background: 'rgba(255, 255, 255, 0.94)',
                  fontFamily: 'var(--font-display, Poppins, sans-serif)',
                  fontSize: '16px',
                  lineHeight: 1.5,
                  color: 'var(--jamie-text-body, #234252)',
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: '0 10px 24px rgba(35, 66, 82, 0.06)',
                  maxWidth: '360px',
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
