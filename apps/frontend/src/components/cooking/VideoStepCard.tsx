import React from 'react';
import { Play } from 'lucide-react';
import './VideoStepCard.css';

/**
 * VideoStepCard — list row shown in the RecipeModal's Videos tab
 * (see Jamie_07). Same visual surface as VideoClipCard (thumb + play
 * button), but with a two-line label: a small "Step N" kicker stacked
 * above the step title. Used for the pre-cook step preview list.
 *
 * Deliberately separate from VideoClipCard so each has a clean, minimal
 * API that maps exactly to one mock. Sharing styles via CSS is fine;
 * sharing a single component would force a prop union that confuses
 * the call-site.
 */
export interface VideoStepCardProps {
  stepNumber: number;
  title: string;
  thumbnailUrl?: string;
  onPlay: () => void;
  className?: string;
}

export function VideoStepCard({
  stepNumber,
  title,
  thumbnailUrl,
  onPlay,
  className,
}: VideoStepCardProps) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={'jamie-video-step' + (className ? ` ${className}` : '')}
      aria-label={`Play step ${stepNumber}: ${title}`}
    >
      <span
        className="jamie-video-step__thumb"
        style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})` } : undefined}
        aria-hidden="true"
      />
      <span className="jamie-video-step__labels">
        <span className="jamie-video-step__kicker">Step {stepNumber}</span>
        <span className="jamie-video-step__title">{title}</span>
      </span>
      <span className="jamie-video-step__play" aria-hidden="true">
        <Play size={14} fill="currentColor" />
      </span>
    </button>
  );
}

export default VideoStepCard;
