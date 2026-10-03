import { browser } from 'wxt/browser';
import { CliptError } from '@/core/errors';
import { buildFilename } from '@/core/filename';
import type { Job } from '@/core/job';
import type { Settings } from '@/core/settings';
import { loadResult } from '@/shared/db';
import { send, sendToTab } from '@/shared/messages';
import { ensureContentScript } from '../access';
import { loadSettings } from '@/shared/settings';
import { flashBadge } from '../badge';
import { openResultPage } from '../emit';
import { endJob, getJob, patchJob, recordError, transitionJob } from '../jobs';
import { closeOffscreen, ensureOffscreen } from '../offscreen';
import { waitForPopupClosed } from './visible';
import { isRecordMode } from '@/core/job';
import type { NormalizedRect } from '@/core/crop';

/**
 * 탭 녹화 (docs/architecture.md 9절). 서비스 워커는 streamId를 얻어 오프스크린에 넘기고,
 * 스트림·MediaRecorder·chunk 저장은 오프스크린이 맡는다. 서비스 워커가 잠들어도 녹화는 계속된다.
 */
export function runTabRecording(job: Job): Promise<void> {
  return beginRecording(job, {});
}

/**
 * 녹화 시작 공통: 탭·영역·요소. 영역·요소는 crop(뷰포트 비율)을 넘긴다.
 * 작업은 countdown 단계여야 한다.
 */
export async function beginRecording(
  job: Job,
  options: { crop?: NormalizedRect; warnings?: string[]; follow?: boolean },
): Promise<void> {
  const settings = await loadSettings();
  if (!options.crop) await waitForPopupClosed();

  // 카운트다운: 페이지 중앙에 숫자를 보여주고, 지운 뒤 녹화를 시작한다
  const seconds = settings.record.countdownSeconds;
  if (seconds > 0) {
    await ensureContentScript(job.tabId);
    const completed = await sendToTab(job.tabId, 'countdown:start', { seconds, mode: job.mode });
    if ((await getJob())?.id !== job.id) return; // 카운트다운 중 팝업에서 취소
    if (!completed) {
      await endJob(job.id); // Esc
      return;
    }
  }

  const streamId = await browser.tabCapture
    .getMediaStreamId({ targetTabId: job.tabId })
    .catch((error: unknown) => {
      throw new CliptError('PERMISSION_DENIED', String(error));
    });
  const size = await tabCaptureSize(job.tabId, settings.record.scale);
  // 요소 따라가기: 콘텐츠 스크립트가 지금 위치를 돌려주고 이후 변화를 오프스크린에 바로 보낸다.
  // 요소를 찾지 못하면 고정 좌표 녹화로 이어간다
  const track = options.follow
    ? await sendToTab(job.tabId, 'track:start', { jobId: job.id }).catch(() => null)
    : null;
  await ensureOffscreen(['USER_MEDIA', 'BLOBS'], 'Record the tab with MediaRecorder');
  const info = await send('offscreen', 'rec:start', {
    jobId: job.id,
    mode: job.mode,
    streamId,
    audio: settings.record.audio,
    format: settings.record.format,
    fps: settings.record.fps,
    bitrate: settings.record.bitrate,
    size,
    ...(options.crop ? { crop: options.crop } : {}),
    ...(track ? { track } : {}),
    ...(options.warnings?.length ? { warnings: options.warnings } : {}),
    maxMs: settings.record.maxMinutes * 60_000,
  });
  const current = await getJob();
  if (current?.id !== job.id) {
    // 시작하는 사이 취소됐다
    await send('offscreen', 'rec:discard', null).catch(() => undefined);
    await closeOffscreen();
    return;
  }
  const recording = await transitionJob(job.id, 'recording');
  await patchJob(job.id, {
    media: {
      mime: info.mime,
      width: info.width,
      height: info.height,
      audio: settings.record.audio,
      audioTracks: info.audioTracks,
      frameRate: info.frameRate,
      ...(info.fallbackFrom ? { fallbackFrom: info.fallbackFrom } : {}),
      maxMs: settings.record.maxMinutes * 60_000,
    },
  });

  // 녹화 중 표시(옵션). 실패해도 녹화는 계속한다
  if (settings.record.indicator !== 'none' && recording.startedAt !== undefined) {
    await ensureContentScript(job.tabId)
      .then(() =>
        sendToTab(job.tabId, 'indicator:show', {
          kind: settings.record.indicator as 'border' | 'widget',
          jobId: job.id,
          ...(options.crop ? { crop: options.crop } : {}),
          state: { startedAt: recording.startedAt! },
        }),
      )
      .catch(() => undefined);
  }
}

/** 녹화가 끝나면 페이지에 남은 것(녹화 중 표시, 요소 추적)을 정리한다 */
async function hideIndicator(job: Job): Promise<void> {
  await sendToTab(job.tabId, 'indicator:hide', null).catch(() => undefined);
  await sendToTab(job.tabId, 'track:stop', null).catch(() => undefined);
}

async function syncIndicator(jobId: string): Promise<void> {
  const job = await getJob();
  if (job?.id !== jobId || job.startedAt === undefined) return;
  await sendToTab(job.tabId, 'indicator:state', {
    startedAt: job.startedAt,
    ...(job.pausedAt !== undefined ? { pausedAt: job.pausedAt } : {}),
    ...(job.pausedTotal !== undefined ? { pausedTotal: job.pausedTotal } : {}),
  }).catch(() => undefined);
}

/** 탭 뷰포트의 device px 크기. 측정할 수 없으면 1920×1080 안에서 탭 캡처가 정한다 */
/** scale: 설정의 해상도 배율. 탭 캡처가 최대 크기에 맞춰 줄여 보낸다 */
async function tabCaptureSize(
  tabId: number,
  scale: number,
): Promise<{ width: number; height: number }> {
  const [injection] = await browser.scripting
    .executeScript({
      target: { tabId },
      func: () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }),
    })
    .catch(() => []);
  const probe = injection?.result as { w: number; h: number; dpr: number } | undefined;
  if (!probe) return { width: 1920 * scale, height: 1080 * scale };
  // 인코더가 짝수 크기를 요구하는 경우가 있어 짝수로 맞춘다
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return {
    width: even(probe.w * probe.dpr * scale),
    height: even(probe.h * probe.dpr * scale),
  };
}

export async function emitRecording(job: Job, resultId: string, settings: Settings): Promise<void> {
  if (settings.afterRecord === 'download') {
    const result = await loadResult(resultId);
    if (result) {
      const state = await downloadRecording(job, resultId, result.meta, settings).catch(
        () => 'failed' as const,
      );
      if (state === 'complete') {
        await flashBadge('✓');
        return;
      }
      // 저장 위치 취소·거부·중단 등으로 받지 못하면 저장된 결과를 잃지 않게 결과 페이지를 연다.
      // 60초 안에 끝나지 않으면(대용량) 다운로드는 계속되므로 결과 페이지를 열지 않는다
      if (state === 'pending') return;
    }
  }
  await openResultPage(job, resultId);
}

async function downloadRecording(
  job: Job,
  resultId: string,
  meta: { createdAt: number; mime: string },
  settings: Settings,
): Promise<DownloadState> {
  // 서비스 워커에는 URL.createObjectURL이 없어 오프스크린이 만든 Blob URL로 받는다
  const url = await send('offscreen', 'result:objectUrl', { resultId });
  const downloadId = await browser.downloads.download({
    url,
    filename: buildFilename(settings.download.pattern, {
      date: new Date(meta.createdAt),
      mode: job.mode,
      mime: meta.mime,
    }),
    saveAs: settings.download.saveAs,
  });
  return waitForDownload(downloadId);
}

type DownloadState = 'complete' | 'interrupted' | 'pending' | 'failed';

/**
 * 다운로드가 끝날 때까지(최대 60초) 기다린다. 오프스크린 문서를 유지해야 Blob URL이 살아 있다.
 * 60초가 지나도 진행 중이면 'pending'
 */
export function waitForDownload(id: number, timeoutMs = 60_000): Promise<DownloadState> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => done('pending'), timeoutMs);
    function done(state: DownloadState) {
      clearTimeout(timer);
      browser.downloads.onChanged.removeListener(listener);
      resolve(state);
    }
    function listener(delta: { id: number; state?: { current?: string } }) {
      if (delta.id !== id || !delta.state?.current || delta.state.current === 'in_progress') return;
      done(delta.state.current === 'complete' ? 'complete' : 'interrupted');
    }
    browser.downloads.onChanged.addListener(listener);
  });
}

/** 녹화를 끝내고 결과를 저장·배출한다(팝업 중지·단축키). warning은 결과 메타에 남긴다 */
export async function stopTabRecording(jobId?: string, warning?: string): Promise<void> {
  const job = await getJob();
  if (!job || (jobId !== undefined && job.id !== jobId)) return;
  if (job.phase === 'finalizing') {
    // 이 워커가 저장 중이면(중지 연타·단축키 재입력) 첫 중지가 끝내게 둔다. 취소하면 저장 중인 결과를 잃는다.
    // 저장 중 서비스 워커가 재기동돼 마무리할 주체가 없으면 저장 결과를 이어 받는다
    if (!finalizingHere.has(job.id)) await resumeFinalizing(job);
    return;
  }
  if (job.phase !== 'recording') {
    await cancelRecording(job);
    return;
  }
  await transitionJob(job.id, 'finalizing');
  await settle(job, () => send('offscreen', 'rec:stop', warning ? { warning } : null), true);
}

/** 이 서비스 워커 인스턴스가 저장(rec:stop 응답)을 기다리는 작업 */
const finalizingHere = new Set<string>();

/**
 * 저장 결과를 받아 마무리한다. 오프스크린이 사라졌거나 저장에 실패하면 작업을 끝내고 사유를 남긴다
 * (chunk가 남아 있으면 결과 페이지의 복구 배너로 되살릴 수 있다)
 */
async function settle(
  job: Job,
  save: () => Promise<{ resultId: string }>,
  hide = false,
): Promise<void> {
  finalizingHere.add(job.id);
  try {
    if (hide) await hideIndicator(job);
    let resultId: string;
    try {
      ({ resultId } = await save());
    } catch (error) {
      await endJob(job.id);
      await recordError(error, job.mode);
      await closeOffscreen().catch(() => undefined);
      return;
    }
    await finishRecording(job, resultId);
  } finally {
    finalizingHere.delete(job.id);
  }
}

/** 저장 중(finalizing)인데 이 워커가 기다리지 않는 작업: 서비스 워커 재기동 뒤 저장 결과를 이어 받는다 */
export function resumeFinalizing(job: Job): Promise<void> {
  return settle(job, () => send('offscreen', 'rec:result', { jobId: job.id }));
}

/** 결과 저장 후 공통 마무리: 작업 종료 → 배출 → 오프스크린 닫기 */
export async function finishRecording(job: Job, resultId: string | null): Promise<void> {
  await endJob(job.id);
  await hideIndicator(job);
  try {
    if (resultId) await emitRecording(job, resultId, await loadSettings());
  } finally {
    await closeOffscreen().catch(() => undefined);
  }
}

/** 녹화를 버린다(취소) */
export async function cancelRecording(job: Job): Promise<void> {
  await endJob(job.id);
  await sendToTab(job.tabId, 'countdown:cancel', null).catch(() => undefined);
  await hideIndicator(job);
  await send('offscreen', 'rec:discard', null).catch(() => undefined);
  await closeOffscreen().catch(() => undefined);
}

export async function pauseRecording(jobId?: string, now = Date.now()): Promise<void> {
  const job = await getJob();
  if (!job || job.phase !== 'recording' || job.pausedAt || (jobId && job.id !== jobId)) return;
  await send('offscreen', 'rec:pause', null);
  await patchJob(job.id, { pausedAt: now });
  await syncIndicator(job.id);
}

export async function resumeRecording(jobId?: string, now = Date.now()): Promise<void> {
  const job = await getJob();
  if (!job?.pausedAt || (jobId && job.id !== jobId)) return;
  await send('offscreen', 'rec:resume', null);
  await patchJob(job.id, {
    pausedAt: undefined,
    pausedTotal: (job.pausedTotal ?? 0) + (now - job.pausedAt),
  });
  await syncIndicator(job.id);
}

/**
 * 영역·요소 녹화 중 대상 탭이 다른 페이지로 이동하면 레이아웃이 바뀌어 같은 영역을 녹화할 수 없다.
 * 그때까지 저장하고 결과에 layout-changed를 남긴다. 탭 녹화는 이동해도 계속한다.
 */
/**
 * 영역·요소 녹화의 뷰포트 크기가 바뀜. 녹화 중이면 그때까지 저장하고 layout-changed를 남기고,
 * 아직 시작 전(카운트다운)이면 이전 화면 기준 범위로 녹화하지 않도록 시작하지 않고 끝낸다
 */
export async function onPageResized(jobId: string): Promise<boolean> {
  const job = await getJob();
  // 끝난 작업이면(Esc 취소·시작 실패 등) 페이지가 감시를 그만두게 false를 돌려준다
  if (!job || job.id !== jobId || job.mode === 'rec-tab') return false;
  if (job.phase === 'recording') {
    await stopTabRecording(job.id, 'layout-changed');
    return false;
  }
  if (job.phase === 'countdown') {
    await cancelRecording(job);
    await recordError(
      new CliptError('LAYOUT_CHANGED', 'viewport resized before recording'),
      job.mode,
    );
    return false;
  }
  // 확정 직후 아직 선택 단계면 다음 변화도 알려야 한다
  return true;
}

export async function onTabNavigating(tabId: number): Promise<void> {
  const job = await getJob();
  if (!job || job.tabId !== tabId || !isRecordMode(job.mode) || job.mode === 'rec-tab') return;
  if (job.phase !== 'recording') return;
  await stopTabRecording(job.id, 'layout-changed');
}
