import React from 'react';
import { Play } from 'lucide-react';
import './VideoClipCard.css';

/**
 * VideoClipCard — tiny per-step video preview shown beside the timer
 * (see Jamie_09). A 56×56 rounded thumbnail on the left, a short label
 * in the middle, and a circular play button on the right.
 *
 * The component is deliberately "dumb": it renders the preview row and
 * lets the parent decide what `onPlay` does (inline modal, full-screen
 * player, etc.). When the step has no clip data, the parent should
 * simply not render this component — there's no "empty" state because
 * the mock hides the row entirely in that case.
 */
export interface VideoClipCardProps {
  thumbnailUrl: string;
  label: string;
  onPlay: () => void;
  className?: string;
}

export function VideoClipCard({
  thumbnailUrl,
  label,
  onPlay,
  className,
}: VideoClipCardProps) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={'jamie-video-clip' + (className ? ` ${className}` : '')}
      aria-label={`Play clip: ${label}`}
    >
      <span
        className="jamie-video-clip__thumb"
        style={{ backgroundImage: `url(${thumbnailUrl})` }}
        aria-hidden="true"
      />
      <span className="jamie-video-clip__label">{label}</span>
      <span className="jamie-video-clip__play" aria-hidden="true">
        <Play size={14} fill="currentColor" />
      </span>
    </button>
  );
}

export default VideoClipCard;
