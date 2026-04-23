/**
 * VoiceModeIndicator - Visual feedback for voice chat state
 *
 * Shows animated indicators for:
 * - Listening (microphone active, waiting for speech)
 * - Processing (transcribing/thinking)
 * - Speaking (Jamie is responding)
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, AudioLines, Loader2, Volume2, X, Square } from 'lucide-react';
// `Mic` is still used below in the listening indicator (state='listening').
import type { VoiceChatState } from '../hooks/useVoiceChat';

interface VoiceModeIndicatorProps {
  state: VoiceChatState;
  transcript?: string;
  onCancel?: () => void;
  onExit?: () => void;
  className?: string;
}

export function VoiceModeIndicator({
  state,
  transcript,
  onCancel,
  onExit,
  className = ''
}: VoiceModeIndicatorProps) {
  if (state === 'idle' || state === 'connecting') {
    return null;
  }

  const isListeningState = state === 'listening' || state === 'user_speaking';
  const isAssistantSpeakingState = state === 'assistant_speaking' || state === 'barge_in_pending';
  const showCancelButton = state === 'processing' || isAssistantSpeakingState;
  const supportingText =
    isListeningState
      ? transcript
        ? `"${transcript}"`
        : 'Waiting for your voice...'
      : state === 'processing'
        ? 'Working on your request...'
        : state === 'barge_in_pending'
          ? 'Interrupting Jamie...'
        : 'Jamie is responding...';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`flex min-h-[72px] items-center justify-between gap-4 w-full rounded-[24px] border border-[rgba(61,110,108,0.12)] bg-[rgba(255,255,255,0.92)] px-5 py-3 shadow-[0_16px_32px_rgba(35,66,82,0.08)] ${className}`}
      >
        <div className="flex items-center gap-3">
          {/* State Icon */}
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(70,190,168,0.08)]">
            {isListeningState && (
              <motion.div
                className="relative"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Mic
                  size={20}
                  style={{ color: 'var(--jamie-primary, #46BEA8)' }}
                />
                {/* Pulsing ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2"
                  style={{ borderColor: 'var(--jamie-primary, #46BEA8)' }}
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                />
              </motion.div>
            )}

            {state === 'processing' && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2
                  size={20}
                  style={{ color: 'var(--jamie-primary-dark, #327179)' }}
                />
              </motion.div>
            )}

            {isAssistantSpeakingState && (
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Volume2
                  size={20}
                  style={{ color: 'var(--jamie-primary, #46BEA8)' }}
                />
              </motion.div>
            )}
          </div>

          {/* State Label */}
          <div className="flex min-w-0 flex-col justify-center">
            <span
              className="text-xs font-medium tracking-[0.08em]"
              style={{
                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                color: isListeningState
                  ? 'var(--jamie-primary, #46BEA8)'
                  : isAssistantSpeakingState
                    ? 'var(--jamie-primary, #46BEA8)'
                    : 'var(--jamie-primary-dark, #327179)'
              }}
            >
              {isListeningState && 'Listening...'}
              {state === 'processing' && 'Thinking...'}
              {isAssistantSpeakingState && 'Jamie is speaking'}
            </span>

            <motion.span
              key={`${state}:${supportingText}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="min-h-[20px] max-w-[320px] text-sm italic whitespace-nowrap overflow-hidden text-ellipsis"
              style={{
                fontFamily: 'var(--font-body, Inter, sans-serif)',
                color: 'var(--jamie-text-muted, #5d5d5d)'
              }}
            >
              {supportingText}
            </motion.span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Cancel/Stop button - shown during processing or speaking */}
          {showCancelButton && onCancel && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[rgba(61,110,108,0.08)] hover:bg-[var(--jamie-primary,#46BEA8)] hover:text-white transition-colors"
              style={{ fontFamily: 'var(--font-display, Poppins, sans-serif)' }}
            >
              <Square size={12} fill="currentColor" />
              <span className="text-xs font-medium">Stop</span>
            </motion.button>
          )}

          {/* Exit voice mode button - always visible */}
          {onExit && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={onExit}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-[rgba(61,110,108,0.08)] hover:bg-[rgba(61,110,108,0.08)] transition-colors"
              title="Exit voice mode"
            >
              <X size={16} style={{ color: 'var(--jamie-text-muted, #5d5d5d)' }} />
            </motion.button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * VoiceModeButton - Enter / resume voice mode from the composer.
 *
 * States:
 *  • Idle            — solid teal circle, white audio-lines icon. Inviting
 *                      the user to start a voice conversation.
 *  • Connecting      — spinner on the same teal surface (no color swap) so
 *                      the button doesn't "flicker" while mic permission /
 *                      WS setup negotiates.
 *  • Paused by tab   — outlined variant with a breathing ring to signal
 *                      "tap to resume". Icon stays the same — a MicOff
 *                      icon was misleading because the mic isn't disabled,
 *                      the session is just suspended.
 *
 * The component is intentionally hidden while voice mode is fully active
 * (composer collapses) — see ChatView. So we never render a "stop" state
 * here; stopping is owned by the floating voice dock.
 */
interface VoiceModeButtonProps {
  /** True when voice is paused by tab visibility — tap to resume. */
  isActive: boolean;
  isConnecting?: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceModeButton({
  isActive,
  isConnecting = false,
  onClick,
  disabled = false,
  className = '',
}: VoiceModeButtonProps) {
  // Deep teal from the design system (ui-1 `TEAL_DARK`).
  const teal = '#3d6e6c';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || isConnecting}
      aria-label={
        isConnecting
          ? 'Connecting voice'
          : isActive
            ? 'Resume voice conversation'
            : 'Talk to Jamie'
      }
      className={`relative shrink-0 flex items-center justify-center transition-[box-shadow,transform] duration-200 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
      style={{
        /*
         * Inline sizing so the button is guaranteed to be a perfect circle
         * even when the composer flex container tries to stretch it. Tailwind
         * `w-10 h-10 rounded-full` occasionally lost to sibling overrides in
         * the composer pill.
         */
        width: 40,
        height: 40,
        minWidth: 40,
        minHeight: 40,
        borderRadius: '9999px',
        aspectRatio: '1 / 1',
        backgroundColor: teal,
        color: '#FFFFFF',
        padding: 0,
        border: 0,
        boxShadow: isActive
          ? `0 0 0 3px ${teal}2E, 0 6px 14px rgba(35,66,82,0.18)`
          : '0 4px 10px rgba(35,66,82,0.14)',
      }}
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: disabled ? 1 : 1.04 }}
    >
      {isConnecting ? (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="flex"
        >
          <Loader2 size={18} strokeWidth={2.25} />
        </motion.span>
      ) : isActive ? (
        <motion.span
          className="flex"
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <AudioLines size={18} strokeWidth={2.25} />
        </motion.span>
      ) : (
        <AudioLines size={18} strokeWidth={2.25} />
      )}

      {/* Breathing ring while paused — says "I'm waiting for you". */}
      {isActive && !isConnecting && (
        <motion.span
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: '9999px',
            border: `2px solid ${teal}`,
          }}
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 1.45, opacity: 0 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
    </motion.button>
  );
}

/**
 * AudioWaveform - Animated waveform visualization
 */
interface AudioWaveformProps {
  isActive: boolean;
  bars?: number;
  className?: string;
}

export function AudioWaveform({
  isActive,
  bars = 5,
  className = ''
}: AudioWaveformProps) {
  return (
    <div className={`flex items-center gap-0.5 h-5 ${className}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full"
          style={{ backgroundColor: 'var(--jamie-primary, #46BEA8)' }}
          initial={{ height: 4 }}
          animate={isActive ? {
            height: [4, 12 + Math.random() * 8, 4],
          } : { height: 4 }}
          transition={{
            duration: 0.4 + Math.random() * 0.3,
            repeat: isActive ? Infinity : 0,
            delay: i * 0.1,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/**
 * StopGenerationButton - Button to stop streaming text generation
 */
interface StopGenerationButtonProps {
  onClick: () => void;
  className?: string;
}

export function StopGenerationButton({
  onClick,
  className = '',
}: StopGenerationButtonProps) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2
        rounded-full border border-[rgba(61,110,108,0.12)]
        bg-[rgba(255,255,255,0.92)] hover:bg-[rgba(255,255,255,1)]
        transition-colors shadow-sm
        ${className}
      `}
      style={{ fontFamily: 'var(--font-display, Poppins, sans-serif)' }}
      whileTap={{ scale: 0.95 }}
    >
      <Square size={14} style={{ color: 'var(--jamie-primary, #46BEA8)', fill: 'var(--jamie-primary, #46BEA8)' }} />
      <span className="text-sm font-medium" style={{ color: 'var(--jamie-text-body, #2c2c2c)' }}>Stop generating</span>
    </motion.button>
  );
}
