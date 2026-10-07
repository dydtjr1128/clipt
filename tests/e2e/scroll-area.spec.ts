import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import {
  expectColor,
  readResult,
  samplePixels,
  startAndWaitResult,
  type ResultInfo,
} from './result';
import { PALETTE } from './site';

/**
 * 문서 대신 안쪽 영역이 스크롤되는 앱형 페이지(`/app`)의 전체 페이지·요소 캡처 (#79).
 * 결과는 스크롤 내용의 색 띠 순서로 검증한다.
 */

/** 스크롤 내용 y(CSS px)의 색 띠. 띠는 sticky 머리(top) 아래에서 500px마다 바뀐다 */
function bandAt(y: number, top = 0): readonly number[] {
  return Math.floor((y - top) / 500) % 2 ? PALETTE.bandB : PALETTE.bandA;
}

/** 결과 이미지의 x 위치에서 내용 y(CSS px)마다 색이 띠 순서와 같은지 확인한다 */
async function expectBands(result: Page, x: number, ys: number[], dpr: number, top = 0) {
  const colors = await samplePixels(
    result,
    ys.map((y) => [x, y * dpr] as const),
  );
  colors.forEach((color, i) => expectColor(color, bandAt(ys[i]!, top)));
}

async function openSite(context: BrowserContext, path: string): Promise<Page> {
  const site = await context.newPage();
  await site.goto(`${SITE}${path}`);
  return site;
}

async function captureFullPage(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  site: Page,
): Promise<{ result: Page; info: ResultInfo }> {
  await site.bringToFront();
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, site.url());
  const result = await startAndWaitResult(context, control, { mode: 'fullpage', tabId });
  return { result, info: await readResult(result) };
}

test.describe('전체 페이지', () => {
  test('머리글 아래 스크롤 영역의 내용 전체를 잇고 sticky 머리는 한 번만, 스크롤 위치는 원래대로', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=main&h=3000&sticky=1');
    await site.evaluate(() => {
      document.getElementById('main')!.scrollTop = 200;
    });
    const before = await site.evaluate(() => {
      const main = document.getElementById('main')!;
      return {
        w: main.clientWidth,
        h: main.clientHeight,
        top: main.scrollTop,
        style: main.getAttribute('style'),
        dpr: devicePixelRatio,
      };
    });
    expect(before.top).toBe(200);

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    const d = before.dpr;
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(before.w * d),
      h: Math.round(3040 * d),
    });
    expect(info.meta.warnings).toEqual(['scroll-area']);
    const x = Math.round((before.w * d) / 2);
    const [head, second] = await samplePixels(result, [
      [x, 20 * d], // 첫 조각 맨 위는 sticky 머리(영역 밖 머리글은 담지 않는다)
      [x, (before.h + 20) * d], // 두 번째 조각 맨 위: sticky 머리가 반복되면 실패
    ]);
    expectColor(head, PALETTE.lazy);
    expectColor(second, bandAt(before.h + 20, 40));
    await expectBands(result, x, [290, 1250, 2250, 3030], d, 40);

    const after = await site.evaluate(() => {
      const main = document.getElementById('main')!;
      return {
        top: main.scrollTop,
        style: main.getAttribute('style'),
        scrollY,
        sticky: getComputedStyle(document.getElementById('sticky')!).visibility,
      };
    });
    expect(after).toEqual({ top: 200, style: before.style, scrollY: 0, sticky: 'visible' });
  });

  test('html은 고정이고 body가 스크롤되는 페이지도 내용 전체를 잇는다', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=body&h=3000');
    await site.evaluate(() => {
      document.body.scrollTop = 700;
    });
    const before = await site.evaluate(() => ({
      w: document.body.clientWidth,
      top: document.body.scrollTop,
      dpr: devicePixelRatio,
    }));
    expect(before.top).toBe(700);

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    const d = before.dpr;
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(before.w * d),
      h: Math.round(3000 * d),
    });
    expect(info.meta.warnings).toEqual(['scroll-area']);
    await expectBands(
      result,
      Math.round((before.w * d) / 2),
      [250, 750, 1250, 1750, 2250, 2750],
      d,
    );
    expect(await site.evaluate(() => document.body.scrollTop)).toBe(700);
  });

  test('왼쪽 메뉴와 따로 스크롤되는 오른쪽 본문은 본문 내용 전체를 잇는다', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=sidebar&h=3000');
    await site.evaluate(() => {
      document.getElementById('nav')!.scrollTop = 100;
      document.getElementById('main')!.scrollTop = 900;
    });
    const before = await site.evaluate(() => {
      const main = document.getElementById('main')!;
      return {
        w: main.clientWidth,
        left: main.getBoundingClientRect().left,
        dpr: devicePixelRatio,
      };
    });
    expect(before.left).toBe(200);

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    const d = before.dpr;
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(before.w * d),
      h: Math.round(3000 * d),
    });
    // 왼쪽 끝도 메뉴(빨강)가 아니라 본문 띠
    await expectBands(result, 2, [250, 1250, 2750], d);
    await expectBands(result, Math.round(before.w * d) - 3, [750, 1750], d);
    expect(
      await site.evaluate(() => [
        document.getElementById('nav')!.scrollTop,
        document.getElementById('main')!.scrollTop,
      ]),
    ).toEqual([100, 900]);
  });

  test('본문 가운데에 부유 패널이 떠 있어도 메뉴가 아니라 본문 전체를 잇는다', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=sidebar&h=3000&float=1');
    const before = await site.evaluate(() => {
      const main = document.getElementById('main')!;
      return { w: main.clientWidth, h: main.clientHeight, dpr: devicePixelRatio };
    });

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    const d = before.dpr;
    // 패널이 본문의 가운데 지점들을 가려도 메뉴(200px)를 고르지 않는다
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(before.w * d),
      h: Math.round(3000 * d),
    });
    expect(info.meta.warnings).toEqual(['scroll-area']);
    // 패널은 첫 조각에만 남고 그 뒤 조각은 본문 띠만 보인다
    await expectBands(result, 2, [250], d);
    await expectBands(result, Math.round((before.w * d) / 2), [before.h + 250, 2250], d);
    expect(
      await site.evaluate(() => getComputedStyle(document.getElementById('float')!).visibility),
    ).toBe('visible');
  });

  test('고정된 앱 틀 안 Shadow DOM의 스크롤 영역도 잇고 sticky 머리는 한 번만 담는다', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=shadow&h=3000&sticky=1');
    const before = await site.evaluate(() => {
      const main = document.getElementById('app')!.shadowRoot!.getElementById('main')!;
      return { w: main.clientWidth, h: main.clientHeight, dpr: devicePixelRatio };
    });

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    const d = before.dpr;
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(before.w * d),
      h: Math.round(3040 * d),
    });
    const x = Math.round((before.w * d) / 2);
    const [head, second] = await samplePixels(result, [
      [x, 20 * d],
      [x, (before.h + 20) * d],
    ]);
    expectColor(head, PALETTE.lazy);
    expectColor(second, bandAt(before.h + 20, 40));
    // 영역을 감싼 고정 앱 틀을 숨기면 두 번째 조각부터 배경만 찍힌다
    await expectBands(result, x, [1250, 2250, 3030], d, 40);
    expect(
      await site.evaluate(() => [
        getComputedStyle(document.getElementById('shell')!).visibility,
        getComputedStyle(document.getElementById('app')!.shadowRoot!.getElementById('sticky')!)
          .visibility,
      ]),
    ).toEqual(['visible', 'visible']);
  });

  test('스크롤 스냅이 걸린 영역도 조각이 어긋나지 않고 스냅은 원래대로', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=main&h=3000&snap=1');
    await site.evaluate(() => {
      document.getElementById('main')!.scrollTop = 500;
    });
    const read = () =>
      site.evaluate(() => {
        const main = document.getElementById('main')!;
        return {
          top: main.scrollTop,
          snap: getComputedStyle(main).scrollSnapType,
          style: main.getAttribute('style'),
        };
      });
    const before = await read();
    expect(before.top).toBe(500);
    const { w, dpr } = await site.evaluate(() => ({
      w: document.getElementById('main')!.clientWidth,
      dpr: devicePixelRatio,
    }));

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(w * dpr),
      h: Math.round(3000 * dpr),
    });
    // 스냅이 스크롤 위치를 끌어당기면 조각 아래쪽이 영역 밖에서 잘려 비거나 어긋난다
    const ys = Array.from({ length: 30 }, (_, i) => 50 + i * 100);
    await expectBands(result, Math.round((w * dpr) / 2), ys, dpr);
    expect(await read()).toEqual(before);
  });

  test('문서가 스크롤되고 왼쪽 메뉴만 고정된 페이지는 메뉴를 첫 화면에만 담고 본문 전체를 잇는다', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=fixedside&h=3000');
    const before = await site.evaluate(() => ({
      vw: innerWidth,
      vh: innerHeight,
      dpr: devicePixelRatio,
    }));

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    const d = before.dpr;
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(before.vw * d),
      h: Math.round(3000 * d),
    });
    expect(info.meta.warnings).toBeUndefined();
    const [menu, below] = await samplePixels(result, [
      [100 * d, 100 * d],
      [100 * d, (before.vh + 100) * d],
    ]);
    expectColor(menu, PALETTE.header);
    expectColor(below, PALETTE.background);
    await expectBands(result, 600 * d, [250, 1250, 2750], d);
    expect(
      await site.evaluate(() => getComputedStyle(document.getElementById('nav')!).visibility),
    ).toBe('visible');
  });

  test('머리글·스크롤 목록·바닥글이 있는 짧은 일반 문서는 목록만이 아니라 문서 전체를 잇는다', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=doc&h=3000');
    const before = await site.evaluate(() => ({
      vw: innerWidth,
      vh: innerHeight,
      height: document.documentElement.scrollHeight,
      top: document.getElementById('main')!.getBoundingClientRect().top,
      dpr: devicePixelRatio,
    }));
    // 문서는 조금(뷰포트의 1/4 미만)만 스크롤되고 목록은 화면 높이의 절반 이상이다
    expect(before.height - before.vh).toBeGreaterThan(24);
    expect(before.height - before.vh).toBeLessThan(before.vh / 4);

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    const d = before.dpr;
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(before.vw * d),
      h: Math.round(before.height * d),
    });
    expect(info.meta.warnings).toBeUndefined();
    const x = Math.round((before.vw * d) / 2);
    const [head, list, foot] = await samplePixels(result, [
      [x, (before.top / 2) * d],
      [x, (before.top + 30) * d],
      [x, (before.height - 10) * d],
    ]);
    expectColor(head, PALETTE.header);
    expectColor(list, PALETTE.bandA);
    expectColor(foot, PALETTE.block);
  });

  test('모달을 열어 스크롤을 잠근 짧은 문서는 모달 뒤 목록이 아니라 문서 전체를 잇는다', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=doc&h=3000&modal=1');
    const before = await site.evaluate(() => ({
      vw: innerWidth,
      height: document.documentElement.scrollHeight,
      overflow: getComputedStyle(document.body).overflowY,
      dpr: devicePixelRatio,
    }));
    expect(before.overflow).toBe('hidden');

    const { result, info } = await captureFullPage(context, openControlWindow, site);
    const d = before.dpr;
    expect({ w: info.width, h: info.height }).toEqual({
      w: Math.round(before.vw * d),
      h: Math.round(before.height * d),
    });
    // 목록이 화면 높이의 절반 이상인 안쪽 스크롤 구조라 일부만 담겼을 수 있다고 알린다
    expect(info.meta.warnings).toEqual(['internal-scroll']);
    // 모달은 첫 화면에만 남고, 그 뒤 조각의 바닥글은 그대로 보인다
    const [foot] = await samplePixels(result, [
      [Math.round((before.vw * d) / 2), (before.height - 10) * d],
    ]);
    expectColor(foot, PALETTE.block);
    expect(
      await site.evaluate(() => getComputedStyle(document.getElementById('modal')!).visibility),
    ).toBe('visible');
  });

  for (const scale of ['self', 'body'] as const) {
    test(`확대·축소돼 그려진 스크롤 영역(${scale})은 잇지 않고 문서를 찍어 알린다`, async ({
      context,
      openControlWindow,
    }) => {
      const site = await openSite(context, `/app?layout=main&h=3000&scale=${scale}`);
      const before = await site.evaluate(() => ({
        vw: innerWidth,
        height: document.documentElement.scrollHeight,
        dpr: devicePixelRatio,
      }));

      const { info } = await captureFullPage(context, openControlWindow, site);
      const d = before.dpr;
      // 화면 좌표와 스크롤 크기의 배율이 달라 영역을 잇지 않는다(이으면 3000px 결과가 어긋난 조각으로 채워진다)
      expect({ w: info.width, h: info.height }).toEqual({
        w: Math.round(before.vw * d),
        h: Math.round(before.height * d),
      });
      expect(info.meta.warnings).toEqual(['internal-scroll']);
      expect(await site.evaluate(() => document.getElementById('main')!.scrollTop)).toBe(0);
    });
  }

  test('스크롤 영역을 잇는 도중 취소하면 영역과 페이지를 되돌리고 결과를 만들지 않는다', async ({
    context,
    openControlWindow,
  }) => {
    const site = await openSite(context, '/app?layout=main&h=9000&sticky=1');
    await site.evaluate(() => {
      document.getElementById('main')!.scrollTop = 400;
    });
    await site.bringToFront();
    const control = await openControlWindow();
    const tabId = await tabIdOf(control, site.url());
    let resultOpened = false;
    context.on('page', (p) => {
      if (p.url().includes('/result.html')) resultOpened = true;
    });
    await sendToBackground(control, 'job:start', { mode: 'fullpage', tabId });
    await expect
      .poll(
        async () =>
          (
            (await sendToBackground(control, 'job:get')).data as {
              progress?: { done: number };
            } | null
          )?.progress?.done ?? 0,
      )
      .toBeGreaterThanOrEqual(2);
    await sendToBackground(control, 'job:cancel', {});

    await expect
      .poll(() =>
        site.evaluate(() => {
          const main = document.getElementById('main')!;
          return {
            top: main.scrollTop,
            style: main.getAttribute('style'),
            scrollbar: main.hasAttribute('data-clipt-hide-scrollbar'),
            sticky: getComputedStyle(document.getElementById('sticky')!).visibility,
          };
        }),
      )
      .toEqual({ top: 400, style: null, scrollbar: false, sticky: 'visible' });
    await new Promise((r) => setTimeout(r, 1500));
    expect(resultOpened).toBe(false);
  });
});

/** 요소 모드에서 point를 클릭해 고정하고 ↑로 한 단계 위 요소를 고른다 */
async function lockParentAt(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  site: Page,
  point: { x: number; y: number },
  expected: string,
) {
  await site.bringToFront();
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, site.url());
  await sendToBackground(control, 'job:start', { mode: 'element', tabId });
  await expect(site.locator('clipt-overlay .toast')).toBeVisible();
  await site.mouse.click(point.x, point.y);
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
  await site.keyboard.press('ArrowUp');
  await expect(site.locator('clipt-overlay .info-tag')).toHaveText(expected);
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

test('요소: 스크롤 영역 안에서 화면보다 긴 요소를 영역을 스크롤해 전체 캡처한다', async ({
  context,
  openControlWindow,
}) => {
  const site = await openSite(context, '/app?layout=main&h=3000');
  await site.evaluate(() => {
    document.getElementById('main')!.scrollTop = 300;
  });
  await lockParentAt(context, openControlWindow, site, { x: 300, y: 300 }, 'div#content');
  await expect(site.locator('clipt-overlay .info-clipped')).toHaveCount(0);
  const before = await site.evaluate(() => ({
    w: document.getElementById('main')!.clientWidth,
    dpr: devicePixelRatio,
  }));

  const { result, info } = await captureWithEnter(context, site);
  const d = before.dpr;
  expect({ w: info.width, h: info.height }).toEqual({
    w: Math.round(before.w * d),
    h: Math.round(3000 * d),
  });
  expect(info.meta.warnings).toBeUndefined();
  await expectBands(result, Math.round((before.w * d) / 2), [250, 750, 1250, 2250, 2750], d);
  expect(await site.evaluate(() => document.getElementById('main')!.scrollTop)).toBe(300);
});

test('요소: Shadow DOM 고정 틀 안에 slot으로 배치된 긴 요소도 전체를 담고 틀은 숨기지 않는다', async ({
  context,
  openControlWindow,
}) => {
  const site = await openSite(context, '/app?layout=slot&h=3000&sticky=1');
  await site.evaluate(() => {
    document.getElementById('app')!.shadowRoot!.getElementById('main')!.scrollTop = 300;
  });
  await lockParentAt(context, openControlWindow, site, { x: 400, y: 300 }, 'div#content');
  await expect(site.locator('clipt-overlay .info-clipped')).toHaveCount(0);
  const before = await site.evaluate(() => {
    const main = document.getElementById('app')!.shadowRoot!.getElementById('main')!;
    return { w: main.clientWidth, h: main.clientHeight, dpr: devicePixelRatio };
  });

  const { result, info } = await captureWithEnter(context, site);
  const d = before.dpr;
  expect({ w: info.width, h: info.height }).toEqual({
    w: Math.round(before.w * d),
    h: Math.round(3040 * d),
  });
  expect(info.meta.warnings).toBeUndefined();
  const x = Math.round((before.w * d) / 2);
  const [head, second] = await samplePixels(result, [
    [x, 20 * d], // 요소 맨 위의 sticky 머리
    [x, (before.h + 20) * d], // 두 번째 조각 맨 위: sticky 머리가 반복되면 실패
  ]);
  expectColor(head, PALETTE.lazy);
  expectColor(second, bandAt(before.h + 20, 40));
  // 요소를 감싼 고정 틀을 숨기면 slot 내용도 함께 사라져 배경만 찍힌다
  await expectBands(result, x, [1250, 2250, 3030], d, 40);
  expect(
    await site.evaluate(() => {
      const root = document.getElementById('app')!.shadowRoot!;
      return [
        root.getElementById('main')!.scrollTop,
        getComputedStyle(root.getElementById('shell')!).visibility,
      ];
    }),
  ).toEqual([300, 'visible']);
});
