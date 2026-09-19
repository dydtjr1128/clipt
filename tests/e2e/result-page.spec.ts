import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { setSettings, waitResult } from './rec';

declare const chrome: typeof browser;

async function captureVisible(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  settings?: object,
) {
  const site = await context.newPage();
  await site.goto(`${SITE}/blocks`);
  await site.bringToFront();
  const control = await openControlWindow();
  if (settings) await setSettings(control, settings);
  const tabId = await tabIdOf(control, `${SITE}/blocks`);
  const opened = waitResult(context);
  await sendToBackground(control, 'job:start', { mode: 'visible', tabId });
  const result = await opened;
  await expect(result.locator('img.result-media')).toBeVisible();
  return { site, control, result };
}

/** 결과 페이지의 downloads.download 호출 인자를 기록한다(Playwright는 파일을 GUID 이름으로 저장) */
async function spyDownloads(page: Page) {
  await page.evaluate(() => {
    const g = globalThis as unknown as { __downloads: { filename?: string; saveAs?: boolean }[] };
    g.__downloads = [];
    const original = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = ((options: Parameters<typeof original>[0]) => {
      g.__downloads.push({ filename: options.filename, saveAs: options.saveAs });
      return original(options);
    }) as typeof chrome.downloads.download;
  });
  return () =>
    page.evaluate(
      () => (globalThis as unknown as { __downloads: { filename?: string }[] }).__downloads,
    );
}

test('정보·제목을 보여 주고 규칙에 맞는 파일명으로 다운로드한다', async ({
  context,
  openControlWindow,
}) => {
  const { result } = await captureVisible(context, openControlWindow);
  await expect(result).toHaveTitle(/^Clipt · 보이는 화면 캡처 \d+×\d+$/);
  const info = result.locator('.info');
  await expect(info).toContainText('PNG');
  await expect(info).toContainText('clipt.test/blocks');
  await expect(result.locator('.filename-input')).toHaveValue(/^clipt_\d{8}-\d{6}_visible$/);
  await expect(result.locator('.filename-ext')).toHaveText('.png');

  const downloads = await spyDownloads(result);
  await result.locator('[data-action="download"]').click();
  await expect(result.locator('[data-action="download"]')).toContainText('저장됨');
  expect((await downloads())[0]?.filename).toMatch(/^clipt_\d{8}-\d{6}_visible\.png$/);

  // 이름을 고치면 확장자는 그대로 두고 고친 이름으로 저장한다. 쓸 수 없는 문자는 바꾼다
  await result.locator('.filename-input').fill('my/shot');
  await result.locator('[data-action="download"]').click();
  await expect.poll(async () => (await downloads())[1]?.filename).toBe('my_shot.png');

  // 다른 포맷으로 저장
  await result.locator('[data-action="save-jpeg"]').click();
  await expect.poll(async () => (await downloads())[2]?.filename).toBe('my_shot.jpg');
});

test('JPEG 결과도 PNG로 바꿔 클립보드에 복사한다', async ({ context, openControlWindow }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  const { site, result } = await captureVisible(context, openControlWindow, {
    image: { format: 'jpeg' },
  });
  await expect(result.locator('.info')).toContainText('JPG');
  const copy = result.locator('[data-action="copy"]');
  await expect(copy).toHaveAttribute('title', 'PNG로 복사돼요');
  await result.bringToFront();
  await copy.click();
  await expect(copy).toContainText('복사됨');

  await site.bringToFront();
  const types = await site.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return item ? item.types : [];
  });
  expect(types).toContain('image/png');
});

test('확대·축소 도구로 미리보기 배율을 바꾼다', async ({ context, openControlWindow }) => {
  const { result } = await captureVisible(context, openControlWindow);
  const img = result.locator('img.result-media');
  const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
  const width = () => img.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const value = result.locator('[data-zoom="value"]');

  await result.locator('[data-zoom="100"]').click();
  await expect(value).toHaveText('100%');
  expect(await width()).toBe(natural);
  await result.locator('[data-zoom="in"]').click();
  await expect(value).toHaveText('150%');
  expect(await width()).toBe(Math.round(natural * 1.5));
  await result.locator('[data-zoom="fit"]').click();
  expect(await width()).toBeLessThanOrEqual(natural);
  const stage = await result.locator('.preview').boundingBox();
  expect(await width()).toBeLessThanOrEqual(stage!.width);
});

test('오래된 결과는 결과 페이지에 들어올 때 보존 정책에 따라 지운다', async ({
  openExtensionPage,
}) => {
  const page = await openExtensionPage('result.html');
  await expect(page.locator('.result-status')).toBeVisible();
  const seed = (id: string, createdAt: number) =>
    page.evaluate(
      async ([id, createdAt]) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const req = indexedDB.open('clipt');
          req.onsuccess = () => resolve(req.result);
        });
        await new Promise<void>((resolve) => {
          const tx = db.transaction(['results', 'blobs'], 'readwrite');
          tx.objectStore('results').put({
            id,
            kind: 'image',
            mode: 'visible',
            mime: 'image/png',
            width: 1,
            height: 1,
            bytes: 1,
            createdAt,
          });
          tx.objectStore('blobs').put(new Blob(['x'], { type: 'image/png' }), id);
          tx.oncomplete = () => resolve();
        });
        db.close();
      },
      [id, createdAt] as const,
    );
  await seed('old', Date.now() - 25 * 60 * 60 * 1000);
  await seed('fresh', Date.now() - 60 * 1000);

  await page.reload(); // 진입 시 정리
  const ids = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('clipt');
        req.onsuccess = () => resolve(req.result);
      });
      const keys = await new Promise<IDBValidKey[]>((resolve) => {
        const req = db.transaction('blobs').objectStore('blobs').getAllKeys();
        req.onsuccess = () => resolve(req.result);
      });
      db.close();
      return keys;
    });
  await expect.poll(ids).toEqual(['fresh']);

  await page.goto(page.url().replace(/result\.html.*/, 'result.html?id=old'));
  await expect(page.locator('.result-status')).toContainText('만료');
});

test('영상 결과는 복사 버튼을 비활성으로 두고 영상 정보를 보여 준다', async ({
  context,
  openControlWindow,
}) => {
  const site = await context.newPage();
  await site.goto(`${SITE}/long?h=2000`);
  await site.bringToFront();
  const control = await openControlWindow();
  await setSettings(control, { record: { countdownSeconds: 0 } });
  const tabId = await tabIdOf(control, `${SITE}/long?h=2000`);
  await sendToBackground(control, 'job:start', { mode: 'rec-tab', tabId });
  const { waitRecording } = await import('./rec');
  await waitRecording(control, 2);
  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  const result = await opened;

  await expect(result.locator('video.result-media')).toBeVisible();
  await expect(result.locator('[data-action="copy"]')).toBeDisabled();
  await expect(result.locator('.filename-ext')).toHaveText('.webm');
  const info = result.locator('.info');
  await expect(info).toContainText('WEBM · 30fps');
  await expect(info).toContainText('탭 소리');
  await expect(info).toContainText(/00:0\d/);
});
