import { isMode } from '@/core/job';
import { CliptError } from '@/core/errors';
import { listen } from '@/shared/messages';
import { pruneResults } from '@/shared/db';
import { endJob, readJob, restoreJob, startJob } from '@/background/jobs';
import { checkTab } from '@/background/access';

// 서비스 워커: 작업 조정자 (docs/architecture.md 4절)
// 리스너는 서비스 워커가 깨어날 때마다 동기적으로 먼저 등록해야 이벤트를 놓치지 않는다.
export default defineBackground(() => {
  listen('background', {
    'job:start': ({ mode, tabId }) => {
      if (!isMode(mode)) throw new CliptError('UNKNOWN', `Unknown mode: ${String(mode)}`);
      return startJob(mode, tabId);
    },
    'job:cancel': async ({ jobId }) => {
      await endJob(jobId);
      return null;
    },
    'job:get': () => readJob(),
    'tab:status': ({ tabId }) => checkTab(tabId),
  });

  void restoreJob();
  void pruneResults().catch(() => undefined);
});
