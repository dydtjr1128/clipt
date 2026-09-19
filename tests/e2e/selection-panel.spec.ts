import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { expectColor, readResult, samplePixels } from './result';
import { PALETTE } from './site';

const URL = `${SITE}/blocks`;

async function lockOn(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  selector: string,
) {
  const site = await context.newPage();
  await site.goto(URL);
  await site.bringToFront();
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, URL);
  await sendToBackground(control, 'job:start', { mode: 'element', tabId });
  await expect(site.locator('clipt-overlay .toast')).toBeVisible();
  const box = (await site.locator(selector).boundingBox())!;
  await site.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
  return { site, control };
}

/** 패널의 슬라이더 값·현재 칩·정보·하이라이트 라벨을 한 번에 읽는다 */
async function panelState(site: Page) {
  const overlay = site.locator('clipt-overlay');
  return {
    slider: await overlay.locator('.slider').inputValue(),
    chip: await overlay.locator('.chip[aria-current="true"]').textContent(),
    info: await overlay.locator('.info-tag').textContent(),
    label: await overlay.locator('.hl-name').textContent(),
  };
}

test('슬라이더를 왼쪽 끝→오른쪽 끝으로 왕복하면 처음 클릭한 요소로 돌아온다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(context, openControlWindow, '#p2');
  expect(await panelState(site)).toEqual({
    slider: '2',
    chip: 'p#p2',
    info: 'p#p2',
    label: 'p#p2',
  });
  await expect(site.locator('clipt-overlay .chip')).toHaveText(['body', 'div#card.card', 'p#p2']);

  const slider = site.locator('clipt-overlay .slider');
  await slider.focus();
  await slider.press('Home');
  await expect
    .poll(() => panelState(site))
    .toMatchObject({ slider: '0', info: 'body', label: 'body' });
  await slider.press('End');
  await expect
    .poll(() => panelState(site))
    .toMatchObject({ slider: '2', info: 'p#p2', label: 'p#p2' });
});

test('키보드로 이동하면 슬라이더·경로·정보가 함께 바뀐다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(context, openControlWindow, '#p2');

  await site.keyboard.press('ArrowUp');
  await expect
    .poll(() => panelState(site))
    .toEqual({
      slider: '1',
      chip: 'div#card.card',
      info: 'div#card.card',
      label: 'div#card.card',
    });
  await site.keyboard.press('ArrowDown');
  await expect.poll(() => panelState(site)).toMatchObject({ slider: '2', info: 'p#p2' });

  await site.keyboard.press('ArrowLeft');
  await expect.poll(() => panelState(site)).toMatchObject({ info: 'p#p1', label: 'p#p1' });
  await site.keyboard.press('ArrowRight');
  await site.keyboard.press('ArrowRight');
  await expect
    .poll(() => panelState(site))
    .toMatchObject({ slider: '2', chip: 'p#p3', info: 'p#p3' });
  // 마지막 형제에서 오른쪽은 그대로
  await site.keyboard.press('ArrowRight');
  await expect.poll(() => panelState(site)).toMatchObject({ info: 'p#p3' });
});

test('경로 항목을 클릭하면 해당 요소가 선택된다', async ({ context, openControlWindow }) => {
  const { site } = await lockOn(context, openControlWindow, '#p2');
  await site.locator('clipt-overlay .chip', { hasText: 'div#card.card' }).click();
  await expect
    .poll(() => panelState(site))
    .toEqual({
      slider: '1',
      chip: 'div#card.card',
      info: 'div#card.card',
      label: 'div#card.card',
    });
  // 클릭 후에도 페이지로 이벤트가 새지 않고 경로 기준은 유지된다
  await expect(site.locator('clipt-overlay .chip')).toHaveCount(3);
});

test('패널을 끌어 옮길 수 있고 화면 밖으로 나가지 않는다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(context, openControlWindow, '#block');
  const viewport = await site.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const header = site.locator('clipt-overlay .panel-header');
  const start = (await header.boundingBox())!;

  await site.mouse.move(start.x + 40, start.y + 10);
  await site.mouse.down();
  await site.mouse.move(start.x - 150, start.y - 100, { steps: 5 });
  await site.mouse.up();
  const moved = (await site.locator('clipt-overlay .panel').boundingBox())!;
  const originalPanel = start; // 헤더 기준 이동량 확인
  expect(Math.round(moved.x)).toBeLessThan(Math.round(originalPanel.x));

  for (const [x, y] of [
    [viewport.w + 400, viewport.h + 400],
    [-400, -400],
  ] as const) {
    const now = (await header.boundingBox())!;
    await site.mouse.move(now.x + 40, now.y + 10);
    await site.mouse.down();
    await site.mouse.move(x, y, { steps: 5 });
    await site.mouse.up();
    const panel = (await site.locator('clipt-overlay .panel').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.w);
    expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.h);
  }
  // 드래그해도 선택은 그대로
  expect((await panelState(site)).info).toBe('div#block');
});

test('Enter로 선택한 요소만 캡처하고 오버레이는 결과에 없다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await lockOn(context, openControlWindow, '#block');
  const opened = context.waitForEvent('page', (p) => p.url().includes('/result.html?id='));
  await site.keyboard.press('Enter');
  const result = await opened;
  const info = await readResult(result);
  expect({ w: info.width, h: info.height }).toEqual({ w: 240, h: 120 });
  expect(info.meta.selector).toBe('body > div#block');
  // 테두리·라벨이 찍혔다면 가장자리 색이 달라진다
  const samples = await samplePixels(result, [
    [0, 0],
    [239, 0],
    [0, 119],
    [239, 119],
    [120, 2],
  ]);
  for (const color of samples) expectColor(color, PALETTE.block);
  await expect(site.locator('clipt-overlay')).toHaveCount(0);
});
