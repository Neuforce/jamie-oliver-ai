import React from 'react';
import { motion } from 'motion/react';
import { Mic, Loader2, AudioLines } from 'lucide-react';

export type TalkToJamiePillState = 'idle' | 'connecting' | 'listening' | 'paused';

export interface TalkToJamiePillButtonProps {
  state?: TalkToJamiePillState;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** Stretch to container width (default true). */
  fullWidth?: boolean;
  maxWidth?: number;
}

/**
 * Primary voice CTA — full-width ink-teal pill with icon + label inline.
 * Shared by onboarding and the recipe-modal voice launcher so both surfaces
 * use the same button chrome.
 */
export function TalkToJamiePillButton({
  state = 'idle',
  onClick,
  disabled = false,
  className = '',
  fullWidth = true,
  maxWidth = 360,
}: TalkToJamiePillButtonProps) {
  const isInteractive = state === 'idle' || state === 'paused';
  const ariaLabel =
    state === 'connecting'
      ? 'Connecting voice'
      : state === 'listening'
        ? 'Listening'
        : state === 'paused'
          ? 'Resume voice conversation'
          : 'Talk to Jamie';

  return (
    <motion.button
      type="button"
      onClick={isInteractive && !disabled ? onClick : undefined}
      disabled={disabled || state === 'connecting'}
      aria-label={ariaLabel}
      whileTap={isInteractive && !disabled ? { scale: 0.97 } : {}}
      animate={{
        boxShadow:
          state === 'listening'
            ? [
                '0 12px 32px rgba(61,110,108,0.30), 0 0 0 0px rgba(61,110,108,0.25)',
                '0 12px 32px rgba(61,110,108,0.30), 0 0 0 8px rgba(61,110,108,0.0)',
              ]
            : state === 'paused'
              ? '0 12px 32px rgba(61,110,108,0.30), 0 0 0 3px rgba(61,110,108,0.18)'
              : '0 12px 32px rgba(61,110,108,0.30)',
      }}
      transition={
        state === 'listening'
          ? { duration: 1.2, repeat: Infinity, ease: 'easeOut' }
          : { duration: 0.3 }
      }
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        width: fullWidth ? '100%' : 'auto',
        maxWidth: fullWidth ? `${maxWidth}px` : undefined,
        minHeight: '58px',
        padding: '16px 28px',
        borderRadius: '200px',
        border: 'none',
        background: 'var(--jamie-ink-teal, #3D6E6C)',
        color: '#fff',
        fontFamily: 'var(--font-display, Poppins, sans-serif)',
        fontSize: '17px',
        fontWeight: 600,
        letterSpacing: '0.01em',
        cursor: isInteractive && !disabled ? 'pointer' : 'default',
        opacity: disabled || state === 'connecting' ? 0.72 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {state === 'idle' && (
        <>
          <motion.span
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <Mic size={20} strokeWidth={2.2} />
          </motion.span>
          Tap to talk to Jamie
        </>
      )}

      {state === 'paused' && (
        <>
          <motion.span
            animate={{ opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <AudioLines size={20} strokeWidth={2.2} />
          </motion.span>
          Tap to talk to Jamie
        </>
      )}

      {state === 'connecting' && (
        <>
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <Loader2 size={20} strokeWidth={2.2} />
          </motion.span>
          Connecting…
        </>
      )}

      {state === 'listening' && (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ scaleY: [0.4, 1, 0.4] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.15,
                }}
                style={{
                  display: 'block',
                  width: '3px',
                  height: '18px',
                  borderRadius: '99px',
                  background: '#fff',
                  transformOrigin: 'center',
                }}
              />
            ))}
          </span>
          Listening…
        </>
      )}
    </motion.button>
  );
}
