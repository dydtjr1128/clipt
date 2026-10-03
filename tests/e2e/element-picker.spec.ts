import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';

const URL = `${SITE}/blocks`;

async function startElementMode(context: BrowserContext, openControlWindow: () => Promise<Page>) {
  const site = await context.newPage();
  await site.goto(URL);
  await site.bringToFront();
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, URL);
  const htmlStyleBefore = await site.evaluate(() => document.documentElement.getAttribute('style'));
  const started = await sendToBackground(control, 'job:start', { mode: 'element', tabId });
  expect(started.ok, JSON.stringify(started)).toBe(true);
  await expect(site.locator('clipt-overlay .toast')).toBeVisible();
  return { site, control, htmlStyleBefore };
}

/** 하이라이트 박스의 화면 위치 */
async function boxRect(site: Page) {
  return site.locator('clipt-overlay .hl-box').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
}

async function elementRect(site: Page, selector: string) {
  return site.evaluate((selector) => {
    const r = document.querySelector(selector)!.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }, selector);
}

test('링크를 클릭해도 이동하지 않고 선택이 고정된다', async ({ context, openControlWindow }) => {
  const { site } = await startElementMode(context, openControlWindow);
  const link = (await site.locator('#link').boundingBox())!;

  await site.mouse.move(link.x + 10, link.y + 10);
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('a#link');
  await expect.poll(() => boxRect(site)).toEqual(await elementRect(site, '#link'));

  await site.mouse.click(link.x + 10, link.y + 10);
  await expect(site.locator('clipt-overlay .hl-box')).toHaveClass(/is-locked/);
  await site.waitForTimeout(300);
  expect(site.url()).toBe(URL); // 링크 이동 없음

  // 고정 후에는 마우스를 움직여도 선택이 바뀌지 않는다
  const block = (await site.locator('#block').boundingBox())!;
  await site.mouse.move(block.x + 20, block.y + 20);
  await site.waitForTimeout(100);
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('a#link');
});

test('Shadow DOM 내부 요소가 하이라이트된다', async ({ context, openControlWindow }) => {
  const { site } = await startElementMode(context, openControlWindow);
  const inner = (await site.locator('#host').boundingBox())!;
  await site.mouse.move(inner.x + 20, inner.y + 15);
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('button#inner');
  const innerRect = await site.evaluate(() => {
    const r = document
      .getElementById('host')!
      .shadowRoot!.getElementById('inner')!
      .getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
  await expect.poll(() => boxRect(site)).toEqual(innerRect);
});

test('Shadow DOM 최상위 요소 사이를 ←/→로 이동한다', async ({ context, openControlWindow }) => {
  const { site } = await startElementMode(context, openControlWindow);
  const host = (await site.locator('#host').boundingBox())!;
  await site.mouse.click(host.x + 20, host.y + 15);
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('button#inner');
  await site.keyboard.press('ArrowRight');
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('button#inner2');
  await site.keyboard.press('ArrowLeft');
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('button#inner');
  await expect(site.locator('clipt-overlay .hl-label')).not.toContainText('inner2');
});

test('마우스 없이 Enter로 화면 가운데 요소를 고정하고 키보드만으로 캡처한다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await startElementMode(context, openControlWindow);
  // 마우스를 움직이지 않았으므로 호버한 요소가 없다. Enter로 화면 가운데 요소를 고른다
  await site.keyboard.press('Enter');
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
  const center = await site.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2)!;
    return `${el.localName}${el.id ? `#${el.id}` : ''}`;
  });
  await expect(site.locator('clipt-overlay .hl-label')).toContainText(center);
  // 이후는 기존 키보드 조작 그대로: Enter로 캡처
  const opened = context.waitForEvent('page', (p) => p.url().includes('/result.html?id='));
  await site.keyboard.press('Enter');
  await expect((await opened).locator('.result-media')).toBeVisible();
});

test('호버하던 요소가 페이지에서 바뀌면 키보드 고정은 지금 화면의 요소를 고른다', async ({
  context,
  openControlWindow,
}) => {
  const { site } = await startElementMode(context, openControlWindow);
  const block = (await site.locator('#block').boundingBox())!;
  await site.mouse.move(block.x + 20, block.y + 20);
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('div#block');
  // 페이지 스크립트가 호버하던 요소를 같은 자리의 새 요소로 바꾼다
  await site.evaluate(() => {
    const old = document.getElementById('block')!;
    const next = document.createElement('div');
    next.id = 'block-new';
    next.style.cssText = 'position:absolute;left:200px;top:150px;width:240px;height:120px';
    old.replaceWith(next);
  });
  await site.keyboard.press('Enter');
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('div#block-new');
});

test('호버 중에는 ↓로 호버한 요소를 고정한다', async ({ context, openControlWindow }) => {
  const { site } = await startElementMode(context, openControlWindow);
  const block = (await site.locator('#block').boundingBox())!;
  await site.mouse.move(block.x + 20, block.y + 20);
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('div#block');
  await site.keyboard.press('ArrowDown');
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
  await expect(site.locator('clipt-overlay .hl-label')).toContainText('div#block');
});

test('스크롤 중에도 박스가 요소를 따라간다', async ({ context, openControlWindow }) => {
  const { site } = await startElementMode(context, openControlWindow);
  const block = (await site.locator('#block').boundingBox())!;
  await site.mouse.click(block.x + 20, block.y + 20); // 고정해서 호버가 바뀌지 않게 한다

  for (const y of [120, 60, 0]) {
    await site.evaluate((y) => scrollTo(0, y), y);
    await expect.poll(() => boxRect(site)).toEqual(await elementRect(site, '#block'));
  }
});

test('Esc 두 번이면 종료되고 DOM에 확장 요소·리스너가 남지 않는다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control, htmlStyleBefore } = await startElementMode(context, openControlWindow);
  expect(htmlStyleBefore).toBeNull();
  const link = (await site.locator('#link').boundingBox())!;
  await site.mouse.click(link.x + 10, link.y + 10);
  await expect(site.locator('clipt-overlay .hl-box')).toHaveClass(/is-locked/);

  await site.keyboard.press('Escape'); // 고정 해제 → 호버
  await expect(site.locator('clipt-overlay .hl-box')).not.toHaveClass(/is-locked/);
  await site.keyboard.press('Escape'); // 종료
  await expect(site.locator('clipt-overlay')).toHaveCount(0);
  await expect.poll(async () => (await sendToBackground(control, 'job:get')).data).toBeNull();
  expect(await site.evaluate(() => document.documentElement.getAttribute('style'))).toBe(
    htmlStyleBefore,
  );

  // 클릭 차단 리스너가 남아 있지 않으면 링크가 정상 동작한다
  await site.mouse.click(link.x + 10, link.y + 10);
  await expect(site).toHaveURL(`${SITE}/navigated`);
});
