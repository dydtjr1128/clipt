import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { expectColor, readResult, samplePixels } from './result';
import { PALETTE } from './site';

/** 요소 모드를 시작하고 selector 요소를 클릭해 고정한다 */
async function lockOn(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  path: string,
  selector: string,
  /** 요소 왼쪽 위에서 클릭할 위치 */
  offset: { x: number; y: number } = { x: 20, y: 20 },
) {
  const site = await context.newPage();
  await site.goto(`${SITE}${path}`);
  await site.bringToFront();
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, `${SITE}${path}`);
  await site.locator(selector).scrollIntoViewIfNeeded();
  await sendToBackground(control, 'job:start', { mode: 'element', tabId });
  await expect(site.locator('clipt-overlay .toast')).toBeVisible();
  const box = (await site.locator(selector).boundingBox())!;
  await site.mouse.click(box.x + offset.x, box.y + offset.y);
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
  return { site, control };
}

async function captureWithEnter(context: BrowserContext, site: Page) {
  const opened = context.waitForEvent('page', {
    predicate: (p) => p.url().includes('/result.html?id='),
    timeout: 60_000,
  });
  await site.keyboard.press('Enter');
  const result = await opened;
  return { result, info: await readResult(result) };
}

test('뷰포트 높이의 3배인 요소를 한 장으로 캡처하고 고정 헤더가 덮지 않는다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(
    context,
    openControlWindow,
    '/blocks?tall=2400&fixed=1',
    '#tall',
    { x: 20, y: 120 }, // 고정 헤더(0~60px) 아래를 클릭
  );
  const vh = await site.evaluate(() => innerHeight);
  expect(2400).toBeGreaterThanOrEqual(vh * 3);
  await expect(site.locator('clipt-overlay .info-tag')).toHaveText('div#tall');

  const { result, info } = await captureWithEnter(context, site);
  expect({ w: info.width, h: info.height }).toEqual({ w: 200, h: 2400 });
  const [top, topEdge, mid1, mid2, bottom] = await samplePixels(result, [
    [100, 10], // 첫 조각 위쪽: 고정 헤더(빨강)가 덮으면 실패
    [0, 30], // 왼쪽 가장자리: 하이라이트 테두리가 찍히면 실패
    [100, 1150],
    [100, 1250],
    [199, 2390],
  ]);
  expectColor(top, PALETTE.bandA);
  expectColor(topEdge, PALETTE.bandA);
  expectColor(mid1, PALETTE.bandA);
  expectColor(mid2, PALETTE.bandB);
  expectColor(bottom, PALETTE.bandB);
  // 고정 헤더는 캡처 후 다시 보인다
  expect(
    await site.evaluate(() => getComputedStyle(document.getElementById('hdr')!).visibility),
  ).toBe('visible');
});

test('화면 밖으로 스크롤된 요소를 캡처해도 스크롤 위치를 복원한다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(context, openControlWindow, '/blocks', '#block');
  await site.evaluate(() => scrollTo(0, 900)); // 선택한 요소(150~270)가 화면 밖으로
  await expect.poll(() => site.evaluate(() => scrollY)).toBe(900);

  const { result, info } = await captureWithEnter(context, site);
  expect({ w: info.width, h: info.height }).toEqual({ w: 240, h: 120 });
  for (const color of await samplePixels(result, [
    [0, 0],
    [239, 119],
    [120, 60],
  ])) {
    expectColor(color, PALETTE.block);
  }
  await expect.poll(() => site.evaluate(() => scrollY)).toBe(900);
  await expect(site.locator('clipt-overlay')).toHaveCount(0);
});

test('고정 요소 자체를 선택하면 숨기지 않고 캡처한다', async ({ context, openControlWindow }) => {
  const { site } = await lockOn(context, openControlWindow, '/blocks?fixed=1', '#hdr', {
    x: 50,
    y: 30,
  });
  await expect(site.locator('clipt-overlay .info-tag')).toHaveText('div#hdr');
  const vw = await site.evaluate(() => innerWidth);

  const { result, info } = await captureWithEnter(context, site);
  expect({ w: info.width, h: info.height }).toEqual({ w: vw, h: 60 });
  expectColor((await samplePixels(result, [[vw / 2, 30]]))[0], PALETTE.header);
});

test('스크롤 영역에 잘린 요소는 영역을 스크롤해 전체를 캡처한다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(context, openControlWindow, '/blocks', '#scroller', {
    x: 50,
    y: 40,
  });
  await expect(site.locator('clipt-overlay .info-tag')).toHaveText('div#inner-tall');
  await expect(site.locator('clipt-overlay .info-clipped')).toHaveCount(0);
  const width = await site.evaluate(() => document.getElementById('scroller')!.clientWidth);

  const { result, info } = await captureWithEnter(context, site);
  expect({ w: info.width, h: info.height }).toEqual({ w: width, h: 600 });
  expect(info.meta.warnings).toBeUndefined();
  const [top, bottom] = await samplePixels(result, [
    [width / 2, 10],
    [width / 2, 590],
  ]);
  expectColor(top, PALETTE.bandA);
  expectColor(bottom, PALETTE.bandB);
});

test('화면에 일부만 보이는 스크롤 영역 자체를 고르면 창과 영역을 스크롤해 내용 전체를 담고 되돌린다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(context, openControlWindow, '/blocks', '#scroller', {
    x: 50,
    y: 40,
  });
  await site.keyboard.press('ArrowUp');
  await expect(site.locator('clipt-overlay .info-tag')).toHaveText('div#scroller');
  await expect(site.locator('clipt-overlay .info-clipped')).toHaveCount(0);
  // 영역(문서 y 700~850)이 화면 아래로 일부 나가게 한다(창 크기에 따라 나간 높이가 다르다)
  await site.evaluate(() => {
    document.getElementById('scroller')!.scrollTop = 100;
    scrollTo(0, 0);
  });
  const before = await site.evaluate(() => {
    const s = document.getElementById('scroller')!;
    return { width: s.clientWidth, hidden: s.getBoundingClientRect().bottom - innerHeight };
  });
  expect(before.hidden).toBeGreaterThan(0);

  const { result, info } = await captureWithEnter(context, site);
  expect({ w: info.width, h: info.height }).toEqual({ w: before.width, h: 600 });
  expect(info.meta.warnings).toBeUndefined();
  const [top, bottom] = await samplePixels(result, [
    [before.width / 2, 10],
    [before.width / 2, 590],
  ]);
  expectColor(top, PALETTE.bandA);
  expectColor(bottom, PALETTE.bandB);
  expect(
    await site.evaluate(() => [scrollY, document.getElementById('scroller')!.scrollTop]),
  ).toEqual([0, 100]);
});

test('스크롤로 펼칠 수 없게 가려진 요소는 보이는 부분만 캡처하고 일부 잘림을 알린다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(context, openControlWindow, '/blocks', '#clip');
  await expect(site.locator('clipt-overlay .info-tag')).toHaveText('div#clip-inner');
  await expect(site.locator('clipt-overlay .info-clipped')).toBeVisible();

  const { info } = await captureWithEnter(context, site);
  expect({ w: info.width, h: info.height }).toEqual({ w: 200, h: 100 });
  expect(info.meta.warnings).toEqual(['clipped']);
});
