import { browser, type Browser } from 'wxt/browser';
import { CliptError } from '@/core/errors';
import type { Job } from '@/core/job';
import type { PageProbe } from '@/core/page';
import type { Settings } from '@/core/settings';
import { saveResult, type ResultMeta } from '@/shared/db';
import { emitCapture } from './emit';
import { endJob, transitionJob } from './jobs';

/**
 * 캡처 파이프라인 공통 마무리: finalizing → 결과 저장 → 작업 종료 → 배출.
 * 작업을 먼저 끝내야 배출 피드백(배지 ✓)이 작업 종료 시 배지 초기화에 지워지지 않는다.
 */
export async function finishCapture(
  job: Job,
  tab: Browser.tabs.Tab,
  image: { blob: Blob; width: number; height: number },
  settings: Settings,
  extra: Partial<Pick<ResultMeta, 'scaled' | 'selector' | 'warnings'>> & { page?: PageProbe } = {},
): Promise<ResultMeta> {
  await transitionJob(job.id, 'finalizing');
  const { page, ...rest } = extra;
  const meta = await saveResult(
    {
      kind: 'image',
      mode: job.mode,
      mime: image.blob.type,
      width: image.width,
      height: image.height,
      pageUrl: tab.url,
      pageTitle: tab.title,
      ...(page ? { viewport: page.viewport, dpr: page.dpr } : {}),
      ...rest,
    },
    image.blob,
  );
  await endJob(job.id);
  await emitCapture(job, meta, image.blob, settings);
  return meta;
}

/** 클립보드는 PNG만 받으므로 복사 설정이면 PNG로 만든다 */
export function outputFormat(settings: Settings): 'png' | 'jpeg' {
  return settings.afterCapture === 'clipboard' ? 'png' : settings.image.format;
}

/** 대상 탭이 살아 있고 창의 활성 탭인지 확인한다. captureVisibleTab은 활성 탭만 찍는다 */
export async function activeTargetTab(job: Job): Promise<Browser.tabs.Tab> {
  const tab = await browser.tabs.get(job.tabId).catch(() => null);
  if (!tab) throw new CliptError('TAB_CLOSED');
  if (!tab.active) throw new CliptError('CAPTURE_FAILED', 'target tab is not active');
  return tab;
}
