import { browser } from 'wxt/browser';
import { CliptError } from '@/core/errors';

/**
 * captureVisibleTab 래퍼. Chrome은 초당 2회를 넘으면 오류를 내므로
 * 호출을 한 줄로 세우고 최소 간격을 둔다(전체 페이지 스티칭에서 연속 호출).
 */
export const MIN_INTERVAL_MS = 550;

export interface ShotOptions {
  format: 'png' | 'jpeg';
  /** 0~1. JPEG에만 적용 */
  quality?: number;
}

let queue: Promise<unknown> = Promise.resolve();
let lastShotAt = -Infinity;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 창의 활성 탭 화면을 dataURL로 캡처한다 */
export function captureShot(windowId: number, options: ShotOptions): Promise<string> {
  const run = queue.then(async () => {
    const wait = lastShotAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await browser.tabs.captureVisibleTab(windowId, {
        format: options.format,
        ...(options.format === 'jpeg' && options.quality !== undefined
          ? { quality: Math.round(options.quality * 100) }
          : {}),
      });
    } catch (error) {
      throw new CliptError(
        'CAPTURE_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      lastShotAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

/** 테스트용: 호출 간격 기록 초기화 */
export function resetCaptureQueue(): void {
  queue = Promise.resolve();
  lastShotAt = -Infinity;
}
