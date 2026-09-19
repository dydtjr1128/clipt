import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { expectColor } from './result';
import { PALETTE } from './site';
import {
  CORNERS,
  jobOf,
  readVideo,
  resultMeta,
  setSettings,
  sleep,
  waitRecording,
  waitResult,
} from './rec';

declare const chrome: typeof browser;

async function open(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  path: string,
  settings?: object,
) {
  const site = await context.newPage();
  await site.goto(`${SITE}${path}`);
  await site.bringToFront();
  const control = await openControlWindow();
  if (settings) await setSettings(control, settings);
  const tabId = await tabIdOf(control, `${SITE}${path}`);
  return { site, control, tabId };
}

async function selectBlockRegion(site: Page) {
  await expect(site.locator('clipt-overlay .catcher')).toBeVisible();
  await site.mouse.move(200, 150);
  await site.mouse.down();
  await site.mouse.move(440, 270, { steps: 8 });
  await site.mouse.up();
  await site.keyboard.press('Enter');
}

test('카운트다운을 보여준 뒤 녹화하고 첫 프레임에 카운트다운이 없다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await open(context, openControlWindow, '/long?h=3000');
  await sendToBackground(control, 'job:start', { mode: 'rec-tab', tabId });

  const number = site.locator('clipt-overlay .countdown-number');
  await expect(number).toHaveText('3');
  expect((await jobOf(control))?.phase).toBe('countdown');
  await expect(number).toHaveText('1', { timeout: 4000 });
  await waitRecording(control, 2);
  await expect(site.locator('clipt-overlay')).toHaveCount(0);

  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  const video = await readVideo(await opened, [[0.5, 0.5]]);
  // 화면 중앙은 첫 번째 색 띠. 카운트다운 원(검은 반투명)이 찍혔다면 어두운 색이 된다
  expectColor(video.pixels[0], PALETTE.bandA, 24);
});

test('카운트다운 중 Esc를 누르면 녹화를 시작하지 않는다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await open(context, openControlWindow, '/long?h=3000', {
    record: { countdownSeconds: 5 },
  });
  await sendToBackground(control, 'job:start', { mode: 'rec-tab', tabId });
  await expect(site.locator('clipt-overlay .countdown-number')).toHaveText('5');
  await site.keyboard.press('Escape');
  await expect(site.locator('clipt-overlay')).toHaveCount(0);
  await expect.poll(() => jobOf(control)).toBeNull();
  await sleep(1500);
  expect(await control.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
});

for (const indicator of ['border', 'widget'] as const) {
  test(`영역 녹화에서 ${indicator} 표시를 켜도 결과 영상에 찍히지 않는다`, async ({
    context,
    openControlWindow,
  }) => {
    const { site, control, tabId } = await open(context, openControlWindow, '/blocks', {
      record: { countdownSeconds: 0, indicator },
    });
    await sendToBackground(control, 'job:start', { mode: 'rec-region', tabId });
    await selectBlockRegion(site);
    await waitRecording(control, 2);

    const mark = site.locator(
      indicator === 'border' ? 'clipt-overlay .rec-border' : 'clipt-overlay .rec-widget',
    );
    await expect(mark).toBeVisible();
    const box = (await mark.boundingBox())!;
    if (indicator === 'border') {
      // 테두리는 선택 영역(200,150 240×120)을 바깥에서 감싼다
      expect(box.x).toBeLessThan(200);
      expect(box.y).toBeLessThan(150);
      expect(box.x + box.width).toBeGreaterThan(440);
    } else {
      // 위젯은 선택 영역과 겹치지 않는다
      const apart =
        box.x > 440 || box.x + box.width < 200 || box.y > 270 || box.y + box.height < 150;
      expect(apart).toBe(true);
    }

    const opened = waitResult(context);
    if (indicator === 'widget') await site.locator('clipt-overlay [data-action="stop"]').click();
    else await sendToBackground(control, 'job:stop', {});
    const video = await readVideo(await opened, CORNERS);
    for (const color of video.pixels) expectColor(color, PALETTE.block, 24);
    await expect(site.locator('clipt-overlay')).toHaveCount(0);
  });
}

test('위젯으로 일시정지·재개하면 타이머와 영상 길이가 일치한다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await open(context, openControlWindow, '/blocks', {
    record: { countdownSeconds: 0, indicator: 'widget' },
  });
  await sendToBackground(control, 'job:start', { mode: 'rec-tab', tabId });
  await waitRecording(control, 1);
  const widget = site.locator('clipt-overlay .rec-widget');
  await expect(widget).toBeVisible();
  await sleep(1200);

  await widget.locator('[data-action="pause"]').click();
  await expect(widget).toHaveClass(/is-paused/);
  const frozen = await widget.locator('.rec-widget-time').textContent();
  await sleep(2500);
  expect(await widget.locator('.rec-widget-time').textContent()).toBe(frozen); // 타이머 멈춤
  await widget.locator('[data-action="pause"]').click();
  await expect(widget).not.toHaveClass(/is-paused/);
  await sleep(1500);

  const job = (await jobOf(control))!;
  const timerMs = Date.now() - job.startedAt! - (job.pausedTotal ?? 0);
  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  const video = await readVideo(await opened);
  expect(Math.abs(video.duration - timerMs / 1000)).toBeLessThan(1);
});

test('최대 길이에 도달하면 자동으로 끝내고 결과에 알린다', async ({
  context,
  openControlWindow,
}) => {
  const { control, tabId } = await open(context, openControlWindow, '/long?h=3000', {
    record: { countdownSeconds: 0, maxMinutes: 0.05 }, // 3초
  });
  const opened = waitResult(context, 40_000);
  await sendToBackground(control, 'job:start', { mode: 'rec-tab', tabId });
  const result = await opened;
  expect((await resultMeta(result)).warnings).toContain('max-length');
  const video = await readVideo(result);
  expect(video.duration).toBeGreaterThan(2);
  expect(video.duration).toBeLessThan(6.5);
  await expect.poll(() => jobOf(control)).toBeNull();
});

test('비정상 종료로 남은 녹화를 결과 페이지에서 복구한다', async ({
  context,
  openControlWindow,
  openExtensionPage,
  serviceWorker,
}) => {
  const { control, tabId } = await open(context, openControlWindow, '/long?h=3000', {
    record: { countdownSeconds: 0 },
  });
  await sendToBackground(control, 'job:start', { mode: 'rec-tab', tabId });
  await waitRecording(control, 3);
  // 브라우저가 꺼진 것처럼: 오프스크린을 강제로 닫고 작업 상태를 지운다. chunk만 남는다
  await serviceWorker.evaluate(async () => {
    await chrome.offscreen.closeDocument();
    await chrome.storage.session.remove('job');
  });

  const page = await openExtensionPage('result.html');
  const banner = page.locator('[data-banner="recovery"]');
  await expect(banner).toBeVisible();
  await banner.getByRole('button').first().click();
  await expect(page).toHaveURL(/result\.html\?id=/);
  const video = await readVideo(page);
  expect(video.duration).toBeGreaterThan(1.5);
  expect((await resultMeta(page)).warnings).toEqual(['recovered']);
  await expect(page.locator('[data-banner="recovery"]')).toHaveCount(0);
});
