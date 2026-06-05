import React from 'react';
import { motion } from 'motion/react';
import { JamieHeart } from './JamieHeart';

export interface VoiceThinkingBubbleProps {
  /** Optional microcopy; omitted by default for a calm, non-technical feel. */
  label?: string;
  className?: string;
}

/**
 * Subtle "forming" state inside Jamie's voice-mode bubble — three breathing
 * dots under the speaker badge while the response has not arrived yet.
 */
export function VoiceThinkingBubble({ label, className = '' }: VoiceThinkingBubbleProps) {
  return (
    <motion.div
      className={`jamie-voice-thinking${className ? ` ${className}` : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? 'Jamie is preparing a reply'}
    >
      <div className="jamie-thread-speaker">
        <JamieHeart className="jamie-thread-speaker__heart" />
        <span>Jamie</span>
      </div>

      <div className="jamie-voice-thinking__body">
        <span className="jamie-voice-thinking__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {label ? (
          <span className="jamie-voice-thinking__label">{label}</span>
        ) : null}
      </div>
    </motion.div>
  );
}

export default VoiceThinkingBubble;
