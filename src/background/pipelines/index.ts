import { CliptError } from '@/core/errors';
import type { Job, Mode } from '@/core/job';
import { sendToTab } from '@/shared/messages';
import { endJob, getJob, recordError } from '../jobs';
import { runFullPageCapture } from './fullpage';
import { runVisibleCapture } from './visible';

/**
 * 모드별 파이프라인. 아직 구현되지 않은 모드는 작업만 만들어지고 사용자가 취소할 때까지 남는다.
 * 각 기능 이슈에서 여기에 등록한다.
 */
const PIPELINES: Partial<Record<Mode, (job: Job) => Promise<void>>> = {
  visible: runVisibleCapture,
  fullpage: runFullPageCapture,
};

/**
 * 작업 시작 직후 비동기로 실행한다. 실패하면 오류를 남기고 작업을 정리한다.
 * 사용자가 도중에 취소해 작업이 사라졌다면(NO_JOB) 오류로 보지 않는다.
 */
export async function runPipeline(job: Job): Promise<void> {
  const pipeline = PIPELINES[job.mode];
  if (!pipeline) return;
  try {
    await pipeline(job);
  } catch (error) {
    const cancelled = error instanceof CliptError && error.code === 'NO_JOB';
    const current = await getJob();
    if (cancelled || current?.id !== job.id) return;
    await recordError(error, job.mode);
    await endJob(job.id);
    // 취소·실패 시 페이지 스타일·스크롤이 남지 않게 한 번 더 복원한다
    await sendToTab(job.tabId, 'page:restore', null).catch(() => undefined);
  }
}
