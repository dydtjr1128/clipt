import { CliptError } from '@/core/errors';
import { isRecordMode, type Job } from '@/core/job';
import type { PageProbe } from '@/core/page';
import { sendToTab, type SelectionTarget } from '@/shared/messages';
import { loadSettings } from '@/shared/settings';
import { ensureContentScript } from '../access';
import { activeTargetTab, finishCapture, outputFormat } from '../finish';
import { endJob, getJob, recordError, transitionJob } from '../jobs';
import { stitchCapture } from '../stitch';

/**
 * 영역·요소 선택이 필요한 모드의 흐름 (docs/architecture.md 5·8절).
 * 서비스 워커는 선택 UI를 띄우고 곧바로 돌아온다. 사용자가 확정하면 콘텐츠가
 * select:done을 보내고, 그때 캡처를 이어간다. 선택 중 서비스 워커가 재기동돼도 작업은 유지된다.
 */
export async function startSelectionUi(job: Job): Promise<void> {
  await ensureContentScript(job.tabId);
  await sendToTab(job.tabId, 'select:start', {
    jobId: job.id,
    kind: job.mode === 'element' || job.mode === 'rec-element' ? 'element' : 'region',
    forRecording: isRecordMode(job.mode),
  });
}

/** 실패하면 오류를 남기고 작업·페이지를 정리한다. 도중 취소(NO_JOB)는 오류로 보지 않는다 */
export async function guarded(job: Job, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    const cancelled = error instanceof CliptError && error.code === 'NO_JOB';
    const current = await getJob();
    if (cancelled || current?.id !== job.id) return;
    await recordError(error, job.mode);
    await endJob(job.id);
    await sendToTab(job.tabId, 'page:restore', null).catch(() => undefined);
  }
}

export async function onSelectionDone(
  jobId: string,
  target: SelectionTarget,
  page: PageProbe,
  selector?: string,
): Promise<void> {
  const job = await getJob();
  if (!job || job.id !== jobId || job.phase !== 'selecting') return;
  await guarded(job, async () => {
    if (isRecordMode(job.mode)) {
      // 영역·요소 녹화는 #12에서 연결한다
      throw new CliptError('UNKNOWN', 'recording selection is not implemented yet');
    }
    const settings = await loadSettings();
    const tab = await activeTargetTab(job);
    await transitionJob(job.id, 'preparing', {
      target: { x: target.x, y: target.y, w: target.w, h: target.h, unit: 'css' },
    });
    await transitionJob(job.id, 'capturing');
    const image = await stitchCapture(job, tab.windowId, page, target, {
      ...settings,
      image: { ...settings.image, format: outputFormat(settings) },
    });
    await finishCapture(job, tab, image, settings, {
      page,
      ...(image.scale < 1 ? { scaled: image.scale } : {}),
      ...(selector ? { selector } : {}),
    });
  });
}

export async function onSelectionCancelled(jobId: string): Promise<void> {
  const job = await getJob();
  if (job?.id === jobId && job.phase === 'selecting') await endJob(jobId);
}
