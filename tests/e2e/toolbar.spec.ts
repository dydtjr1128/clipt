import type { BrowserContext, Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground } from './fixtures';
import { expectColor, readResult, samplePixels } from './result';
import { PALETTE } from './site';
import { clickToolbar } from './toolbar';

declare const chrome: typeof browser;

/**
 * 배포 빌드(host 권한·allowlist 없음)에서 실제 툴바 아이콘 클릭만으로 동작하는지 확인한다(#3).
 * 툴바 클릭이 activeTab을 부여해야 캡처·주입·탭 캡처가 된다. E2E 빌드의 <all_urls>·고정 key 없이 검증한다.
 */
test.use({ build: 'production' });

async function openSite(context: BrowserContext, path: string): Promise<Page> {
  const site = await context.newPage();
  await site.goto(`${SITE}${path}`);
  await site.bringToFront();
  return site;
}

function waitResult(context: BrowserContext): Promise<Page> {
  return context.waitForEvent('page', (p) => p.url().includes('/result.html?id='));
}

test('배포 빌드 manifest에는 host 권한이 없고 툴바 클릭으로 탭 접근 권한을 얻는다', async ({
  context,
  serviceWorker,
  extensionId,
}) => {
  const manifest = (await serviceWorker.evaluate(() => chrome.runtime.getManifest())) as {
    host_permissions?: string[];
  };
  expect(manifest.host_permissions ?? []).toEqual([]);
  const site = await openSite(context, '/blocks?t=grant');
  const urlBefore = await serviceWorker.evaluate(
    async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url,
  );
  expect(urlBefore).toBeUndefined(); // activeTab 전에는 탭 URL을 읽지 못한다
  const popup = await clickToolbar(context, site, extensionId);
  await popup.waitFor("document.querySelectorAll('.menu-item:not([disabled])').length === 7");
  const urlAfter = await serviceWorker.evaluate(
    async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url,
  );
  expect(urlAfter).toBe(`${SITE}/blocks?t=grant`);
});

test('툴바 팝업에서 보이는 화면을 캡처한다', async ({ context, extensionId }) => {
  const site = await openSite(context, '/blocks?t=visible');
  const popup = await clickToolbar(context, site, extensionId);
  const opened = waitResult(context);
  await popup.click('.menu-item[data-mode="visible"]');
  const info = await readResult(await opened);
  expect(info.width).toBeGreaterThan(0);
  expect(info.mime).toBe('image/png');
});

test('툴바 팝업에서 영역을 드래그해 캡처한다', async ({ context, extensionId }) => {
  const site = await openSite(context, '/blocks?t=region');
  const popup = await clickToolbar(context, site, extensionId);
  await popup.click('.menu-item[data-mode="region"]');
  await expect(site.locator('clipt-overlay .catcher')).toBeVisible();
  await site.mouse.move(200, 150);
  await site.mouse.down();
  await site.mouse.move(440, 270, { steps: 8 });
  await site.mouse.up();
  const opened = waitResult(context);
  await site.keyboard.press('Enter');
  const result = await opened;
  const info = await readResult(result);
  expect({ w: info.width, h: info.height }).toEqual({ w: 240, h: 120 });
  for (const color of await samplePixels(result, [[120, 60]])) {
    expectColor(color, PALETTE.block, 24);
  }
});

test('툴바 팝업에서 요소를 골라 캡처한다', async ({ context, extensionId }) => {
  const site = await openSite(context, '/blocks?t=element');
  const popup = await clickToolbar(context, site, extensionId);
  await popup.click('.menu-item[data-mode="element"]');
  await expect(site.locator('clipt-overlay .toast')).toBeVisible();
  await site.mouse.click(220, 170);
  await expect(site.locator('clipt-overlay .panel')).toBeVisible();
  const opened = waitResult(context);
  await site.keyboard.press('Enter');
  const info = await readResult(await opened);
  expect({ w: info.width, h: info.height }).toEqual({ w: 240, h: 120 });
});

test('툴바 팝업에서 탭 녹화를 시작하고 다시 연 팝업에서 중지한다', async ({
  context,
  extensionId,
  openControlWindow,
}) => {
  const site = await openSite(context, '/blocks?t=record');
  const control = await openControlWindow();
  await control.evaluate(() =>
    chrome.storage.sync.set({ settings: { record: { countdownSeconds: 0 } } }),
  );
  await site.bringToFront();
  const first = await clickToolbar(context, site, extensionId);
  await first.click('.menu-item[data-mode="rec-tab"]');
  await expect
    .poll(
      async () => ((await sendToBackground(control, 'job:get')).data as { phase?: string })?.phase,
      {
        timeout: 15_000,
      },
    )
    .toBe('recording');
  await site.waitForTimeout(2500);

  const second = await clickToolbar(context, site, extensionId);
  await second.waitFor("document.querySelector('.rec-timer')");
  const opened = waitResult(context);
  await second.click('.button-rec');
  const result = await opened;
  const video = result.locator('video.result-media');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);
  expect(duration).toBeGreaterThan(1);
});

test('chrome://extensions에서 툴바를 누르면 사용할 수 없다는 안내와 비활성 메뉴를 보여준다', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  await page.bringToFront();
  const popup = await clickToolbar(context, page, extensionId);
  await popup.waitFor("document.querySelector('.notice')");
  expect(await popup.evaluate<string>("document.querySelector('.notice').textContent")).toContain(
    '이 페이지에서는 사용할 수 없어요',
  );
  expect(
    await popup.evaluate<number>("document.querySelectorAll('.menu-item:disabled').length"),
  ).toBe(7);
});
