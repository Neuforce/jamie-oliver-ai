import React from 'react';
import jamieHeartUrl from '../assets/jamie-heart.png';

/**
 * JamieHeart — the brand mark for Jamie messages.
 *
 * The actual hand-drawn heart is cropped out of the official Jamie Oliver
 * wordmark (`assets/36d2b220…png`) and saved as `assets/jamie-heart.png`.
 * Using the real asset keeps the slightly wobbly, sketchy brush look instead
 * of a sanitised geometric heart — that imperfect feel is a core part of
 * the brand voice.
 *
 * Sizing is driven by CSS `width` / `height` on the parent rule so callers
 * can pick a scale (18px in the process card badge, larger in hero
 * placements) without having to touch the asset here.
 */
export function JamieHeart({ className }: { className?: string }) {
  return (
    <img
      src={jamieHeartUrl}
      alt=""
      aria-hidden="true"
      className={className}
      draggable={false}
    />
  );
}

export default JamieHeart;
