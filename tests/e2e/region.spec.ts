import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { expectColor, readResult, samplePixels } from './result';
import { PALETTE } from './site';

declare const chrome: typeof browser;

async function openSite(context: BrowserContext, path: string): Promise<Page> {
  const site = await context.newPage();
  await site.goto(`${SITE}${path}`);
  await site.bringToFront();
  return site;
}

/** 영역 선택을 시작하고 오버레이가 뜰 때까지 기다린다 */
async function startRegion(control: Page, site: Page, tabId: number): Promise<void> {
  const started = await sendToBackground(control, 'job:start', { mode: 'region', tabId });
  expect(started.ok, JSON.stringify(started)).toBe(true);
  await expect(site.locator('clipt-overlay .catcher')).toBeVisible();
  // 영역을 그리기 전에는 확정 바·선택 상자·크기 라벨이 보이지 않는다
  await expect(site.locator('clipt-overlay .bar')).toBeHidden();
  await expect(site.locator('clipt-overlay .selection')).toBeHidden();
  await expect(site.locator('clipt-overlay .size')).toBeHidden();
}

async function drag(site: Page, from: [number, number], to: [number, number]): Promise<void> {
  await site.mouse.move(...from);
  await site.mouse.down();
  await site.mouse.move(...to, { steps: 8 });
  await site.mouse.up();
}

function waitResult(context: BrowserContext): Promise<Page> {
  return context.waitForEvent('page', (p) => p.url().includes('/result.html?id='));
}

test.describe('DPR 2', () => {
  test.use({ scaleFactor: 2 });

  test('선택한 영역과 결과 이미지 내용·크기가 일치한다', async ({ context, openControlWindow }) => {
    const site = await openSite(context, '/blocks');
    const control = await openControlWindow();
    const tabId = await tabIdOf(control, `${SITE}/blocks`);
    await startRegion(control, site, tabId);

    // #block: left 200, top 150, 240×120
    await drag(site, [200, 150], [440, 270]);
    await expect(site.locator('clipt-overlay .size')).toHaveText('240×120');
    const opened = waitResult(context);
    await site.keyboard.press('Enter');
    const result = await opened;
    const info = await readResult(result);

    expect({ w: info.width, h: info.height }).toEqual({ w: 480, h: 240 });
    const samples = await samplePixels(result, [
      [2, 2],
      [477, 2],
      [2, 237],
      [477, 237],
      [240, 120],
    ]);
    for (const color of samples) expectColor(color, PALETTE.block);
    // 오버레이는 결과 전에 제거된다
    await expect(site.locator('clipt-overlay')).toHaveCount(0);
  });
});

test('브라우저 확대 125%에서도 선택 위치가 정확하다', async ({ context, openControlWindow }) => {
  const site = await openSite(context, '/blocks');
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, `${SITE}/blocks`);
  await control.evaluate((tabId) => chrome.tabs.setZoom(tabId, 1.25), tabId);
  await expect.poll(() => site.evaluate(() => devicePixelRatio)).toBeCloseTo(1.25, 2);

  await startRegion(control, site, tabId);
  const box = (await site.locator('#block').boundingBox())!;
  await drag(site, [box.x + 1, box.y + 1], [box.x + box.width - 1, box.y + box.height - 1]);
  const opened = waitResult(context);
  await site.keyboard.press('Enter');
  const result = await opened;
  const info = await readResult(result);

  // 블록 안쪽 1px씩 선택했으므로 결과는 (240-2)×(120-2) CSS px × 1.25
  expect(Math.abs(info.width - 238 * 1.25)).toBeLessThanOrEqual(2);
  expect(Math.abs(info.height - 118 * 1.25)).toBeLessThanOrEqual(2);
  const samples = await samplePixels(result, [
    [1, 1],
    [info.width - 2, 1],
    [1, info.height - 2],
    [info.width - 2, info.height - 2],
  ]);
  for (const color of samples) expectColor(color, PALETTE.block);
});

test('가장자리 자동 스크롤로 뷰포트를 넘는 영역을 선택하면 이어 붙여 캡처한다', async ({
  context,
  openControlWindow,
}) => {
  const site = await openSite(context, '/long?h=4000');
  const vh = await site.evaluate(() => innerHeight);
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, `${SITE}/long?h=4000`);
  await startRegion(control, site, tabId);

  await site.mouse.move(100, 200);
  await site.mouse.down();
  await site.mouse.move(400, vh - 4, { steps: 5 }); // 아래 가장자리에서 자동 스크롤
  await expect.poll(() => site.evaluate(() => scrollY), { timeout: 10_000 }).toBeGreaterThan(900);
  await site.mouse.move(400, vh / 2, { steps: 3 }); // 가운데로 돌아오면 멈춘다
  await site.mouse.up();

  const label = await site.locator('clipt-overlay .size').textContent();
  const [w, h] = label!.split('×').map(Number) as [number, number];
  expect(w).toBe(300);
  expect(h).toBeGreaterThan(vh);

  const opened = waitResult(context);
  await site.keyboard.press('Enter');
  const result = await opened;
  const info = await readResult(result);
  expect({ w: info.width, h: info.height }).toEqual({ w, h });

  // 선택은 문서 y=200에서 시작: 결과 y=100은 첫 띠(0~500), y=400은 둘째 띠(500~1000)
  const [first, second, last] = await samplePixels(result, [
    [10, 100],
    [10, 400],
    [10, h - 5],
  ]);
  expectColor(first, PALETTE.bandA);
  expectColor(second, PALETTE.bandB);
  const lastBand = Math.floor((200 + h - 5) / 500) % 2 ? PALETTE.bandB : PALETTE.bandA;
  expectColor(last, lastBand);
});

test('Esc를 누르면 즉시 취소되고 오버레이가 남지 않는다', async ({
  context,
  openControlWindow,
}) => {
  const site = await openSite(context, '/blocks');
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, `${SITE}/blocks`);
  await startRegion(control, site, tabId);
  await drag(site, [100, 100], [300, 250]);

  await site.keyboard.press('Escape');
  await expect(site.locator('clipt-overlay')).toHaveCount(0);
  await expect.poll(async () => (await sendToBackground(control, 'job:get')).data).toBeNull();
  // 페이지 원래 동작이 막히지 않았는지: 클릭이 다시 페이지에 전달된다
  await site.evaluate(() => {
    (window as unknown as { clicked: boolean }).clicked = false;
    addEventListener('click', () => ((window as unknown as { clicked: boolean }).clicked = true));
  });
  await site.mouse.click(50, 50);
  expect(await site.evaluate(() => (window as unknown as { clicked: boolean }).clicked)).toBe(true);
});

test('작은 드래그는 무시하고, 팝업에서 취소하면 오버레이가 닫힌다', async ({
  context,
  openControlWindow,
}) => {
  const site = await openSite(context, '/blocks');
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, `${SITE}/blocks`);
  await startRegion(control, site, tabId);

  await drag(site, [100, 100], [104, 103]); // 8px 미만
  await expect(site.locator('clipt-overlay .selection')).toBeHidden();

  await sendToBackground(control, 'job:cancel', {});
  await expect(site.locator('clipt-overlay')).toHaveCount(0);
});
