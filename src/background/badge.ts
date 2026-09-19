import { browser } from 'wxt/browser';
import type { Job } from '@/core/job';

/** 작업 상태를 툴바 배지로 표시한다 (docs/ux-design.md 7절) */
const REC_COLOR = '#E5484D';
const SUCCESS_COLOR = '#22A06B';
const PAUSE_COLOR = '#D97706';

export async function applyBadge(job: Job | null): Promise<void> {
  if (job?.phase === 'recording') {
    await browser.action.setBadgeBackgroundColor({ color: job.pausedAt ? PAUSE_COLOR : REC_COLOR });
    await browser.action.setBadgeText({ text: job.pausedAt ? '❚❚' : 'REC' });
    return;
  }
  if (job?.progress && job.progress.total > 1) {
    await browser.action.setBadgeText({ text: `${job.progress.done}/${job.progress.total}` });
    return;
  }
  await browser.action.setBadgeText({ text: '' });
}

/** 완료 피드백: 배지를 잠시 표시했다가 지운다 */
export async function flashBadge(
  text: string,
  ms = 2000,
  tone: 'success' | 'warn' = 'success',
): Promise<void> {
  await browser.action.setBadgeBackgroundColor({
    color: tone === 'warn' ? PAUSE_COLOR : SUCCESS_COLOR,
  });
  await browser.action.setBadgeText({ text });
  setTimeout(() => {
    void browser.action.getBadgeText({}).then((current) => {
      if (current === text) void browser.action.setBadgeText({ text: '' });
    });
  }, ms);
}
