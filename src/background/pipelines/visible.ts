import { browser, type Browser } from 'wxt/browser';
import type { Job } from '@/core/job';
import { loadSettings } from '@/shared/settings';
import { captureShot } from '../capture-service';
import { activeTargetTab, finishCapture, outputFormat } from '../finish';
import { transitionJob } from '../jobs';

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

export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
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
  const tab = await activeTargetTab(job);

  await transitionJob(job.id, 'capturing');
  const viewport = await probeViewport(job.tabId);
  const dataUrl = await captureShot(tab.windowId, {
    format: outputFormat(settings),
    quality: settings.image.jpegQuality,
  });

  const blob = await (await fetch(dataUrl)).blob();
  const size = await imageSize(blob);
  await finishCapture(job, tab, { blob, ...size }, settings, {
    ...(viewport
      ? {
          page: {
            viewport: { w: viewport.w, h: viewport.h },
            dpr: viewport.dpr,
            scroll: { x: 0, y: 0 },
            scrollSize: { w: 0, h: 0 },
            innerScroller: false,
          },
        }
      : {}),
  });
}
