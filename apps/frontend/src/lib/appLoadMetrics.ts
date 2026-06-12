export type AppLoadStage =
  | 'app_mount'
  | 'recipes_ready'
  | 'chat_shell_ready'
  | 'recipes_route_ready'
  | 'recipes_first_card'
  | 'mytab_ready';

export type AppLoadStageMark = {
  stage: AppLoadStage;
  totalMs: number;
  at: number;
  extra?: Record<string, unknown>;
};

export type AppLoadReport = {
  startedAt: number;
  stages: AppLoadStageMark[];
  completedAt: number | null;
};

type AppLoadSession = {
  startedAt: number;
  stageMarks: Partial<Record<AppLoadStage, number>>;
  stages: AppLoadStageMark[];
};

let session: AppLoadSession | null = null;

declare global {
  interface Window {
    __APP_LOAD_REPORT__?: AppLoadReport;
  }
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function publishReport(): void {
  if (!session || typeof window === 'undefined') {
    return;
  }
  window.__APP_LOAD_REPORT__ = getAppLoadReport();
}

export function startAppLoadSession(): void {
  if (session) {
    return;
  }
  const startedAt = nowMs();
  session = {
    startedAt,
    stageMarks: {},
    stages: [],
  };
  publishReport();
}

export function markAppLoadStage(
  stage: AppLoadStage,
  extra: Record<string, unknown> = {},
  once = true,
): void {
  if (!session) {
    startAppLoadSession();
  }
  const active = session!;
  if (once && active.stageMarks[stage] !== undefined) {
    return;
  }

  const stamp = nowMs();
  active.stageMarks[stage] = stamp;
  const mark: AppLoadStageMark = {
    stage,
    totalMs: roundMs(stamp - active.startedAt),
    at: stamp,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
  active.stages.push(mark);

  console.info('[app-load]', {
    stage,
    totalMs: mark.totalMs,
    ...extra,
  });

  publishReport();
}

export function getAppLoadReport(): AppLoadReport {
  if (!session) {
    return {
      startedAt: 0,
      stages: [],
      completedAt: null,
    };
  }
  return {
    startedAt: session.startedAt,
    stages: [...session.stages],
    completedAt: session.stages.length > 0 ? session.stages[session.stages.length - 1].at : null,
  };
}

/** Test-only reset — does not affect production. */
export function resetAppLoadMetricsForTests(): void {
  session = null;
  if (typeof window !== 'undefined') {
    delete window.__APP_LOAD_REPORT__;
  }
}
