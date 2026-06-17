import { describe, expect, it } from 'vitest';
import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it('normalizes minute-only ISO durations over 60 minutes', () => {
    expect(formatDuration('PT80M')).toBe('1h 20m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration('PT1H30M')).toBe('1h 30m');
  });

  it('formats hours only', () => {
    expect(formatDuration('PT2H')).toBe('2h');
  });

  it('formats minutes only under one hour', () => {
    expect(formatDuration('PT45M')).toBe('45 min');
  });

  it('returns the original string for non-ISO values', () => {
    expect(formatDuration('45 mins')).toBe('45 mins');
  });
});
