import { browser, type Browser } from 'wxt/browser';
import { CliptError } from '@/core/errors';
import type { Job } from '@/core/job';
import { saveResult } from '@/shared/db';
import { loadSettings } from '@/shared/settings';
import { captureShot } from '../capture-service';
import { emitCapture } from '../emit';
import { endJob, transitionJob } from '../jobs';

/**
 * 보이는 화면 캡처 (docs/architecture.md 8절). preparing → capturing → finalizing → 종료.
 * captureVisibleTab은 탭 내용만 찍으므로 팝업·브라우저 UI는 결과에 포함되지 않지만,
 * 팝업이 닫힌 뒤 페이지가 다시 그려질 시간을 두고 찍는다.
 */
const POPUP_CLOSE_TIMEOUT_MS = 1000;
const SETTLE_MS = 80;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 팝업이 닫힐 때까지(최대 1초) 기다린다 */
export async function waitForPopupClosed(timeoutMs = POPUP_CLOSE_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const popups = await browser.runtime
      .getContexts({ contextTypes: ['POPUP' as Browser.runtime.ContextType] })
      .catch(() => []);
    if (popups.length === 0) break;
    await sleep(50);
  }
  await sleep(SETTLE_MS);
}

interface Viewport {
  w: number;
  h: number;
  dpr: number;
}

async function probeViewport(tabId: number): Promise<Viewport | undefined> {
  const [injection] = await browser.scripting
    .executeScript({
      target: { tabId },
      func: () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }),
    })
    .catch(() => []);
  return injection?.result as Viewport | undefined;
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function runVisibleCapture(job: Job): Promise<void> {
  const settings = await loadSettings();
  await waitForPopupClosed();

  const tab = await browser.tabs.get(job.tabId).catch(() => null);
  if (!tab) throw new CliptError('TAB_CLOSED');
  if (!tab.active) throw new CliptError('CAPTURE_FAILED', 'target tab is not active');

  await transitionJob(job.id, 'capturing');
  const viewport = await probeViewport(job.tabId);
  // 클립보드는 PNG만 받으므로 복사 설정이면 PNG로 찍는다
  const format = settings.afterCapture === 'clipboard' ? 'png' : settings.image.format;
  const dataUrl = await captureShot(tab.windowId, {
    format,
    quality: settings.image.jpegQuality,
  });

  await transitionJob(job.id, 'finalizing');
  const blob = await (await fetch(dataUrl)).blob();
  const { width, height } = await imageSize(blob);
  const meta = await saveResult(
    {
      kind: 'image',
      mode: job.mode,
      mime: blob.type,
      width,
      height,
      pageUrl: tab.url,
      pageTitle: tab.title,
      ...(viewport ? { viewport: { w: viewport.w, h: viewport.h }, dpr: viewport.dpr } : {}),
    },
    blob,
  );
  // 작업을 먼저 끝내야 배출 피드백(배지 ✓)이 작업 종료 시 배지 초기화에 지워지지 않는다
  await endJob(job.id);
  await emitCapture(job, meta, dataUrl, settings);
}
