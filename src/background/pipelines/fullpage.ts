import type { Job } from '@/core/job';
import { sendToTab } from '@/shared/messages';
import { loadSettings } from '@/shared/settings';
import { ensureContentScript } from '../access';
import { activeTargetTab, finishCapture, outputFormat } from '../finish';
import { transitionJob } from '../jobs';
import { stitchCapture } from '../stitch';
import { waitForPopupClosed } from './visible';

/**
 * 전체 페이지 캡처 (docs/architecture.md 8.1절): 문서 전체를 스크롤하며 찍어 잇는다.
 * 가로는 뷰포트 너비만 담고, 내부 스크롤 레이아웃은 경고를 남긴 채 보이는 만큼 찍는다.
 */
export async function runFullPageCapture(job: Job): Promise<void> {
  const settings = await loadSettings();
  await waitForPopupClosed();
  const tab = await activeTargetTab(job);
  await ensureContentScript(job.tabId);

  await transitionJob(job.id, 'capturing');
  const page = await sendToTab(job.tabId, 'page:probe', null);
  const image = await stitchCapture(
    job,
    tab.windowId,
    page,
    { x: 0, y: 0, w: page.viewport.w, h: page.scrollSize.h },
    { ...settings, image: { ...settings.image, format: outputFormat(settings) } },
  );

  await finishCapture(job, tab, image, settings, {
    page,
    ...(image.scale < 1 ? { scaled: image.scale } : {}),
    ...(page.innerScroller ? { warnings: ['internal-scroll'] } : {}),
  });
}
