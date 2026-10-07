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
 * 가로는 뷰포트 너비만 담는다. 문서 대신 안쪽 영역이 스크롤되는 앱형 페이지는 그 영역의 내용 전체를
 * 이어 붙이고 결과에 알린다. 그 영역을 쓸 수 없으면 경고를 남긴 채 보이는 만큼 찍는다.
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
    page.area ? { area: 'main' } : {},
  );

  const warning = image.scrolledArea
    ? 'scroll-area'
    : page.innerScroller
      ? 'internal-scroll'
      : null;
  await finishCapture(job, tab, image, settings, {
    page,
    ...(image.scale < 1 ? { scaled: image.scale } : {}),
    ...(warning ? { warnings: [warning] } : {}),
  });
}
