import { browser } from 'wxt/browser';
import { CliptError } from '@/core/errors';
import { buildFilename } from '@/core/filename';
import type { Job } from '@/core/job';
import type { Settings } from '@/core/settings';
import { loadResult } from '@/shared/db';
import { send } from '@/shared/messages';
import { loadSettings } from '@/shared/settings';
import { flashBadge } from '../badge';
import { openResultPage } from '../emit';
import { endJob, getJob, patchJob, recordError, transitionJob } from '../jobs';
import { closeOffscreen, ensureOffscreen } from '../offscreen';
import { waitForPopupClosed } from './visible';

/**
 * 탭 녹화 (docs/architecture.md 9절). 서비스 워커는 streamId를 얻어 오프스크린에 넘기고,
 * 스트림·MediaRecorder·chunk 저장은 오프스크린이 맡는다. 서비스 워커가 잠들어도 녹화는 계속된다.
 */
export async function runTabRecording(job: Job): Promise<void> {
  const settings = await loadSettings();
  await waitForPopupClosed();

  const streamId = await browser.tabCapture
    .getMediaStreamId({ targetTabId: job.tabId })
    .catch((error: unknown) => {
      throw new CliptError('PERMISSION_DENIED', String(error));
    });
  const size = await tabCaptureSize(job.tabId);
  await ensureOffscreen(['USER_MEDIA', 'BLOBS'], 'Record the tab with MediaRecorder');
  // 카운트다운은 #13에서 추가한다
  const info = await send('offscreen', 'rec:start', {
    jobId: job.id,
    mode: job.mode,
    streamId,
    audio: settings.record.audio,
    format: settings.record.format,
    fps: settings.record.fps,
    bitrate: settings.record.bitrate,
    size,
  });
  const current = await getJob();
  if (current?.id !== job.id) {
    // 시작하는 사이 취소됐다
    await send('offscreen', 'rec:discard', null).catch(() => undefined);
    await closeOffscreen();
    return;
  }
  await transitionJob(job.id, 'recording');
  await patchJob(job.id, {
    media: {
      mime: info.mime,
      width: info.width,
      height: info.height,
      audio: settings.record.audio,
      audioTracks: info.audioTracks,
    },
  });
}

/** 탭 뷰포트의 device px 크기. 측정할 수 없으면 1920×1080 안에서 탭 캡처가 정한다 */
async function tabCaptureSize(tabId: number): Promise<{ width: number; height: number }> {
  const [injection] = await browser.scripting
    .executeScript({
      target: { tabId },
      func: () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }),
    })
    .catch(() => []);
  const probe = injection?.result as { w: number; h: number; dpr: number } | undefined;
  if (!probe) return { width: 1920, height: 1080 };
  // 인코더가 짝수 크기를 요구하는 경우가 있어 짝수로 맞춘다
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(probe.w * probe.dpr), height: even(probe.h * probe.dpr) };
}

async function emitRecording(job: Job, resultId: string, settings: Settings): Promise<void> {
  if (settings.afterRecord === 'download') {
    const result = await loadResult(resultId);
    if (result) {
      // 서비스 워커에는 URL.createObjectURL이 없어 오프스크린이 만든 Blob URL로 받는다
      const url = await send('offscreen', 'result:objectUrl', { resultId });
      const downloadId = await browser.downloads.download({
        url,
        filename: buildFilename(settings.download.pattern, {
          date: new Date(result.meta.createdAt),
          mode: job.mode,
          mime: result.meta.mime,
        }),
        saveAs: settings.download.saveAs,
      });
      await waitForDownload(downloadId);
      await flashBadge('✓');
      return;
    }
  }
  await openResultPage(job, resultId);
}

/** 다운로드가 끝날 때까지(최대 60초) 오프스크린 문서를 유지해야 Blob URL이 살아 있다 */
function waitForDownload(id: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 60_000);
    function done() {
      clearTimeout(timer);
      browser.downloads.onChanged.removeListener(listener);
      resolve();
    }
    function listener(delta: { id: number; state?: { current?: string } }) {
      if (delta.id === id && delta.state?.current && delta.state.current !== 'in_progress') done();
    }
    browser.downloads.onChanged.addListener(listener);
  });
}

/** 녹화를 끝내고 결과를 저장·배출한다(팝업 중지·단축키) */
export async function stopTabRecording(jobId?: string): Promise<void> {
  const job = await getJob();
  if (!job || (jobId !== undefined && job.id !== jobId)) return;
  if (job.phase !== 'recording') {
    await cancelRecording(job);
    return;
  }
  await transitionJob(job.id, 'finalizing');
  let resultId: string;
  try {
    ({ resultId } = await send('offscreen', 'rec:stop', null));
  } catch (error) {
    // 오프스크린이 사라졌거나 저장에 실패하면 작업을 끝내고 사유를 남긴다
    await endJob(job.id);
    await recordError(error, job.mode);
    await closeOffscreen().catch(() => undefined);
    return;
  }
  await finishRecording(job, resultId);
}

/** 결과 저장 후 공통 마무리: 작업 종료 → 배출 → 오프스크린 닫기 */
export async function finishRecording(job: Job, resultId: string | null): Promise<void> {
  await endJob(job.id);
  try {
    if (resultId) await emitRecording(job, resultId, await loadSettings());
  } finally {
    await closeOffscreen().catch(() => undefined);
  }
}

/** 녹화를 버린다(취소) */
export async function cancelRecording(job: Job): Promise<void> {
  await endJob(job.id);
  await send('offscreen', 'rec:discard', null).catch(() => undefined);
  await closeOffscreen().catch(() => undefined);
}

export async function pauseRecording(jobId?: string, now = Date.now()): Promise<void> {
  const job = await getJob();
  if (!job || job.phase !== 'recording' || job.pausedAt || (jobId && job.id !== jobId)) return;
  await send('offscreen', 'rec:pause', null);
  await patchJob(job.id, { pausedAt: now });
}

export async function resumeRecording(jobId?: string, now = Date.now()): Promise<void> {
  const job = await getJob();
  if (!job?.pausedAt || (jobId && job.id !== jobId)) return;
  await send('offscreen', 'rec:resume', null);
  await patchJob(job.id, {
    pausedAt: undefined,
    pausedTotal: (job.pausedTotal ?? 0) + (now - job.pausedAt),
  });
}
