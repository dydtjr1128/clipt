import type { BrowserContext, Page } from '@playwright/test';
import { expect, sendToBackground } from './fixtures';

/** 결과 페이지에서 읽은 결과 메타와 이미지 크기 */
export interface ResultInfo {
  width: number;
  height: number;
  mime: string;
  meta: Record<string, unknown>;
}

/** 작업을 시작하고 결과 페이지가 열리기를 기다린다 */
export async function startAndWaitResult(
  context: BrowserContext,
  control: Page,
  payload: { mode: string; tabId: number },
  timeout = 60_000,
): Promise<Page> {
  const opened = context.waitForEvent('page', {
    predicate: (p) => p.url().includes('/result.html?id='),
    timeout,
  });
  const started = await sendToBackground(control, 'job:start', payload);
  expect(started.ok, JSON.stringify(started)).toBe(true);
  const result = await opened;
  await result.waitForLoadState();
  return result;
}

export async function readResult(result: Page): Promise<ResultInfo> {
  const img = result.locator('img.result-media');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete)).toBe(true);
  return result.evaluate(async () => {
    const el = document.querySelector<HTMLImageElement>('img.result-media')!;
    const id = new URLSearchParams(location.search).get('id')!;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('clipt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const meta = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = db.transaction('results').objectStore('results').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return {
      width: el.naturalWidth,
      height: el.naturalHeight,
      mime: (await (await fetch(el.src)).blob()).type,
      meta,
    };
  });
}

/** 결과 이미지의 픽셀 색(RGB)을 읽는다. 좌표는 결과 이미지 픽셀 */
export async function samplePixels(
  result: Page,
  points: readonly (readonly [number, number])[],
): Promise<number[][]> {
  return result.evaluate(async (points) => {
    const el = document.querySelector<HTMLImageElement>('img.result-media')!;
    const bitmap = await createImageBitmap(await (await fetch(el.src)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]);
  }, points);
}

/** 색이 기대값과 채널별 tolerance 이내인지 */
export function expectColor(
  actual: number[] | undefined,
  expected: readonly number[],
  tolerance = 12,
) {
  expect(actual, `color ${actual} vs ${expected}`).toBeDefined();
  expected.forEach((v, i) => expect(Math.abs(actual![i]! - v)).toBeLessThanOrEqual(tolerance));
}
