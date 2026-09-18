import { browser } from 'wxt/browser';
import { CliptError, toErrorPayload, type ErrorPayload } from '@/core/errors';
import {
  canTransition,
  initialPhase,
  restoreAction,
  type Job,
  type Mode,
  type Phase,
} from '@/core/job';
import { applyBadge } from './badge';
import { hasOffscreen } from './offscreen';

/**
 * 작업 상태 저장소 (docs/architecture.md 5절).
 * 작업은 storage.session의 `job` 키 하나에만 존재하고, 전이는 서비스 워커만 수행한다.
 * 팝업 등 다른 컨텍스트는 storage.onChanged로 상태를 구독한다.
 */
export const JOB_KEY = 'job';
export const LAST_ERROR_KEY = 'lastError';

export interface LastError extends ErrorPayload {
  at: number;
  mode?: Mode;
}

// storage 읽기-수정-쓰기가 겹치지 않도록 작업 변경을 한 줄로 세운다
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export async function getJob(): Promise<Job | null> {
  const stored = await browser.storage.session.get(JOB_KEY);
  return (stored[JOB_KEY] as Job | undefined) ?? null;
}

async function saveJob(job: Job | null): Promise<void> {
  if (job) await browser.storage.session.set({ [JOB_KEY]: job });
  else await browser.storage.session.remove(JOB_KEY);
  await applyBadge(job).catch(() => undefined);
}

export async function recordError(error: unknown, mode?: Mode): Promise<void> {
  const payload: LastError = { ...toErrorPayload(error), at: Date.now(), mode };
  await browser.storage.session.set({ [LAST_ERROR_KEY]: payload });
}

async function resolveTab(tabId?: number): Promise<{ id: number; windowId: number }> {
  if (tabId !== undefined) {
    const tab = await browser.tabs.get(tabId);
    return { id: tabId, windowId: tab.windowId };
  }
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) throw new CliptError('NO_ACTIVE_TAB');
  return { id: tab.id, windowId: tab.windowId };
}

export function startJob(mode: Mode, tabId?: number, now: number = Date.now()): Promise<Job> {
  return serial(async () => {
    if (await getJob()) throw new CliptError('JOB_ACTIVE', 'Another job is in progress');
    const tab = await resolveTab(tabId);
    const job: Job = {
      id: crypto.randomUUID(),
      mode,
      tabId: tab.id,
      windowId: tab.windowId,
      phase: initialPhase(mode),
      createdAt: now,
    };
    await saveJob(job);
    return job;
  });
}

/** 작업을 다음 단계로 옮긴다. recording 진입 시 startedAt을 기록한다 */
export function transitionJob(
  jobId: string,
  next: Phase,
  patch: Partial<Pick<Job, 'target' | 'progress'>> = {},
  now: number = Date.now(),
): Promise<Job> {
  return serial(async () => {
    const job = await getJob();
    if (!job || job.id !== jobId) throw new CliptError('NO_JOB');
    if (!canTransition(job, next)) {
      throw new CliptError('INVALID_TRANSITION', `${job.mode}: ${job.phase} -> ${next}`);
    }
    const updated: Job = {
      ...job,
      ...patch,
      phase: next,
      ...(next === 'recording' ? { startedAt: now } : {}),
    };
    await saveJob(updated);
    return updated;
  });
}

/** 같은 단계 안에서 진행률 등 부가 정보만 갱신한다 */
export function patchJob(
  jobId: string,
  patch: Partial<Pick<Job, 'target' | 'progress'>>,
): Promise<Job> {
  return serial(async () => {
    const job = await getJob();
    if (!job || job.id !== jobId) throw new CliptError('NO_JOB');
    const updated = { ...job, ...patch };
    await saveJob(updated);
    return updated;
  });
}

/** 작업을 끝낸다(완료·취소 공통). jobId가 있으면 해당 작업일 때만 */
export function endJob(jobId?: string): Promise<Job | null> {
  return serial(async () => {
    const job = await getJob();
    if (!job || (jobId !== undefined && job.id !== jobId)) return null;
    await saveJob(null);
    return job;
  });
}

/**
 * 서비스 워커 기동 시 호출. 남은 작업을 이어갈 수 있으면 배지를 복원하고,
 * 이어갈 수 없으면 정리하고 INTERRUPTED 오류를 남긴다.
 */
export async function restoreJob(isOffscreenAlive: () => Promise<boolean> = hasOffscreen) {
  const job = await getJob();
  if (!job) {
    await applyBadge(null).catch(() => undefined);
    return { job: null, action: 'none' as const };
  }
  const action = restoreAction(job, await isOffscreenAlive().catch(() => false));
  if (action === 'keep') {
    await applyBadge(job).catch(() => undefined);
    return { job, action };
  }
  await endJob(job.id);
  await recordError(
    new CliptError('INTERRUPTED', `${job.mode} interrupted at ${job.phase}`),
    job.mode,
  );
  return { job, action };
}
