import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';

declare const chrome: typeof browser;

type JobData = {
  id: string;
  phase: string;
  pausedAt?: number;
  media?: { mime: string; width: number; height: number; audio: string; audioTracks: number };
} | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function job(control: Page): Promise<JobData> {
  return (await sendToBackground(control, 'job:get')).data as JobData;
}

async function startRecording(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  settings?: object,
) {
  const url = `${SITE}/long?h=3000&fixed=1`;
  const site = await context.newPage();
  await site.goto(url);
  await site.bringToFront();
  const control = await openControlWindow();
  if (settings) await control.evaluate((s) => chrome.storage.sync.set({ settings: s }), settings);
  const tabId = await tabIdOf(control, url);
  const started = await sendToBackground(control, 'job:start', { mode: 'rec-tab', tabId });
  expect(started.ok, JSON.stringify(started)).toBe(true);
  await expect.poll(async () => (await job(control))?.phase, { timeout: 15_000 }).toBe('recording');
  return { site, control, tabId };
}

function offscreenStatus(control: Page) {
  return control.evaluate(() =>
    chrome.runtime.sendMessage({
      __clipt: 1,
      target: 'offscreen',
      type: 'rec:status',
      payload: null,
    }),
  ) as Promise<{ ok: boolean; data: { state: string; chunks: number } | null }>;
}

/** 결과 페이지의 영상 길이와 탐색 가능 여부 */
async function readVideo(result: Page) {
  const video = result.locator('video.result-media');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  return video.evaluate(async (v: HTMLVideoElement) => {
    const duration = v.duration;
    const target = Math.min(1.5, duration / 2);
    await new Promise<void>((resolve) => {
      v.addEventListener('seeked', () => resolve(), { once: true });
      v.currentTime = target;
    });
    return { duration, seekedTo: v.currentTime, target };
  });
}

function waitResult(context: BrowserContext) {
  return context.waitForEvent('page', {
    predicate: (p) => p.url().includes('/result.html?id='),
    timeout: 30_000,
  });
}

test('탭을 녹화하면 chunk가 계속 저장되고 결과 webm을 재생·탐색할 수 있다', async ({
  context,
  openControlWindow,
}) => {
  const { control } = await startRecording(context, openControlWindow);
  expect(await control.evaluate(() => chrome.action.getBadgeText({}))).toBe('REC');
  const media = (await job(control))!.media!;
  expect(media.mime).toContain('video/webm');
  expect(media.width).toBeGreaterThan(0);

  // 1초 단위로 chunk가 IndexedDB에 쌓인다(메모리에 모으지 않음)
  await expect
    .poll(async () => (await offscreenStatus(control)).data?.chunks ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  await sleep(1000);

  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  const result = await opened;
  const video = await readVideo(result);
  expect(Number.isFinite(video.duration)).toBe(true);
  expect(video.duration).toBeGreaterThan(2);
  expect(video.duration).toBeLessThan(8);
  expect(Math.abs(video.seekedTo - video.target)).toBeLessThan(0.5);

  expect(await job(control)).toBeNull();
  expect(await control.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  // 녹화가 끝나면 오프스크린 문서를 닫고 chunk를 지운다
  await expect
    .poll(async () => (await offscreenStatus(control).catch(() => null))?.ok ?? false)
    .toBe(false);
});

test('일시정지 구간은 결과 영상에 포함되지 않는다', async ({ context, openControlWindow }) => {
  const { control } = await startRecording(context, openControlWindow);
  await sleep(1500);
  await sendToBackground(control, 'job:pause', {});
  expect((await job(control))?.pausedAt).toBeGreaterThan(0);
  expect(await control.evaluate(() => chrome.action.getBadgeText({}))).toBe('❚❚');
  await sleep(3000);
  await sendToBackground(control, 'job:resume', {});
  expect((await job(control))?.pausedAt).toBeUndefined();
  await sleep(1500);

  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  const video = await readVideo(await opened);
  // 녹화 3초 + 일시정지 3초 → 결과는 일시정지를 뺀 약 3초
  expect(video.duration).toBeGreaterThan(2);
  expect(video.duration).toBeLessThan(4.8);
});

test('탭+마이크 설정에서 마이크를 못 쓰면 탭 소리 한 트랙으로 녹음하고 알린다, 소리 없음이면 트랙이 없다', async ({
  context,
  openControlWindow,
}) => {
  const both = await startRecording(context, openControlWindow, { record: { audio: 'tab+mic' } });
  // E2E 브라우저는 확장 origin에 마이크 권한을 줄 수 없다. 탭 소리만 한 트랙으로 합쳐 녹음한다
  expect((await job(both.control))?.media).toMatchObject({ audio: 'tab+mic', audioTracks: 1 });
  const opened = waitResult(context);
  await sleep(1200);
  await sendToBackground(both.control, 'job:stop', {});
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
  expect(warnings).toEqual(['mic-unavailable']);
  await expect.poll(() => job(both.control)).toBeNull();

  await both.control.evaluate(() =>
    chrome.storage.sync.set({ settings: { record: { audio: 'none' } } }),
  );
  const started = await sendToBackground(both.control, 'job:start', {
    mode: 'rec-tab',
    tabId: both.tabId,
  });
  expect(started.ok).toBe(true);
  await expect
    .poll(async () => (await job(both.control))?.phase, { timeout: 15_000 })
    .toBe('recording');
  expect((await job(both.control))?.media).toMatchObject({ audio: 'none', audioTracks: 0 });
  await sendToBackground(both.control, 'job:cancel', {});
});

test('서비스 워커를 강제 종료해도 녹화가 계속되고 배지가 유지된다', async ({
  context,
  openControlWindow,
  extensionId,
}) => {
  const { control } = await startRecording(context, openControlWindow);
  // 첫 chunk는 인코더 초기화 뒤에 나온다. 녹화가 흐르기 시작한 뒤 서비스 워커를 멈춘다
  await expect
    .poll(async () => (await offscreenStatus(control)).data?.chunks ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  const before = (await offscreenStatus(control)).data!.chunks;

  const cdp = await context.newCDPSession(control);
  const scope = `chrome-extension://${extensionId}/`;
  const stopped = new Promise<void>((resolve) => {
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      const mine = versions.filter((v) => v.scriptURL.startsWith(scope));
      if (mine.length > 0 && mine.every((v) => v.runningStatus === 'stopped')) resolve();
    });
  });
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await stopped;
  await cdp.detach();

  // 오프스크린은 서비스 워커와 별개로 계속 녹화한다
  await expect
    .poll(async () => (await offscreenStatus(control)).data?.chunks ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(before);
  expect((await job(control))?.phase).toBe('recording'); // 서비스 워커를 깨움
  await expect.poll(() => control.evaluate(() => chrome.action.getBadgeText({}))).toBe('REC');

  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  const video = await readVideo(await opened);
  expect(video.duration).toBeGreaterThan(2);
});

test('녹화 중 탭을 닫으면 그때까지의 영상이 결과 페이지에 열린다', async ({
  context,
  openControlWindow,
}) => {
  const { site, control } = await startRecording(context, openControlWindow);
  await expect
    .poll(async () => (await offscreenStatus(control)).data?.chunks ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  const opened = waitResult(context);
  await site.close();
  const video = await readVideo(await opened);
  expect(video.duration).toBeGreaterThan(1.5);
  await expect.poll(() => job(control)).toBeNull();
});

test('녹화를 취소하면 결과를 만들지 않고 chunk를 지운다', async ({
  context,
  openControlWindow,
}) => {
  const { control } = await startRecording(context, openControlWindow);
  await sleep(1500);
  let resultOpened = false;
  context.on('page', (p) => {
    if (p.url().includes('/result.html')) resultOpened = true;
  });
  await sendToBackground(control, 'job:cancel', {});
  await expect.poll(() => job(control)).toBeNull();
  await sleep(1000);
  expect(resultOpened).toBe(false);
  const leftover = await control.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('clipt');
      req.onsuccess = () => resolve(req.result);
    });
    const count = await new Promise<number>((resolve) => {
      const req = db.transaction('chunks').objectStore('chunks').count();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return count;
  });
  expect(leftover).toBe(0);
});
