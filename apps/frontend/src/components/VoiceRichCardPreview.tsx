import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { VoiceRichCardPreviewData } from '../lib/voiceRichCard';

interface VoiceRichCardPreviewProps {
  preview: VoiceRichCardPreviewData;
  onExpand?: () => void;
  interactive?: boolean;
}

/**
 * Compact preview bubble for collapsed voice-mode rich cards.
 * Fits in the 3-card stack like a talking bubble.
 */
export function VoiceRichCardPreview({
  preview,
  onExpand,
  interactive = true,
}: VoiceRichCardPreviewProps) {
  const content = (
    <>
      <div className="voice-rich-preview__leading" aria-hidden="true">
        {preview.imageUrl ? (
          <img
            src={preview.imageUrl}
            alt=""
            className="voice-rich-preview__thumb"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="voice-rich-preview__emoji">{preview.emoji}</span>
        )}
      </div>
      <div className="voice-rich-preview__body">
        <p className="voice-rich-preview__title">{preview.title}</p>
        {preview.subtitle && (
          <p className="voice-rich-preview__subtitle">{preview.subtitle}</p>
        )}
        {preview.chips.length > 0 && (
          <ul className="voice-rich-preview__chips" aria-label="Recipe details">
            {preview.chips.map((chip) => (
              <li key={chip} className="recipe-meta-chip">
                {chip}
              </li>
            ))}
          </ul>
        )}
      </div>
      {interactive && onExpand && (
        <span className="voice-rich-preview__expand" aria-hidden="true">
          <ChevronDown size={18} />
        </span>
      )}
    </>
  );

  if (interactive && onExpand) {
    return (
      <button
        type="button"
        className="voice-rich-preview"
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
        aria-label={`Expand ${preview.title}`}
        data-voice-interactive="true"
      >
        {content}
      </button>
    );
  }

  return <div className="voice-rich-preview voice-rich-preview--static">{content}</div>;
}
