import type { browser } from 'wxt/browser';
import { test, expect } from './fixtures';

/** 서비스 워커 전역의 chrome 객체 타입 */
declare const chrome: typeof browser;

test('확장이 설치되고 서비스 워커가 실행된다', async ({ serviceWorker }) => {
  expect(serviceWorker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
});

test('manifest는 host 권한 없이 필요한 권한만 요청한다', async ({ serviceWorker }) => {
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.host_permissions ?? []).toEqual([]);
  expect(manifest.permissions).toEqual(
    expect.arrayContaining(['activeTab', 'scripting', 'tabCapture', 'offscreen', 'storage']),
  );
});

for (const page of ['popup', 'options', 'result', 'permission']) {
  test(`${page} 페이지가 오류 없이 렌더링된다`, async ({ context, extensionId }) => {
    const tab = await context.newPage();
    const errors: string[] = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(`chrome-extension://${extensionId}/${page}.html`);
    await expect(tab.locator('#app h1')).toHaveText('Clipt');
    expect(errors).toEqual([]);
  });
}
