import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { JamieHeart } from '../JamieHeart';
import './JamieNarrationCard.css';

/**
 * JamieNarrationCard — Jamie's spoken instruction for the current
 * step, rendered as a quiet card with the brand heart + JAMIE speaker
 * label and the instruction body (supports light markdown).
 *
 * When the instruction overflows the card's max height, the body gets
 * a soft bottom fade mask — matches Jamie_12 where a long instruction
 * is visually trimmed rather than pushed into a scrollbar.
 *
 * The max height is intentionally CSS-driven via `--jamie-narration-max`
 * so CookWithJamie can tune it per layout without prop-drilling.
 */
export interface JamieNarrationCardProps {
  /** Instruction body. Treated as markdown, fallback-safe for plain text. */
  text: string;
  /**
   * Optional speaker label override. Defaults to "JAMIE" — kept as a
   * prop in case we ever localize or want "CHEF" in admin contexts.
   */
  speakerLabel?: string;
  className?: string;
}

export function JamieNarrationCard({
  text,
  speakerLabel = 'JAMIE',
  className,
}: JamieNarrationCardProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  /*
   * The bottom fade mask is only applied when the body actually
   * overflows its max-height. Otherwise the gradient eats the last
   * line of short instructions for no reason.
   */
  const recomputeOverflow = () => {
    const el = bodyRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  };

  useLayoutEffect(() => {
    recomputeOverflow();
  }, [text]);

  useEffect(() => {
    const onResize = () => recomputeOverflow();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className={'jamie-narration' + (className ? ` ${className}` : '')}>
      <div className="jamie-narration__head">
        <JamieHeart className="jamie-narration__heart" />
        <span className="jamie-narration__speaker">{speakerLabel}</span>
      </div>

      <div
        ref={bodyRef}
        className="jamie-narration__body"
        data-overflowing={overflowing || undefined}
      >
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="jamie-narration__p">{children}</p>,
            strong: ({ children }) => (
              <strong className="jamie-narration__strong">{children}</strong>
            ),
            em: ({ children }) => <em>{children}</em>,
            ul: ({ children }) => <ul className="jamie-narration__list">{children}</ul>,
            ol: ({ children }) => <ol className="jamie-narration__list">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default JamieNarrationCard;
