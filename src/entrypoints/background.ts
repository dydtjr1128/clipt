import { isMode } from '@/core/job';
import { CliptError } from '@/core/errors';
import { listen } from '@/shared/messages';
import { pruneResults } from '@/shared/db';
import { endJob, readJob, restoreJob, startJob } from '@/background/jobs';
import { checkTab } from '@/background/access';
import { runPipeline } from '@/background/pipelines';

// 서비스 워커: 작업 조정자 (docs/architecture.md 4절)
// 리스너는 서비스 워커가 깨어날 때마다 동기적으로 먼저 등록해야 이벤트를 놓치지 않는다.
export default defineBackground(() => {
  listen('background', {
    'job:start': async ({ mode, tabId }) => {
      if (!isMode(mode)) throw new CliptError('UNKNOWN', `Unknown mode: ${String(mode)}`);
      const job = await startJob(mode, tabId);
      // 응답을 먼저 돌려줘 팝업이 닫히게 하고, 파이프라인은 이어서 진행한다
      void runPipeline(job);
      return job;
    },
    'job:cancel': async ({ jobId }) => {
      await endJob(jobId);
      return null;
    },
    'job:stop': async ({ jobId }) => {
      // TODO(#11): 녹화 중이면 오프스크린에 rec:stop을 보내 결과를 저장한 뒤 끝낸다
      await endJob(jobId);
      return null;
    },
    'job:get': () => readJob(),
    'tab:status': ({ tabId }) => checkTab(tabId),
  });

  void restoreJob();
  void pruneResults().catch(() => undefined);
});
