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

  // 측정이 페이지의 Esc 중단을 켜므로 capturing보다 먼저 한다. capturing이 된 순간부터 Esc가 듣는다(#86).
  // 그 사이 작업이 끝나 전환이 실패하면 켜 둔 Esc 중단을 끈다(이후는 stitchCapture가 복원한다)
  const page = await sendToTab(job.tabId, 'page:probe', null);
  try {
    await transitionJob(job.id, 'capturing');
  } catch (error) {
    await sendToTab(job.tabId, 'page:restore', null).catch(() => undefined);
    throw error;
  }
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
