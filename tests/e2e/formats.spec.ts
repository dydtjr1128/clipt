import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { jobOf, readVideo, setSettings, waitRecording, waitResult } from './rec';

type Media = { mime: string; width: number; height: number; frameRate?: number };

async function record(
  context: BrowserContext,
  openControlWindow: () => Promise<Page>,
  recordSettings: object,
) {
  const url = `${SITE}/long?h=3000`;
  const site = await context.newPage();
  await site.goto(url);
  await site.bringToFront();
  const viewport = await site.evaluate(() => ({
    w: innerWidth * devicePixelRatio,
    h: innerHeight * devicePixelRatio,
  }));
  const control = await openControlWindow();
  await setSettings(control, { record: { countdownSeconds: 0, ...recordSettings } });
  const tabId = await tabIdOf(control, url);
  await sendToBackground(control, 'job:start', { mode: 'rec-tab', tabId });
  await waitRecording(control, 2);
  const media = ((await jobOf(control)) as unknown as { media: Media }).media;
  const opened = waitResult(context);
  await sendToBackground(control, 'job:stop', {});
  const result = await opened;
  return { result, media, viewport };
}

const FORMATS = [
  { format: 'mp4', container: 'video/mp4', url: /\.mp4$/ },
  { format: 'webm-vp9', container: 'video/webm' },
  { format: 'webm-vp8', container: 'video/webm' },
  { format: 'webm-av1', container: 'video/webm' },
] as const;

for (const { format, container } of FORMATS) {
  test(`${format} 포맷으로 녹화하고 재생·탐색할 수 있다`, async ({
    context,
    openControlWindow,
  }) => {
    const { result, media } = await record(context, openControlWindow, { format });
    expect(media.mime.startsWith(container)).toBe(true);
    if (format !== 'mp4')
      expect(media.mime).toContain(format.replace('webm-', '').replace('av1', 'av01'));

    const video = await readVideo(result);
    expect(Number.isFinite(video.duration)).toBe(true);
    expect(video.duration).toBeGreaterThan(1.5);
    expect(video.width).toBeGreaterThan(0);
    const seeked = await result
      .locator('video.result-media')
      .evaluate(async (v: HTMLVideoElement) => {
        const target = v.duration / 2;
        await new Promise<void>((resolve) => {
          v.addEventListener('seeked', () => resolve(), { once: true });
          v.currentTime = target;
        });
        return Math.abs(v.currentTime - target);
      });
    expect(seeked).toBeLessThan(0.5);
    await expect(result.locator('[data-banner="notices"]')).toHaveCount(0); // 폴백 없음
  });
}

test('해상도 50%·24fps 설정이 결과 영상에 반영된다', async ({ context, openControlWindow }) => {
  const { result, media, viewport } = await record(context, openControlWindow, {
    scale: 0.5,
    fps: 24,
  });
  expect(media.frameRate).toBe(24);
  const video = await readVideo(result);
  expect(Math.abs(video.width - viewport.w / 2)).toBeLessThanOrEqual(4);
  expect(Math.abs(video.height - viewport.h / 2)).toBeLessThanOrEqual(4);
});

test('폴백으로 저장된 결과는 결과 페이지에 사유를 알린다', async ({ openExtensionPage }) => {
  const page = await openExtensionPage('result.html');
  await expect(page.locator('.result-status')).toBeVisible(); // DB 생성
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('clipt');
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(['results', 'blobs'], 'readwrite');
      tx.objectStore('results').put({
        id: 'fallback',
        kind: 'video',
        mode: 'rec-tab',
        mime: 'video/webm',
        width: 10,
        height: 10,
        bytes: 1,
        createdAt: Date.now(),
        fallbackReason: 'mp4',
        warnings: ['layout-changed'],
      });
      tx.objectStore('blobs').put(new Blob(['x'], { type: 'video/webm' }), 'fallback');
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.goto(page.url().replace(/result\.html.*/, 'result.html?id=fallback'));
  const banner = page.locator('[data-banner="notices"]');
  await expect(banner).toContainText('MP4');
  await expect(banner).toContainText('WebM');
  await expect(banner.locator('li')).toHaveCount(2);
});
