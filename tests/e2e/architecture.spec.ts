import type { Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';

/** 확장 페이지·서비스 워커 전역의 chrome 객체 타입 */
declare const chrome: typeof browser;

type Job = { id: string; mode: string; phase: string; tabId: number };

/** CDP로 서비스 워커를 강제 종료한다 (chrome://serviceworker-internals의 Stop과 동일) */
async function stopServiceWorker(page: Page, extensionId: string) {
  const cdp = await page.context().newCDPSession(page);
  const scope = `chrome-extension://${extensionId}/`;
  const stopped = new Promise<void>((resolve) => {
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      const mine = versions.filter((v) => v.scriptURL.startsWith(scope));
      if (mine.length > 0 && mine.every((v) => v.runningStatus === 'stopped')) resolve();
    });
  });
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  try {
    await Promise.race([
      stopped,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('service worker did not stop within 10s')), 10_000),
      ),
    ]);
  } finally {
    await cdp.detach();
  }
}

test('팝업이 닫혀도 작업은 서비스 워커에 남는다', async ({ context, openExtensionPage }) => {
  const site = await context.newPage();
  await site.goto(`${SITE}/site`);

  const popup = await openExtensionPage('popup.html');
  const tabId = await tabIdOf(popup, `${SITE}/site`);
  const started = await sendToBackground(popup, 'job:start', { mode: 'region', tabId });
  expect(started.ok).toBe(true);
  await popup.close();

  const other = await openExtensionPage('options.html');
  const current = await sendToBackground(other, 'job:get');
  expect(current.data).toMatchObject({ mode: 'region', phase: 'selecting', tabId });

  // 같은 작업이 진행 중이면 새 작업은 거부된다
  const again = await sendToBackground(other, 'job:start', { mode: 'visible', tabId });
  expect(again).toMatchObject({ ok: false, error: { code: 'JOB_ACTIVE' } });
});

test('서비스 워커를 강제 종료해도 녹화 상태가 복원된다', async ({
  extensionId,
  serviceWorker,
  openExtensionPage,
}) => {
  // 녹화 중 상태를 재현: 오프스크린 문서를 띄우고 recording 작업을 저장한다
  await serviceWorker.evaluate(async () => {
    await chrome.offscreen.createDocument({
      url: '/offscreen.html',
      reasons: ['USER_MEDIA' as never],
      justification: 'e2e',
    });
    await chrome.storage.session.set({
      job: {
        id: 'rec-1',
        mode: 'rec-tab',
        tabId: 1,
        windowId: 1,
        phase: 'recording',
        createdAt: 0,
        startedAt: 1,
      },
    });
    await chrome.action.setBadgeText({ text: '' });
  });

  const page = await openExtensionPage('options.html');
  await stopServiceWorker(page, extensionId);

  // 메시지가 서비스 워커를 깨우고, 기동 시 restoreJob이 상태를 복원한다
  const job = await sendToBackground(page, 'job:get');
  expect((job.data as Job).id).toBe('rec-1');
  await expect.poll(() => page.evaluate(() => chrome.action.getBadgeText({}))).toBe('REC');

  // 오프스크린 문서는 서비스 워커와 별개로 살아 있어야 한다
  const ping = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      __clipt: 1,
      target: 'offscreen',
      type: 'offscreen:ping',
      payload: null,
    }),
  );
  expect(ping).toEqual({ ok: true, data: 'pong' });
});

test('오프스크린 없이 남은 녹화 작업은 재기동 시 정리된다', async ({
  extensionId,
  serviceWorker,
  openExtensionPage,
}) => {
  await serviceWorker.evaluate(() =>
    chrome.storage.session.set({
      job: {
        id: 'rec-2',
        mode: 'rec-tab',
        tabId: 1,
        windowId: 1,
        phase: 'recording',
        createdAt: 0,
      },
    }),
  );
  const page = await openExtensionPage('options.html');
  await stopServiceWorker(page, extensionId);

  await sendToBackground(page, 'job:get'); // 서비스 워커 깨우기
  await expect
    .poll(() => page.evaluate(() => chrome.storage.session.get(['job', 'lastError'])))
    .toMatchObject({ lastError: { code: 'INTERRUPTED' } });
  expect((await sendToBackground(page, 'job:get')).data).toBeNull();
});

test('50MB가 넘는 결과를 결과 페이지에서 표시한다', async ({ extensionId, openExtensionPage }) => {
  // 결과 페이지를 한 번 열어 DB 스키마를 만든다
  const page = await openExtensionPage('result.html');
  await expect(page.locator('.result-status')).toBeVisible();

  const { id, bytes } = await page.evaluate(async () => {
    // 압축되지 않는 노이즈 이미지로 50MB 이상 PNG 생성
    const width = 5000;
    const height = 4000;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const data = ctx.createImageData(width, height);
    const u32 = new Uint32Array(data.data.buffer);
    for (let i = 0; i < u32.length; i += 16384) {
      crypto.getRandomValues(u32.subarray(i, i + 16384));
    }
    for (let i = 0; i < u32.length; i++) u32[i]! |= 0xff000000; // 불투명
    ctx.putImageData(data, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });

    const id = 'e2e-large';
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('clipt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['results', 'blobs'], 'readwrite');
      tx.objectStore('results').put({
        id,
        kind: 'image',
        mode: 'fullpage',
        mime: 'image/png',
        width,
        height,
        bytes: blob.size,
        createdAt: Date.now(),
      });
      tx.objectStore('blobs').put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { id, bytes: blob.size };
  });
  expect(bytes).toBeGreaterThan(50 * 1024 * 1024);

  await page.goto(`chrome-extension://${extensionId}/result.html?id=${id}`);
  const img = page.locator('img.result-media');
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
    .toBe(5000);
});
