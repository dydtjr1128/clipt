import { CliptError } from '@/core/errors';
import { isRecordMode, type Job, type Mode } from '@/core/job';
import { modeOfCommand } from '@/core/menu';

/**
 * 단축키(chrome.commands) 처리 (docs/architecture.md 13절).
 * 팝업 클릭과 같은 진입 함수를 쓰고, 진행 중인 작업에 따라 시작·중지·취소를 정한다.
 * 브라우저 API 의존은 actions로 주입해 단위 테스트한다.
 */
export interface CommandActions {
  getJob(): Promise<Job | null>;
  start(mode: Mode, tabId?: number): Promise<unknown>;
  stop(jobId: string): Promise<unknown>;
  cancel(job: Job): Promise<unknown>;
  /** 시작하지 못한 사유를 사용자에게 알린다(배지·팝업 알림) */
  reportError(error: unknown, mode: Mode): Promise<unknown>;
}

export type CommandOutcome = 'started' | 'stopped' | 'cancelled' | 'ignored' | 'failed';

export async function handleCommand(
  command: string,
  tabId: number | undefined,
  actions: CommandActions,
): Promise<CommandOutcome> {
  const mode = modeOfCommand(command);
  if (!mode) return 'ignored';
  const job = await actions.getJob();

  if (job) {
    // 녹화 토글: 녹화 중이면 저장하고 끝낸다. 시작 준비 중이면 취소한다
    if (command === 'toggle-recording' && isRecordMode(job.mode)) {
      if (job.phase === 'recording') {
        await actions.stop(job.id);
        return 'stopped';
      }
      await actions.cancel(job);
      return 'cancelled';
    }
    // 같은 기능의 단축키를 선택 중에 다시 누르면 취소
    if (job.mode === mode && job.phase === 'selecting') {
      await actions.cancel(job);
      return 'cancelled';
    }
    return 'ignored';
  }

  try {
    await actions.start(mode, tabId);
    return 'started';
  } catch (error) {
    // 제한 페이지 등: 팝업이 없으므로 배지와 다음 팝업 알림으로 알린다
    const reportable = !(error instanceof CliptError && error.code === 'JOB_ACTIVE');
    if (reportable) await actions.reportError(error, mode);
    return 'failed';
  }
}
