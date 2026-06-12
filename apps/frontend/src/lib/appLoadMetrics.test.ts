import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAppLoadReport,
  markAppLoadStage,
  resetAppLoadMetricsForTests,
  startAppLoadSession,
} from './appLoadMetrics';

describe('appLoadMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAppLoadMetricsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAppLoadMetricsForTests();
  });

  it('starts a session once and records app_mount monotonic timing', () => {
    startAppLoadSession();
    markAppLoadStage('app_mount');

    vi.advanceTimersByTime(120);
    markAppLoadStage('recipes_ready', { count: 12 });

    const report = getAppLoadReport();
    expect(report.stages).toHaveLength(2);
    expect(report.stages[0]).toMatchObject({ stage: 'app_mount', totalMs: 0 });
    expect(report.stages[1]).toMatchObject({
      stage: 'recipes_ready',
      totalMs: 120,
      extra: { count: 12 },
    });
  });

  it('ignores duplicate stages when once=true', () => {
    startAppLoadSession();
    markAppLoadStage('chat_shell_ready');
    vi.advanceTimersByTime(500);
    markAppLoadStage('chat_shell_ready');

    expect(getAppLoadReport().stages).toHaveLength(1);
    expect(getAppLoadReport().stages[0].totalMs).toBe(0);
  });

  it('allows duplicate stages when once=false', () => {
    startAppLoadSession();
    markAppLoadStage('recipes_route_ready', { view: 'recipes' });
    vi.advanceTimersByTime(40);
    markAppLoadStage('recipes_route_ready', { view: 'recipes' }, false);

    expect(getAppLoadReport().stages).toHaveLength(2);
    expect(getAppLoadReport().stages[1].totalMs).toBe(40);
  });

  it('auto-starts session on first mark', () => {
    markAppLoadStage('app_mount');
    expect(getAppLoadReport().stages).toHaveLength(1);
    expect(getAppLoadReport().startedAt).toBeGreaterThanOrEqual(0);
  });

  it('sets completedAt on the report after the latest stage', () => {
    startAppLoadSession();
    markAppLoadStage('app_mount');
    vi.advanceTimersByTime(25);
    markAppLoadStage('chat_shell_ready');

    const report = getAppLoadReport();
    expect(report.completedAt).not.toBeNull();
    expect(report.stages.at(-1)?.stage).toBe('chat_shell_ready');
  });
});
