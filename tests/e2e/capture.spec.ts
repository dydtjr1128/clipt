import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';

declare const chrome: typeof browser;

/** 결과 페이지의 이미지 크기와 MIME */
async function readResultImage(result: Page) {
  const img = result.locator('img.result-media');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete)).toBe(true);
  return img.evaluate(async (el: HTMLImageElement) => ({
    width: el.naturalWidth,
    height: el.naturalHeight,
    mime: (await (await fetch(el.src)).blob()).type,
  }));
}

async function openSite(context: BrowserContext, name: string) {
  const site = await context.newPage();
  await site.goto(`${SITE}/${name}`);
  await site.bringToFront();
  return site;
}

async function setSettings(control: Page, settings: object) {
  await control.evaluate((settings) => chrome.storage.sync.set({ settings }), settings);
}

/** 조작 페이지에서 보이는 화면 캡처를 시작하고 결과 페이지가 열리기를 기다린다 */
async function captureToResultPage(context: BrowserContext, control: Page, tabId: number) {
  const resultOpened = context.waitForEvent('page', (p) => p.url().includes('/result.html?id='));
  const started = await sendToBackground(control, 'job:start', { mode: 'visible', tabId });
  expect(started.ok).toBe(true);
  const result = await resultOpened;
  await result.waitForLoadState();
  return result;
}

for (const scaleFactor of [1, 2]) {
  test.describe(`DPR ${scaleFactor}`, () => {
    test.use({ scaleFactor });

    test('결과 이미지 크기가 뷰포트×DPR과 같다', async ({ context, openControlWindow }) => {
      const site = await openSite(context, 'dpr');
      const expected = await site.evaluate(() => ({
        dpr: devicePixelRatio,
        width: Math.round(innerWidth * devicePixelRatio),
        height: Math.round(innerHeight * devicePixelRatio),
      }));
      expect(expected.dpr).toBe(scaleFactor);

      const control = await openControlWindow();
      const tabId = await tabIdOf(control, `${SITE}/dpr`);
      const result = await captureToResultPage(context, control, tabId);

      const image = await readResultImage(result);
      expect(image).toEqual({ width: expected.width, height: expected.height, mime: 'image/png' });
      expect((await sendToBackground(control, 'job:get')).data).toBeNull();
    });
  });
}

test('JPEG 설정이면 결과가 image/jpeg로 저장된다', async ({ context, openControlWindow }) => {
  await openSite(context, 'jpeg');
  const control = await openControlWindow();
  await setSettings(control, { image: { format: 'jpeg', jpegQuality: 0.8 } });
  const tabId = await tabIdOf(control, `${SITE}/jpeg`);

  const result = await captureToResultPage(context, control, tabId);
  expect((await readResultImage(result)).mime).toBe('image/jpeg');
});

test('바로 다운로드 설정이면 규칙에 맞는 파일명으로 저장하고 결과 페이지는 열지 않는다', async ({
  context,
  serviceWorker,
  openControlWindow,
}) => {
  await openSite(context, 'download');
  const control = await openControlWindow();
  await setSettings(control, { afterCapture: 'download' });
  const tabId = await tabIdOf(control, SITE + '/download');
  // Playwright는 다운로드 파일을 GUID 이름으로 저장하므로, 확장이 요청한 파일명은 API 호출 인자로 확인한다
  await serviceWorker.evaluate(() => {
    const g = globalThis as unknown as { __downloads: unknown[] };
    g.__downloads = [];
    const original = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = ((options: Parameters<typeof original>[0]) => {
      g.__downloads.push({ filename: options.filename, saveAs: options.saveAs });
      return original(options);
    }) as typeof chrome.downloads.download;
  });

  let resultOpened = false;
  context.on('page', (p) => {
    if (p.url().includes('/result.html')) resultOpened = true;
  });
  await sendToBackground(control, 'job:start', { mode: 'visible', tabId });

  await expect
    .poll(() =>
      control.evaluate(async () => {
        const [item] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 });
        return item?.state ?? null;
      }),
    )
    .toBe('complete');
  const requested = await serviceWorker.evaluate(
    () => (globalThis as unknown as { __downloads: unknown[] }).__downloads,
  );
  expect(requested).toEqual([
    { filename: expect.stringMatching(/^clipt_\d{8}-\d{6}_visible\.png$/), saveAs: false },
  ]);
  expect(resultOpened).toBe(false);
  await expect.poll(() => control.evaluate(() => chrome.action.getBadgeText({}))).toBe('✓');
});

test('대상 탭이 활성 탭이 아니면 캡처하지 않고 오류를 남긴다', async ({
  context,
  openExtensionPage,
}) => {
  await openSite(context, 'inactive');
  // 같은 창에 조작 페이지를 열어 대상 탭이 비활성이 된다
  const control = await openExtensionPage('options.html');
  const tabId = await tabIdOf(control, `${SITE}/inactive`);
  await sendToBackground(control, 'job:start', { mode: 'visible', tabId });

  await expect
    .poll(() => control.evaluate(() => chrome.storage.session.get(['job', 'lastError'])))
    .toMatchObject({ lastError: { code: 'CAPTURE_FAILED' } });
  expect((await sendToBackground(control, 'job:get')).data).toBeNull();
});

test('클립보드 설정이면 PNG를 대상 페이지 클립보드에 복사한다', async ({
  context,
  openControlWindow,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  const site = await openSite(context, 'clipboard');
  const control = await openControlWindow();
  await setSettings(control, { afterCapture: 'clipboard', image: { format: 'jpeg' } });
  const tabId = await tabIdOf(control, `${SITE}/clipboard`);

  await sendToBackground(control, 'job:start', { mode: 'visible', tabId });
  await expect.poll(() => control.evaluate(() => chrome.action.getBadgeText({}))).toBe('✓');

  await site.bringToFront();
  const copied = await site.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return item ? item.types : [];
  });
  expect(copied).toContain('image/png');
});
