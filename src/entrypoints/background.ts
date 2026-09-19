import { browser } from 'wxt/browser';
import { isMode } from '@/core/job';
import { CliptError } from '@/core/errors';
import { listen } from '@/shared/messages';
import { pruneResults } from '@/shared/db';
import { endJob, readJob, restoreJob, startJob } from '@/background/jobs';
import { checkTab } from '@/background/access';
import { flashBadge } from '@/background/badge';
import { handleCommand } from '@/background/commands';
import { recordError } from '@/background/jobs';
import { runPipeline } from '@/background/pipelines';
import { onSelectionCancelled, onSelectionDone } from '@/background/pipelines/selection';
import {
  cancelRecording,
  finishRecording,
  onPageResized,
  onTabNavigating,
  pauseRecording,
  resumeRecording,
  stopTabRecording,
} from '@/background/pipelines/recording';
import { isRecordMode } from '@/core/job';
import { getJob } from '@/background/jobs';
import { sendToTab } from '@/shared/messages';

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
      const job = await getJob();
      // 녹화는 오프스크린의 스트림·chunk까지 버린다
      if (
        job &&
        isRecordMode(job.mode) &&
        job.phase !== 'selecting' &&
        (!jobId || job.id === jobId)
      ) {
        await cancelRecording(job);
        return null;
      }
      const ended = await endJob(jobId);
      // 선택 중이었다면 페이지의 선택 UI도 닫는다
      if (ended?.phase === 'selecting') {
        await sendToTab(ended.tabId, 'select:cancel', null).catch(() => undefined);
      }
      return null;
    },
    'job:stop': async ({ jobId }) => {
      await stopTabRecording(jobId);
      return null;
    },
    'job:pause': async ({ jobId }) => {
      await pauseRecording(jobId);
      return null;
    },
    'job:resume': async ({ jobId }) => {
      await resumeRecording(jobId);
      return null;
    },
    'rec:ended': async ({ jobId, resultId }) => {
      const job = await getJob();
      if (job?.id === jobId) await finishRecording(job, resultId);
      return null;
    },
    'job:get': () => readJob(),
    'tab:status': ({ tabId }) => checkTab(tabId),
    'select:done': ({ jobId, target, page, selector, warnings, follow }) => {
      // 캡처는 시간이 걸리므로 응답을 먼저 돌려준다
      void onSelectionDone(jobId, target, page, { selector, warnings, follow });
      return null;
    },
    'page:resized': async ({ jobId }) => {
      await onPageResized(jobId);
      return null;
    },
    'select:cancelled': async ({ jobId }) => {
      await onSelectionCancelled(jobId);
      return null;
    },
  });

  // 단축키: 팝업 클릭과 같은 흐름으로 시작·중지·취소한다
  browser.commands.onCommand.addListener((command, tab) => {
    void handleCommand(command, tab?.id, {
      getJob: readJob,
      start: async (mode, tabId) => {
        const job = await startJob(mode, tabId);
        void runPipeline(job);
      },
      stop: (jobId) => stopTabRecording(jobId),
      cancel: async (job) => {
        if (isRecordMode(job.mode) && job.phase !== 'selecting') {
          await cancelRecording(job);
          return;
        }
        await endJob(job.id);
        await sendToTab(job.tabId, 'select:cancel', null).catch(() => undefined);
      },
      reportError: async (error, mode) => {
        await recordError(error, mode);
        await flashBadge('!', 2000, 'warn');
      },
    });
  });

  // 영역·요소 녹화 중 페이지 이동을 감지한다(탭 녹화는 계속)
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') void onTabNavigating(tabId);
  });

  void restoreJob();
  void pruneResults().catch(() => undefined);
});
