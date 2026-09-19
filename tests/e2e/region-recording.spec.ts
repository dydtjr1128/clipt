import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { expectColor } from './result';
import { PALETTE } from './site';

declare const chrome: typeof browser;

type JobData = { phase: string; media?: { width: number; height: number } } | null;

const URL = `${SITE}/blocks`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const job = async (control: Page) => (await sendToBackground(control, 'job:get')).data as JobData;

async function openSite(context: BrowserContext, openControlWindow: () => Promise<Page>) {
  const site = await context.newPage();
  await site.goto(URL);
  await site.bringToFront();
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, URL);
  return { site, control, tabId };
}

function chunksOf(control: Page) {
  return control.evaluate(
    async () =>
      (
        (await chrome.runtime.sendMessage({
          __clipt: 1,
          target: 'offscreen',
          type: 'rec:status',
          payload: null,
        })) as { data: { chunks: number } | null }
      ).data?.chunks ?? 0,
  );
}

/** 녹화가 시작돼 chunk가 쌓일 때까지 기다린 뒤 중지하고 결과 페이지를 돌려준다 */
async function recordThenStop(context: BrowserContext, control: Page): Promise<Page> {
  await expect.poll(async () => (await job(control))?.phase, { timeout: 15_000 }).toBe('recording');
  await expect.poll(() => chunksOf(control), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const opened = context.waitForEvent('page', {
    predicate: (p) => p.url().includes('/result.html?id='),
    timeout: 30_000,
  });
  await sendToBackground(control, 'job:stop', {});
  return opened;
}

/** 결과 영상 첫 프레임의 크기와 픽셀. 선택 UI가 첫 프레임부터 없어야 한다 */
async function videoFrame(result: Page, points: [number, number][]) {
  const video = result.locator('video.result-media');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  return video.evaluate(async (v: HTMLVideoElement, points) => {
    v.muted = true;
    await new Promise<void>((resolve) => {
      v.addEventListener('seeked', () => resolve(), { once: true });
      v.currentTime = 0.01;
    });
    const c = new OffscreenCanvas(v.videoWidth, v.videoHeight);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, 0, 0);
    return {
      width: v.videoWidth,
      height: v.videoHeight,
      pixels: points.map(([x, y]) => [
        ...ctx
          .getImageData(Math.round(x * v.videoWidth), Math.round(y * v.videoHeight), 1, 1)
          .data.slice(0, 3),
      ]),
    };
  }, points);
}

/** 가장자리 안쪽 네 모서리와 중앙(비율 좌표) */
const CORNERS: [number, number][] = [
  [0.05, 0.08],
  [0.95, 0.08],
  [0.05, 0.92],
  [0.95, 0.92],
  [0.5, 0.5],
];

async function dragRegion(site: Page, from: [number, number], to: [number, number]) {
  await expect(site.locator('clipt-overlay .catcher')).toBeVisible();
  await site.mouse.move(...from);
  await site.mouse.down();
  await site.mouse.move(...to, { steps: 8 });
  await site.mouse.up();
  await site.keyboard.press('Enter');
}

test.describe('DPR 2', () => {
  test.use({ scaleFactor: 2 });

  test('영역 녹화 결과가 선택 범위만 담고 선택 UI는 찍히지 않는다', async ({
    context,
    openControlWindow,
  }) => {
    const { site, control, tabId } = await openSite(context, openControlWindow);
    await sendToBackground(control, 'job:start', { mode: 'rec-region', tabId });
    await dragRegion(site, [200, 150], [440, 270]); // #block 240×120
    await expect(site.locator('clipt-overlay')).toHaveCount(0);

    const result = await recordThenStop(context, control);
    const frame = await videoFrame(result, CORNERS);
    expect(Math.abs(frame.width - 480)).toBeLessThanOrEqual(2);
    expect(Math.abs(frame.height - 240)).toBeLessThanOrEqual(2);
    for (const color of frame.pixels) expectColor(color, PALETTE.block, 24);
  });
});

test('브라우저 확대 125%에서도 요소 녹화 범위가 요소와 일치한다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await openSite(context, openControlWindow);
  await control.evaluate((tabId) => chrome.tabs.setZoom(tabId, 1.25), tabId);
  await expect.poll(() => site.evaluate(() => devicePixelRatio)).toBeCloseTo(1.25, 2);

  await sendToBackground(control, 'job:start', { mode: 'rec-element', tabId });
  await expect(site.locator('clipt-overlay .toast')).toBeVisible();
  const box = (await site.locator('#block').boundingBox())!;
  await site.mouse.click(box.x + 20, box.y + 20);
  await expect(site.locator('clipt-overlay .panel')).toContainText('녹화 시작');
  await site.keyboard.press('Enter');
  await expect(site.locator('clipt-overlay')).toHaveCount(0);

  const result = await recordThenStop(context, control);
  const frame = await videoFrame(result, CORNERS);
  expect(Math.abs(frame.width - 240 * 1.25)).toBeLessThanOrEqual(4);
  expect(Math.abs(frame.height - 120 * 1.25)).toBeLessThanOrEqual(4);
  for (const color of frame.pixels) expectColor(color, PALETTE.block, 24);
});

test('영역 녹화 중 페이지를 이동하면 멈추고 결과에 알린다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await openSite(context, openControlWindow);
  await sendToBackground(control, 'job:start', { mode: 'rec-region', tabId });
  await dragRegion(site, [100, 100], [400, 300]);
  await expect.poll(async () => (await job(control))?.phase, { timeout: 15_000 }).toBe('recording');
  await expect.poll(() => chunksOf(control), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

  const opened = context.waitForEvent('page', (p) => p.url().includes('/result.html?id='));
  await site.goto(`${SITE}/other`);
  const result = await opened;
  const warnings = await result.evaluate(async () => {
    const id = new URLSearchParams(location.search).get('id')!;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('clipt');
      req.onsuccess = () => resolve(req.result);
    });
    const meta = await new Promise<{ warnings?: string[] }>((resolve) => {
      const req = db.transaction('results').objectStore('results').get(id);
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return meta.warnings;
  });
  expect(warnings).toContain('layout-changed');
  await expect.poll(() => job(control)).toBeNull();
});

test('녹화용 영역 선택은 화면 밖으로 넓어지지 않는다', async ({ context, openControlWindow }) => {
  const { site, control, tabId } = await openSite(context, openControlWindow);
  const vh = await site.evaluate(() => innerHeight);
  await sendToBackground(control, 'job:start', { mode: 'rec-region', tabId });
  await expect(site.locator('clipt-overlay .catcher')).toBeVisible();
  await site.mouse.move(100, 200);
  await site.mouse.down();
  await site.mouse.move(300, vh - 3, { steps: 5 });
  await sleep(800);
  expect(await site.evaluate(() => scrollY)).toBe(0); // 자동 스크롤 없음
  await site.mouse.up();
  const [, h] = (await site.locator('clipt-overlay .size').textContent())!.split('×').map(Number);
  expect(h).toBeLessThanOrEqual(vh - 200);
  await sendToBackground(control, 'job:cancel', {});
});

test('영역 녹화 중 창 크기가 바뀌어 화면 비율이 달라지면 멈추고 결과에 알린다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, tabId } = await openSite(context, openControlWindow);
  await sendToBackground(control, 'job:start', { mode: 'rec-region', tabId });
  await dragRegion(site, [100, 100], [400, 300]);
  await expect.poll(async () => (await job(control))?.phase, { timeout: 15_000 }).toBe('recording');
  await expect.poll(() => chunksOf(control), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

  const opened = context.waitForEvent('page', {
    predicate: (p) => p.url().includes('/result.html?id='),
    timeout: 20_000,
  });
  await control.evaluate(async (tabId) => {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { width: 700, height: 800 });
  }, tabId);
  const result = await opened;
  const warnings = await result.evaluate(async () => {
    const id = new URLSearchParams(location.search).get('id')!;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('clipt');
      req.onsuccess = () => resolve(req.result);
    });
    const meta = await new Promise<{ warnings?: string[] }>((resolve) => {
      const req = db.transaction('results').objectStore('results').get(id);
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return meta.warnings;
  });
  expect(warnings).toContain('layout-changed');
  await expect.poll(() => job(control)).toBeNull();
});

test.describe('1080p', () => {
  test.use({ windowSize: [1920, 1200] });

  // 30fps 절대값은 헤드리스 탭 캡처 자체가 약 21fps로 제한돼 실제 Chrome에서 수동 확인한다.
  // 여기서는 크롭 단계가 원본 프레임을 떨어뜨리지 않는지 확인한다.
  test('1080p 탭의 절반 영역 녹화에서 크롭 단계가 프레임을 떨어뜨리지 않는다', async ({
    context,
    openControlWindow,
  }) => {
    const { site, control, tabId } = await openSite(context, openControlWindow);
    const vp = await site.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    expect(vp.w).toBeGreaterThanOrEqual(1900);
    await sendToBackground(control, 'job:start', { mode: 'rec-region', tabId });
    await dragRegion(site, [0, 0], [vp.w / 2, vp.h / 2]);
    await expect
      .poll(async () => (await job(control))?.phase, { timeout: 15_000 })
      .toBe('recording');

    const frames = () =>
      control.evaluate(
        async () =>
          (
            (await chrome.runtime.sendMessage({
              __clipt: 1,
              target: 'offscreen',
              type: 'rec:status',
              payload: null,
            })) as { data: { frames?: { in: number; out: number } } | null }
          ).data?.frames ?? { in: 0, out: 0 },
      );
    await sleep(1000);
    const a = await frames();
    await sleep(3000);
    const b = await frames();
    const received = b.in - a.in;
    const sent = b.out - a.out;
    expect(received).toBeGreaterThan(30); // 3초 동안 원본 프레임이 들어왔다
    expect(sent / received).toBeGreaterThanOrEqual(0.98);
    await sendToBackground(control, 'job:cancel', {});
  });
});
