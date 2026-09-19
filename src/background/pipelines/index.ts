import type { Job, Mode } from '@/core/job';
import { runFullPageCapture } from './fullpage';
import { runTabRecording } from './recording';
import { guarded, startSelectionUi } from './selection';
import { runVisibleCapture } from './visible';

/**
 * 모드별 파이프라인. 아직 구현되지 않은 모드는 작업만 만들어지고 사용자가 취소할 때까지 남는다.
 * 각 기능 이슈에서 여기에 등록한다. 선택이 필요한 모드는 선택 UI만 띄우고,
 * 이후 흐름은 select:done 처리(selection.ts)에서 이어간다.
 */
const PIPELINES: Partial<Record<Mode, (job: Job) => Promise<void>>> = {
  visible: runVisibleCapture,
  fullpage: runFullPageCapture,
  region: startSelectionUi,
  element: startSelectionUi,
  'rec-tab': runTabRecording,
  'rec-region': startSelectionUi,
  'rec-element': startSelectionUi,
};

/** 작업 시작 직후 비동기로 실행한다. 실패하면 오류를 남기고 작업을 정리한다 */
export async function runPipeline(job: Job): Promise<void> {
  const pipeline = PIPELINES[job.mode];
  if (!pipeline) return;
  await guarded(job, () => pipeline(job));
}
