import React, { type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { JamieHeart } from './JamieHeart';
import type { VoiceRichPreview } from './voiceRichCard';

export interface VoiceRichCardShellProps {
  preview: VoiceRichPreview;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isStreaming?: boolean;
  children: ReactNode;
}

export function VoiceRichCardShell({
  preview,
  isExpanded,
  onToggleExpand,
  isStreaming = false,
  children,
}: VoiceRichCardShellProps) {
  if (!isExpanded) {
    return (
      <button
        type="button"
        className="voice-rich-card-preview"
        data-voice-expandable-card="true"
        data-voice-interactive="true"
        onClick={onToggleExpand}
        aria-expanded={false}
        aria-label={`Expand ${preview.title}`}
      >
        <span className="voice-rich-card-preview__media" aria-hidden="true">
          {preview.thumbnailUrl ? (
            <img src={preview.thumbnailUrl} alt="" />
          ) : (
            <span className="voice-rich-card-preview__emoji">
              {preview.emoji ?? '💚'}
            </span>
          )}
        </span>
        <span className="voice-rich-card-preview__copy">
          <span className="voice-rich-card-preview__title">{preview.title}</span>
          {preview.chips.length > 0 && (
            <span className="voice-rich-card-preview__chips">
              {preview.chips.map((chip) => (
                <span key={chip} className="jamie-chip">
                  {chip}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="voice-rich-card-preview__expand">
          <ChevronDown size={18} aria-hidden="true" />
          <span>Expand</span>
        </span>
      </button>
    );
  }

  const showCollapse = !isStreaming;

  return (
    <div
      className="voice-rich-card"
      data-voice-expandable-card="true"
    >
      <div className="voice-rich-card__header">
        <div className="jamie-thread-speaker voice-rich-card__speaker">
          <JamieHeart className="jamie-thread-speaker__heart" />
          <span>Jamie</span>
        </div>
        {showCollapse && (
          <button
            type="button"
            className="voice-rich-card__collapse"
            data-voice-interactive="true"
            onClick={onToggleExpand}
            aria-expanded
            aria-label="Collapse card"
          >
            <ChevronUp size={18} aria-hidden="true" />
            <span>Collapse</span>
          </button>
        )}
      </div>
      <div className="voice-rich-card__body">{children}</div>
    </div>
  );
}
