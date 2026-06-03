import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowDown, ChevronUp } from 'lucide-react';
import './VoiceModeRoller.css';

/**
 * Shape of messages the roller understands. Intentionally minimal —
 * matches the essential fields from `Message` in ChatView.tsx so the
 * roller stays independent of the full Message interface.
 */
export interface RollerMessage {
  id: string;
  type: 'user' | 'jamie';
  content: string;
  /** True while a message is actively streaming. Top slot locks during streaming. */
  isStreaming?: boolean;
  /** Rich payload (carousel, meal plan, etc.) — eligible for expand/collapse. */
  voiceExpandable?: boolean;
}

export interface RollerRenderContext {
  role: StackRole;
  /** True when this card is expanded in the top slot (always false for middle/back). */
  expanded: boolean;
  /** Toggle expand/collapse for rich cards on the top slot. */
  onToggleExpand: () => void;
}

export interface VoiceModeRollerProps {
  /**
   * Full conversation history (same order as your chat feed:
   * oldest first, newest last).
   */
  messages: RollerMessage[];
  /**
   * Render function for each message. Receives the message and the stack
   * role ("top" | "middle" | "back"). The roller handles sizing/blur
   * at the card-container level; your renderer handles speaker badge,
   * text, tool payloads, etc.
   *
   * The returned ReactNode should render the CARD CONTENTS — the roller
   * supplies the white card wrapper, padding, rounded corners, and shadow.
   */
  renderMessage: (
    message: RollerMessage,
    context: RollerRenderContext,
  ) => ReactNode;
  /**
   * Called when the user clicks a deeper card or swipes — informational only,
   * the roller owns its own offset state. Useful for analytics.
   */
  onOffsetChange?: (offset: number) => void;
  /** Extra classes on the roller wrapper. */
  className?: string;
}

export type StackRole = 'top' | 'middle' | 'back';

const SWIPE_THRESHOLD_PX = 40;
const SWIPE_FOLLOW_RATIO = 0.3;

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[data-voice-interactive="true"]',
].join(', ');

/**
 * Voice-mode conversation roller.
 *
 * Shows a 3-card window into the conversation history as a stacked pile.
 * Newest-visible card is on top, full-size and sharp. Two older cards sit
 * behind at 320px / 300px widths with progressive blur.
 *
 * Navigation:
 *   - Tap middle card  → scroll 1 step deeper into history
 *   - Tap back card    → scroll 2 steps deeper
 *   - Swipe down on top card → scroll 1 step deeper
 *   - Swipe up on top card   → scroll 1 step back toward newest
 *   - Rubber-band bounce at both boundaries
 *   - New-message indicator if user scrolled away when a new message arrives
 *
 * Streaming:
 *   The active streaming message locks the top slot — navigation is disabled
 *   while `messages[messages.length - 1].isStreaming` is true. Prevents the
 *   user losing a response mid-generation.
 */
export function VoiceModeRoller({
  messages,
  renderMessage,
  onOffsetChange,
  className,
}: VoiceModeRollerProps) {
  const [offset, setOffset] = useState(0);
  const [unseenIds, setUnseenIds] = useState<Set<string>>(new Set());
  const [dragDelta, setDragDelta] = useState(0);
  const [isBouncing, setIsBouncing] = useState<'top' | 'bottom' | null>(null);
  const [isTallTopCard, setIsTallTopCard] = useState(false);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const prevTopVisibleIdRef = useRef<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const lastSeenTailIdRef = useRef<string | null>(null);
  const latestTailIdRef = useRef<string | null>(null);
  const topCardBodyRef = useRef<HTMLDivElement | null>(null);

  const isStreamingActive = useMemo(() => {
    const last = messages[messages.length - 1];
    return Boolean(last?.isStreaming);
  }, [messages]);

  const maxOffset = useMemo(
    () => Math.max(0, messages.length - 3),
    [messages.length],
  );

  const visibleWindow = useMemo<Array<RollerMessage | null>>(() => {
    const endIdx = messages.length - offset;
    const startIdx = Math.max(0, endIdx - 3);
    const slice: Array<RollerMessage | null> = messages.slice(startIdx, endIdx);
    while (slice.length < 3) slice.unshift(null);
    return slice;
  }, [messages, offset]);

  const topVisibleMessage = visibleWindow[2];
  const topVisibleId = topVisibleMessage?.id ?? null;
  const hasExpandableTopCard = Boolean(topVisibleMessage?.voiceExpandable);
  const isExpandedTopCard = Boolean(
    hasExpandableTopCard && expandedMessageId && expandedMessageId === topVisibleId,
  );

  // Detect new messages arriving while scrolled away from the tail.
  // Keyed on message IDs — safe against streaming chunks updating a single
  // message's content (id stays the same).
  useEffect(() => {
    const tailId = messages[messages.length - 1]?.id ?? null;
    if (offset === 0) {
      lastSeenTailIdRef.current = tailId;
      if (unseenIds.size > 0) setUnseenIds(new Set());
      return;
    }
    // We're scrolled away. Any IDs past the last seen tail are unseen.
    if (!lastSeenTailIdRef.current) {
      lastSeenTailIdRef.current = tailId;
      return;
    }
    const lastSeenIdx = messages.findIndex(
      (m) => m.id === lastSeenTailIdRef.current,
    );
    if (lastSeenIdx === -1) return;
    const unseen = messages.slice(lastSeenIdx + 1).map((m) => m.id);
    if (unseen.length > 0) {
      const next = new Set(unseen);
      // Avoid re-renders when the set content is unchanged.
      if (
        next.size !== unseenIds.size ||
        unseen.some((id) => !unseenIds.has(id))
      ) {
        setUnseenIds(next);
      }
    }
  }, [messages, offset, unseenIds]);

  const setOffsetWithNotification = useCallback(
    (nextOffset: number) => {
      setOffset(nextOffset);
      onOffsetChange?.(nextOffset);
    },
    [onOffsetChange],
  );

  const triggerBounce = useCallback((edge: 'top' | 'bottom') => {
    setIsBouncing(edge);
    window.setTimeout(() => setIsBouncing(null), 320);
  }, []);

  const scrollTo = useCallback(
    (nextOffset: number) => {
      if (isStreamingActive) return;
      if (nextOffset < 0) {
        triggerBounce('bottom');
        return;
      }
      if (nextOffset > maxOffset) {
        triggerBounce('top');
        return;
      }
      if (nextOffset === offset) return;
      setOffsetWithNotification(nextOffset);
    },
    [isStreamingActive, maxOffset, offset, setOffsetWithNotification, triggerBounce],
  );

  const jumpToNewest = useCallback(() => {
    setOffsetWithNotification(0);
  }, [setOffsetWithNotification]);

  // --- Pointer drag on the top card ---
  const dragStateRef = useRef<{
    startY: number;
    pointerId: number | null;
    active: boolean;
  }>({ startY: 0, pointerId: null, active: false });

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (isStreamingActive || isExpandedTopCard) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(INTERACTIVE_SELECTOR)) {
        return;
      }
      dragStateRef.current = {
        startY: e.clientY,
        pointerId: e.pointerId,
        active: true,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isExpandedTopCard, isStreamingActive],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragStateRef.current;
      if (!d.active) return;
      const delta = e.clientY - d.startY;
      if (Math.abs(delta) > 4) setDragDelta(delta * SWIPE_FOLLOW_RATIO);
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragStateRef.current;
      if (!d.active) return;
      const raw = e.clientY - d.startY;
      dragStateRef.current = { startY: 0, pointerId: null, active: false };
      setDragDelta(0);

      if (raw > SWIPE_THRESHOLD_PX) {
        // Dragged down → older messages.
        scrollTo(offset + 1);
      } else if (raw < -SWIPE_THRESHOLD_PX) {
        // Dragged up → newer messages.
        scrollTo(offset - 1);
      }
    },
    [offset, scrollTo],
  );

  const handlePointerCancel = useCallback(() => {
    dragStateRef.current = { startY: 0, pointerId: null, active: false };
    setDragDelta(0);
  }, []);

  /*
   * Mouse-wheel / trackpad navigation.
   *
   * Desktop users reach for the wheel before they think to click-and-drag.
   * The voice stage allows `touch-action: pan-y` so the inner card can scroll
   * on touch devices; on laptop, this wheel handler still moves the stack
   * (without it, navigation feels frozen when the outer stage does not scroll).
   *
   * We coalesce fast scroll deltas with a throttle ref — one wheel burst
   * should move exactly one step in the stack. Horizontal wheels (e.g.
   * Magic Mouse side scrolling) are ignored.
   */
  const wheelLockRef = useRef<number>(0);
  const canScrollTopBody = useCallback((target: EventTarget | null, deltaY: number) => {
    const body = topCardBodyRef.current;
    const targetNode = target instanceof Node ? target : null;
    if (!body || !targetNode || !body.contains(targetNode)) {
      return false;
    }

    const maxScrollTop = body.scrollHeight - body.clientHeight;
    if (maxScrollTop <= 1) {
      return false;
    }

    if (deltaY > 0) {
      return body.scrollTop < maxScrollTop - 1;
    }

    return body.scrollTop > 1;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (isStreamingActive) return;
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      if (Math.abs(e.deltaY) < 4) return;
      if (canScrollTopBody(e.target, e.deltaY)) return;
      if (isExpandedTopCard) return;
      const now = Date.now();
      if (now - wheelLockRef.current < 280) return;
      wheelLockRef.current = now;
      if (e.deltaY > 0) {
        scrollTo(offset + 1);
      } else {
        scrollTo(offset - 1);
      }
    },
    [canScrollTopBody, isExpandedTopCard, isStreamingActive, offset, scrollTo],
  );

  const unseenCount = unseenIds.size;
  const showNewBadge = offset > 0 && unseenCount > 0;

  const handleCollapseTop = useCallback(() => {
    setExpandedMessageId(null);
  }, []);

  const handleToggleExpandForMessage = useCallback((messageId: string) => {
    setExpandedMessageId((current) => (current === messageId ? null : messageId));
  }, []);

  const recomputeTopCardLayout = useCallback(() => {
    const el = topCardBodyRef.current;
    if (!el || typeof window === 'undefined') {
      setIsTallTopCard(false);
      return;
    }
    const availableBeforeCompression = Math.max(320, window.innerHeight - 420);
    setIsTallTopCard(el.scrollHeight > availableBeforeCompression);
  }, []);

  useLayoutEffect(() => {
    recomputeTopCardLayout();
  }, [topVisibleId, recomputeTopCardLayout]);

  useEffect(() => {
    const el = topCardBodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      recomputeTopCardLayout();
    });
    observer.observe(el);

    const handleResize = () => recomputeTopCardLayout();
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [topVisibleId, recomputeTopCardLayout]);

  // Explicit expand: rich cards open expanded when they arrive at the top slot.
  useEffect(() => {
    if (!topVisibleId) {
      setExpandedMessageId(null);
      prevTopVisibleIdRef.current = null;
      return;
    }

    if (prevTopVisibleIdRef.current !== topVisibleId) {
      prevTopVisibleIdRef.current = topVisibleId;
      if (hasExpandableTopCard) {
        setExpandedMessageId(topVisibleId);
      } else {
        setExpandedMessageId(null);
      }
    }
  }, [hasExpandableTopCard, topVisibleId]);

  useEffect(() => {
    const tailId = messages[messages.length - 1]?.id ?? null;
    if (!tailId) {
      latestTailIdRef.current = null;
      return;
    }
    if (!latestTailIdRef.current) {
      latestTailIdRef.current = tailId;
      return;
    }
    if (latestTailIdRef.current !== tailId) {
      latestTailIdRef.current = tailId;
      if (offset !== 0) {
        setOffsetWithNotification(0);
      }
    }
  }, [messages, offset, setOffsetWithNotification]);

  useEffect(() => {
    topCardBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [topVisibleId]);

  return (
    <div
      ref={stageRef}
      className={'voice-roller' + (className ? ` ${className}` : '')}
      data-bounce={isBouncing ?? undefined}
      data-streaming={isStreamingActive || undefined}
      data-expanded={isExpandedTopCard || undefined}
      data-tall-top={isTallTopCard || undefined}
      onWheel={handleWheel}
    >
      <AnimatePresence>
        {showNewBadge && (
          <motion.button
            type="button"
            className="voice-roller__new-badge"
            onClick={jumpToNewest}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          >
            <ArrowDown size={12} />
            {unseenCount === 1 ? '1 new' : `${unseenCount} new`}
          </motion.button>
        )}
      </AnimatePresence>

      <div
        className="voice-roller__stack"
        data-expanded={isExpandedTopCard || undefined}
        data-tall-top={isTallTopCard || undefined}
      >
        {visibleWindow.map((msg, i) => {
          if (!msg) return <EmptySlot key={`empty-${i}`} />;
          const role: StackRole = i === 0 ? 'back' : i === 1 ? 'middle' : 'top';
          const isTop = role === 'top';
          const style =
            isTop && dragDelta !== 0
              ? { transform: `translateY(${dragDelta}px)` }
              : undefined;

          const handleClick =
            isExpandedTopCard
              ? undefined
              : role === 'back'
              ? () => scrollTo(offset + 2)
              : role === 'middle'
                ? () => scrollTo(offset + 1)
                : undefined;

          return (
            <div
              key={msg.id}
              className="voice-roller__card"
              data-role={role}
              data-speaker={msg.type}
              style={style}
              onClick={handleClick}
              onPointerDown={isTop && !isExpandedTopCard ? handlePointerDown : undefined}
              onPointerMove={isTop && !isExpandedTopCard ? handlePointerMove : undefined}
              onPointerUp={isTop && !isExpandedTopCard ? handlePointerUp : undefined}
              onPointerCancel={isTop && !isExpandedTopCard ? handlePointerCancel : undefined}
              role={role === 'top' || isExpandedTopCard ? undefined : 'button'}
              tabIndex={role === 'top' || isExpandedTopCard ? -1 : 0}
              aria-label={
                role === 'top'
                  ? undefined
                  : `Scroll to message, ${role === 'back' ? '2 steps' : '1 step'} back`
              }
              onKeyDown={
                handleClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleClick();
                      }
                    }
                  : undefined
              }
            >
              <div
                className="voice-roller__card-content"
                data-role={role}
                data-speaker={msg.type}
                data-voice-interactive={
                  isTop && msg.type === 'jamie' ? 'true' : undefined
                }
              >
                <div
                  className="voice-roller__card-body"
                  ref={isTop ? topCardBodyRef : undefined}
                  data-voice-scroll-owner={
                    isTop && isExpandedTopCard ? 'card-body' : undefined
                  }
                >
                  {isTop && isExpandedTopCard && hasExpandableTopCard && (
                    <div className="voice-roller__collapse-bar">
                      <button
                        type="button"
                        className="voice-roller__collapse-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCollapseTop();
                        }}
                        aria-label="Collapse card"
                        data-voice-interactive="true"
                      >
                        <ChevronUp size={16} aria-hidden="true" />
                        <span>Collapse</span>
                      </button>
                    </div>
                  )}
                  {renderMessage(msg, {
                    role,
                    expanded: isTop && isExpandedTopCard,
                    onToggleExpand: () => handleToggleExpandForMessage(msg.id),
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/*
       * Position within the stack is communicated by the progressive blur and
       * margin-overlap of the cards themselves — no pagination dots needed.
       * The swipe/tap affordances cover navigation.
       */}
    </div>
  );
}

function EmptySlot() {
  return <div className="voice-roller__empty" aria-hidden="true" />;
}

export default VoiceModeRoller;
