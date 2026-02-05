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
import { Mic, MicOff, Loader2, Volume2, X, Square, Play } from 'lucide-react';
import type { VoiceChatState } from '../hooks/useVoiceChat';

/**
 * VoicePausedBanner - Standard banner when voice was paused (e.g. user left the app).
 * Matches VoiceModeIndicator styling: same strip look, jamie-primary palette, pill action.
 */
export interface VoicePausedBannerProps {
  onResume: () => void;
  className?: string;
}

export function VoicePausedBanner({ onResume, className = '' }: VoicePausedBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex items-center justify-between w-full gap-3 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <MicOff
            size={20}
            style={{ color: 'var(--jamie-primary-dark, #327179)' }}
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className="text-xs font-medium uppercase tracking-wide"
            style={{
              fontFamily: 'var(--font-display, Poppins, sans-serif)',
              color: 'var(--jamie-primary-dark, #327179)',
            }}
          >
            Voice paused
          </span>
          <span
            className="text-sm truncate"
            style={{
              fontFamily: 'var(--font-body, Inter, sans-serif)',
              color: 'var(--jamie-text-muted, #5d5d5d)',
            }}
          >
            Tap the mic or Continue to talk to Jamie again.
          </span>
        </div>
      </div>
      <motion.button
        type="button"
        onClick={onResume}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 hover:bg-[var(--jamie-primary,#46BEA8)] hover:text-white transition-colors shrink-0"
        style={{ fontFamily: 'var(--font-display, Poppins, sans-serif)' }}
        whileTap={{ scale: 0.98 }}
      >
        <Play size={12} fill="currentColor" />
        <span className="text-xs font-medium">Continue</span>
      </motion.button>
    </motion.div>
  );
}

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

  const showCancelButton = state === 'processing' || state === 'speaking';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`flex items-center justify-between w-full ${className}`}
      >
        <div className="flex items-center gap-3">
          {/* State Icon */}
          <div className="relative">
            {state === 'listening' && (
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

            {state === 'speaking' && (
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
          <div className="flex flex-col">
            <span
              className="text-xs font-medium uppercase tracking-wide"
              style={{
                fontFamily: 'var(--font-display, Poppins, sans-serif)',
                color: state === 'listening'
                  ? 'var(--jamie-primary, #46BEA8)'
                  : state === 'speaking'
                    ? 'var(--jamie-primary, #46BEA8)'
                    : 'var(--jamie-primary-dark, #327179)'
              }}
            >
              {state === 'listening' && 'Listening...'}
              {state === 'processing' && 'Thinking...'}
              {state === 'speaking' && 'Jamie is speaking'}
            </span>

            {/* Show transcript while listening */}
            {state === 'listening' && transcript && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm italic max-w-[200px] truncate"
                style={{
                  fontFamily: 'var(--font-body, Inter, sans-serif)',
                  color: 'var(--jamie-text-muted, #5d5d5d)'
                }}
              >
                "{transcript}"
              </motion.span>
            )}
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 hover:bg-[var(--jamie-primary,#46BEA8)] hover:text-white transition-colors"
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
              className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-black/5 transition-colors"
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
 * VoiceModeButton - Toggle button for voice mode
 */
interface VoiceModeButtonProps {
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
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || isConnecting}
      className={`
        relative flex items-center justify-center
        w-10 h-10 rounded-full
        transition-colors duration-200
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      style={{
        backgroundColor: isActive ? 'var(--jamie-primary, #46BEA8)' : '#E5E5E5',
        color: isActive ? '#FFFFFF' : '#A3A3A3',
      }}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: disabled ? 1 : 1.05 }}
    >
      {isConnecting ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 size={20} />
        </motion.div>
      ) : isActive ? (
        <MicOff size={20} />
      ) : (
        <Mic size={20} />
      )}

      {/* Active indicator ring */}
      {isActive && !isConnecting && (
        <motion.div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: 'var(--jamie-primary, #46BEA8)' }}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
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
        rounded-full border border-black/10
        bg-white hover:bg-black/5
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
