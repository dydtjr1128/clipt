import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { expect, sendToBackground } from './fixtures';

declare const chrome: typeof browser;

/** 녹화 E2E 공용 헬퍼 */
export type JobData = {
  id: string;
  phase: string;
  startedAt?: number;
  pausedAt?: number;
  pausedTotal?: number;
} | null;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function jobOf(control: Page): Promise<JobData> {
  return (await sendToBackground(control, 'job:get')).data as JobData;
}

export function setSettings(control: Page, settings: object): Promise<void> {
  return control.evaluate((s) => chrome.storage.sync.set({ settings: s }), settings);
}

export function chunksOf(control: Page): Promise<number> {
  return control.evaluate(
    async () =>
      (
        (await chrome.runtime.sendMessage({
          __clipt: 1,
          target: 'offscreen',
          type: 'rec:status',
          payload: null,
        })) as { data: { chunks: number } | null }
      ).data?.chunks ?? 0,
  );
}

export async function waitRecording(control: Page, chunks = 1): Promise<void> {
  await expect
    .poll(async () => (await jobOf(control))?.phase, { timeout: 20_000 })
    .toBe('recording');
  await expect.poll(() => chunksOf(control), { timeout: 20_000 }).toBeGreaterThanOrEqual(chunks);
}

export function waitResult(context: BrowserContext, timeout = 30_000): Promise<Page> {
  return context.waitForEvent('page', {
    predicate: (p) => p.url().includes('/result.html?id='),
    timeout,
  });
}

/** 결과 영상의 길이·크기와 첫 프레임 픽셀(비율 좌표) */
export async function readVideo(result: Page, points: [number, number][] = []) {
  const video = result.locator('video.result-media');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  return video.evaluate(async (v: HTMLVideoElement, points) => {
    v.muted = true;
    await new Promise<void>((resolve) => {
      v.addEventListener('seeked', () => resolve(), { once: true });
      v.currentTime = 0.01;
    });
    const c = new OffscreenCanvas(v.videoWidth, v.videoHeight);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, 0, 0);
    return {
      duration: v.duration,
      width: v.videoWidth,
      height: v.videoHeight,
      pixels: points.map(([x, y]) => [
        ...ctx
          .getImageData(Math.round(x * v.videoWidth), Math.round(y * v.videoHeight), 1, 1)
          .data.slice(0, 3),
      ]),
    };
  }, points);
}

/** 결과 페이지가 보여주는 결과의 메타 */
export function resultMeta(result: Page): Promise<{ warnings?: string[]; duration?: number }> {
  return result.evaluate(async () => {
    const id = new URLSearchParams(location.search).get('id')!;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('clipt');
      req.onsuccess = () => resolve(req.result);
    });
    const meta = await new Promise<{ warnings?: string[]; duration?: number }>((resolve) => {
      const req = db.transaction('results').objectStore('results').get(id);
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return meta;
  });
}

/** 가장자리 안쪽 네 모서리와 중앙 */
export const CORNERS: [number, number][] = [
  [0.04, 0.08],
  [0.96, 0.08],
  [0.04, 0.92],
  [0.96, 0.92],
  [0.5, 0.5],
];
