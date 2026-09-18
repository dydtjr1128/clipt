import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { expectColor, readResult, samplePixels, startAndWaitResult } from './result';
import { PALETTE } from './site';

declare const chrome: typeof browser;

test.describe('전체 페이지 캡처', () => {
  test('고정 헤더는 한 번만, 지연 로딩 이미지는 채워서, 페이지는 원래대로', async ({
    context,
    openControlWindow,
  }) => {
    const url = `${SITE}/long?h=6000&fixed=1&lazy=5200`;
    const site = await context.newPage();
    await site.goto(url);
    await site.evaluate(() => scrollTo(0, 500));
    await site.bringToFront();
    const before = await site.evaluate(() => ({
      scrollY,
      vh: innerHeight,
      vw: innerWidth,
      dpr: devicePixelRatio,
      htmlStyle: document.documentElement.getAttribute('style'),
      htmlClass: document.documentElement.getAttribute('class'),
      headerStyle: document.getElementById('hdr')!.getAttribute('style'),
      lazyLoaded: (document.getElementById('lazy') as HTMLImageElement).complete,
    }));
    expect(before.lazyLoaded).toBe(false); // 캡처 전에는 지연 이미지가 아직 로드되지 않음

    const control = await openControlWindow();
    const tabId = await tabIdOf(control, url);
    const result = await startAndWaitResult(context, control, { mode: 'fullpage', tabId });
    const info = await readResult(result);

    expect(info.width).toBe(Math.round(before.vw * before.dpr));
    expect(info.height).toBe(Math.round(6000 * before.dpr));
    expect(info.meta.scaled).toBeUndefined();

    const d = before.dpr;
    const [top, secondPiece, lazy, bottom] = await samplePixels(result, [
      [500 * d, 30 * d], // 첫 화면의 고정 헤더
      [500 * d, (before.vh + 30) * d], // 두 번째 조각 위치: 헤더가 반복되지 않아야 함
      [250 * d, 5300 * d], // 지연 로딩 이미지
      [500 * d, 5990 * d], // 마지막 조각
    ]);
    expectColor(top, PALETTE.header);
    expect(secondPiece).not.toEqual([...PALETTE.header]);
    expectColor(lazy, PALETTE.lazy);
    expectColor(bottom, PALETTE.bandB); // 5990px는 12번째 띠(홀수 번째 = bandB)

    const after = await site.evaluate(() => ({
      scrollY,
      htmlStyle: document.documentElement.getAttribute('style'),
      htmlClass: document.documentElement.getAttribute('class'),
      headerStyle: document.getElementById('hdr')!.getAttribute('style'),
      headerVisible: getComputedStyle(document.getElementById('hdr')!).visibility,
    }));
    expect(after).toEqual({
      scrollY: before.scrollY,
      htmlStyle: before.htmlStyle,
      htmlClass: before.htmlClass,
      headerStyle: before.headerStyle,
      headerVisible: 'visible',
    });
    expect((await sendToBackground(control, 'job:get')).data).toBeNull();
  });

  test.describe('캔버스 한계', () => {
    test.use({ scaleFactor: 2, windowSize: [1000, 1600] });

    test('한계를 넘는 페이지는 축소해 캡처하고 배율을 기록한다', async ({
      context,
      openControlWindow,
    }) => {
      test.setTimeout(120_000);
      const url = `${SITE}/long?h=18000`;
      const site = await context.newPage();
      await site.goto(url);
      await site.bringToFront();
      const vw = await site.evaluate(() => innerWidth);

      const control = await openControlWindow();
      const tabId = await tabIdOf(control, url);
      const result = await startAndWaitResult(
        context,
        control,
        { mode: 'fullpage', tabId },
        110_000,
      );
      const info = await readResult(result);

      const scale = info.meta.scaled as number;
      expect(scale).toBeGreaterThan(0.8);
      expect(scale).toBeLessThan(1);
      expect(info.height).toBeLessThanOrEqual(32767);
      expect(info.height).toBe(Math.floor(18000 * 2 * scale));
      expect(info.width).toBe(Math.floor(vw * 2 * scale));
    });
  });

  test('진행 중 취소하면 페이지를 복원하고 결과를 만들지 않는다', async ({
    context,
    openControlWindow,
  }) => {
    const url = `${SITE}/long?h=8000&fixed=1`;
    const site = await context.newPage();
    await site.goto(url);
    await site.evaluate(() => scrollTo(0, 300));
    await site.bringToFront();

    const control = await openControlWindow();
    const tabId = await tabIdOf(control, url);
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

    await expect.poll(() => site.evaluate(() => scrollY)).toBe(300);
    await expect
      .poll(() => site.evaluate(() => getComputedStyle(document.getElementById('hdr')!).visibility))
      .toBe('visible');
    await new Promise((r) => setTimeout(r, 1500));
    expect(resultOpened).toBe(false);
    expect(await control.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  });
});

test('캡처 중 페이지에서 Esc를 누르면 중단된다', async ({ context, openControlWindow }) => {
  const url = `${SITE}/long?h=8000`;
  const site = await context.newPage();
  await site.goto(url);
  await site.bringToFront();
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, url);

  await sendToBackground(control, 'job:start', { mode: 'fullpage', tabId });
  await expect
    .poll(
      async () =>
        ((await sendToBackground(control, 'job:get')).data as { phase?: string } | null)?.phase,
    )
    .toBe('capturing');
  await site.keyboard.press('Escape');
  await expect.poll(async () => (await sendToBackground(control, 'job:get')).data).toBeNull();
  await expect.poll(() => site.evaluate(() => scrollY)).toBe(0);
});
