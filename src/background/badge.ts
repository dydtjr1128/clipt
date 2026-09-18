import { browser } from 'wxt/browser';
import type { Job } from '@/core/job';

/** 작업 상태를 툴바 배지로 표시한다 (docs/ux-design.md 7절) */
const REC_COLOR = '#E5484D';

export async function applyBadge(job: Job | null): Promise<void> {
  if (job?.phase === 'recording') {
    await browser.action.setBadgeBackgroundColor({ color: REC_COLOR });
    await browser.action.setBadgeText({ text: 'REC' });
    return;
  }
  if (job?.progress && job.progress.total > 1) {
    await browser.action.setBadgeText({ text: `${job.progress.done}/${job.progress.total}` });
    return;
  }
  await browser.action.setBadgeText({ text: '' });
}
