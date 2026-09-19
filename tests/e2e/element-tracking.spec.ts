import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { expectColor } from './result';
import { PALETTE } from './site';
import { CORNERS, chunksOf, readVideo, setSettings, sleep, waitRecording, waitResult } from './rec';

declare const chrome: typeof browser;

// 세로로 스크롤되는 페이지. #block은 (200,150)에 240×120
const PATH = '/blocks?tall=2000';
const BLACK = [0, 0, 0] as const;

async function open(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  indicator: 'none' | 'border' | 'widget' = 'none',
) {
  const site = await context.newPage();
  await site.goto(`${SITE}${PATH}`);
  await site.bringToFront();
  const control = await openControlWindow();
  await setSettings(control, { record: { countdownSeconds: 0, indicator } });
  const tabId = await tabIdOf(control, `${SITE}${PATH}`);
  return { site, control, tabId };
}

async function lockBlock(site: Page, control: Page, tabId: number) {
  await sendToBackground(control, 'job:start', { mode: 'rec-element', tabId });
  await expect(site.locator('clipt-overlay .toast')).toBeVisible();
  await site.mouse.click(220, 170);
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
}

/** 페이지에 변화를 준 뒤 그 화면이 충분히 녹화되도록 chunk가 더 쌓이길 기다리고 멈춘다 */
async function changeThenStop(context: BrowserContext, control: Page, change: () => Promise<void>) {
  await waitRecording(control, 1);
  await change();
  const before = await chunksOf(control);
  await expect
    .poll(() => chunksOf(control), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(before + 2);
  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  return opened;
}

test('요소 따라가기를 켜면 스크롤해도 요소가 영상 안에 유지된다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await open(context, openControlWindow);
  await lockBlock(site, control, tabId);
  const toggle = site.locator('clipt-overlay .panel-follow input');
  await expect(toggle).toBeChecked();
  await site.keyboard.press('Enter');

  const result = await changeThenStop(context, control, () =>
    site.evaluate(() => scrollTo(0, 100)),
  );
  const video = await readVideo(result, CORNERS, 'end');
  expect(Math.abs(video.width - 240)).toBeLessThanOrEqual(2);
  expect(Math.abs(video.height - 120)).toBeLessThanOrEqual(2);
  for (const color of video.pixels) expectColor(color, PALETTE.block, 48);
});

test('요소 따라가기를 끄면 시작 위치를 그대로 녹화하고 선택을 기억한다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await open(context, openControlWindow);
  await lockBlock(site, control, tabId);
  await site.locator('clipt-overlay .panel-follow').click();
  await expect(site.locator('clipt-overlay .panel-follow input')).not.toBeChecked();
  await expect(site.locator('clipt-overlay .panel-follow')).toContainText('지금 화면 위치');
  await site.locator('clipt-overlay .panel-confirm').click();

  const result = await changeThenStop(context, control, () =>
    site.evaluate(() => scrollTo(0, 100)),
  );
  // 요소가 100px 위로 올라가 아래 20px만 범위 위쪽에 남는다
  const video = await readVideo(
    result,
    [
      [0.5, 0.06],
      [0.5, 0.6],
    ],
    'end',
  );
  expect(Math.abs(video.width - 240)).toBeLessThanOrEqual(2);
  expectColor(video.pixels[0], PALETTE.block, 48);
  expectColor(video.pixels[1], PALETTE.background, 48);

  const stored = await control.evaluate(() => chrome.storage.sync.get('settings'));
  expect((stored.settings as { record: { followElement: boolean } }).record.followElement).toBe(
    false,
  );
});

test('녹화 중 요소 크기가 바뀌어도 출력 크기는 그대로고 왜곡 없이 가운데에 맞춘다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await open(context, openControlWindow);
  await lockBlock(site, control, tabId);
  await site.keyboard.press('Enter');

  const result = await changeThenStop(context, control, () =>
    site.evaluate(() => {
      document.getElementById('block')!.style.width = '120px';
    }),
  );
  const video = await readVideo(
    result,
    [
      [0.1, 0.5],
      [0.5, 0.5],
      [0.9, 0.5],
      [0.3, 0.1],
      [0.7, 0.9],
    ],
    'end',
  );
  expect(Math.abs(video.width - 240)).toBeLessThanOrEqual(2);
  expect(Math.abs(video.height - 120)).toBeLessThanOrEqual(2);
  // 120×120이 된 요소가 확대 없이 가운데(60~180px)에 있고 양옆은 검은 여백
  expectColor(video.pixels[0], BLACK, 48);
  expectColor(video.pixels[1], PALETTE.block, 48);
  expectColor(video.pixels[2], BLACK, 48);
  expectColor(video.pixels[3], PALETTE.block, 48);
  expectColor(video.pixels[4], PALETTE.block, 48);
});

test('요소가 화면 밖으로 나가면 직전 화면을 유지한다', async ({ context, openControlWindow }) => {
  const { site, control, tabId } = await open(context, openControlWindow);
  await lockBlock(site, control, tabId);
  await site.keyboard.press('Enter');

  const result = await changeThenStop(context, control, () =>
    site.evaluate(() => scrollTo(0, 600)),
  );
  const video = await readVideo(result, CORNERS, 'end');
  for (const color of video.pixels) expectColor(color, PALETTE.block, 48);
});

test('요소를 따라가는 동안 테두리 표시도 따라가며 영상에 찍히지 않는다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await open(context, openControlWindow, 'border');
  await lockBlock(site, control, tabId);
  await site.keyboard.press('Enter');
  await waitRecording(control, 1);
  await site.evaluate(() => scrollTo(0, 60));
  await sleep(300);

  const border = (await site.locator('clipt-overlay .rec-border').boundingBox())!;
  const block = (await site.locator('#block').boundingBox())!;
  expect(border.y).toBeLessThan(block.y);
  expect(block.y - border.y).toBeLessThanOrEqual(6);

  const before = await chunksOf(control);
  await expect
    .poll(() => chunksOf(control), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(before + 2);
  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  const video = await readVideo(await opened, CORNERS, 'end');
  for (const color of video.pixels) expectColor(color, PALETTE.block, 48);
});
