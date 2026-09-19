import type { Rect } from './geometry';

/** 작업 모델과 상태 전이 규칙 (docs/architecture.md 5절). 브라우저 API에 의존하지 않는다. */

export const CAPTURE_MODES = ['visible', 'fullpage', 'region', 'element'] as const;
export const RECORD_MODES = ['rec-tab', 'rec-region', 'rec-element'] as const;

export type CaptureMode = (typeof CAPTURE_MODES)[number];
export type RecordMode = (typeof RECORD_MODES)[number];
export type Mode = CaptureMode | RecordMode;

export type Phase =
  'selecting' | 'preparing' | 'capturing' | 'countdown' | 'recording' | 'finalizing';

export interface Job {
  id: string;
  mode: Mode;
  tabId: number;
  windowId: number;
  phase: Phase;
  createdAt: number;
  /** recording 진입 시각. 팝업 타이머의 기준 */
  startedAt?: number;
  /** 영역·요소 모드에서 확정된 범위 */
  target?: Rect<'css'>;
  progress?: { done: number; total: number };
  /** 일시정지 시작 시각. 재개하면 지운다 */
  pausedAt?: number;
  /** 지금까지 일시정지한 총 시간(ms) */
  pausedTotal?: number;
  /** 녹화 중인 미디어 정보(팝업 표시용) */
  media?: {
    mime: string;
    width: number;
    height: number;
    audio: string;
    audioTracks: number;
    /** 최대 녹화 길이(ms) */
    maxMs?: number;
  };
}

/** 녹화 경과 시간(ms). 일시정지 구간은 뺀다 */
export function recordedMs(
  job: Pick<Job, 'startedAt' | 'pausedAt' | 'pausedTotal'>,
  now: number,
): number {
  if (job.startedAt === undefined) return 0;
  const end = job.pausedAt ?? now;
  return Math.max(0, end - job.startedAt - (job.pausedTotal ?? 0));
}

export function isMode(value: unknown): value is Mode {
  return (
    typeof value === 'string' &&
    ((CAPTURE_MODES as readonly string[]).includes(value) ||
      (RECORD_MODES as readonly string[]).includes(value))
  );
}

export function isRecordMode(mode: Mode): mode is RecordMode {
  return (RECORD_MODES as readonly string[]).includes(mode);
}

/** 사용자 선택이 필요한 모드인지 */
export function needsSelection(mode: Mode): boolean {
  return mode === 'region' || mode === 'element' || mode === 'rec-region' || mode === 'rec-element';
}

/** 작업 시작 시의 첫 단계 */
export function initialPhase(mode: Mode): Phase {
  if (needsSelection(mode)) return 'selecting';
  return isRecordMode(mode) ? 'countdown' : 'preparing';
}

const CAPTURE_NEXT: Record<Phase, readonly Phase[]> = {
  selecting: ['preparing'],
  preparing: ['capturing'],
  capturing: ['finalizing'],
  finalizing: [],
  countdown: [],
  recording: [],
};

const RECORD_NEXT: Record<Phase, readonly Phase[]> = {
  selecting: ['countdown'],
  countdown: ['recording'],
  recording: ['finalizing'],
  finalizing: [],
  preparing: [],
  capturing: [],
};

/** 모드별로 허용된 다음 단계인지 확인한다. 취소는 어느 단계에서든 가능하므로 여기서 다루지 않는다. */
export function canTransition(job: Pick<Job, 'mode' | 'phase'>, next: Phase): boolean {
  const table = isRecordMode(job.mode) ? RECORD_NEXT : CAPTURE_NEXT;
  return table[job.phase].includes(next);
}

/**
 * 서비스 워커가 재기동됐을 때 남아 있던 작업을 어떻게 처리할지 결정한다.
 * - keep: 다른 컨텍스트(콘텐츠 선택 UI, 오프스크린 녹화)가 계속 진행 중
 * - abort: 서비스 워커가 직접 진행하던 단계라 이어갈 수 없음
 */
export function restoreAction(
  job: Pick<Job, 'mode' | 'phase'>,
  offscreenAlive: boolean,
): 'keep' | 'abort' {
  switch (job.phase) {
    case 'selecting':
    case 'countdown':
      return 'keep';
    case 'recording':
    case 'finalizing':
      // 녹화 스트림과 chunk는 오프스크린이 보유한다. 오프스크린이 없으면 이어갈 수 없다.
      return isRecordMode(job.mode) && offscreenAlive ? 'keep' : 'abort';
    case 'preparing':
    case 'capturing':
      return 'abort';
  }
}
