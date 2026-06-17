/**
 * Formats ISO-8601 durations (e.g. PT80M, PT1H30M) for recipe metadata display.
 * Returns the original string when it does not match the expected pattern.
 */
export function formatDuration(isoTime?: string): string {
  if (!isoTime) return '';
  const match = isoTime.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) return isoTime;

  let hours = match[1] ? parseInt(match[1], 10) : 0;
  let minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (minutes >= 60) {
    hours += Math.floor(minutes / 60);
    minutes %= 60;
  }

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes} min`;
  return isoTime;
}
