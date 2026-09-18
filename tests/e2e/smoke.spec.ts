import type { browser } from 'wxt/browser';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, productionPath } from './fixtures';

/** 서비스 워커 전역의 chrome 객체 타입 */
declare const chrome: typeof browser;

test('확장이 설치되고 서비스 워커가 실행된다', async ({ serviceWorker }) => {
  expect(serviceWorker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
});

test('배포 빌드 manifest는 host 권한 없이 정해진 권한만 요청한다', () => {
  const manifest = JSON.parse(readFileSync(path.join(productionPath, 'manifest.json'), 'utf8'));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.host_permissions ?? []).toEqual([]);
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect([...manifest.permissions].sort()).toEqual(
    [
      'activeTab',
      'scripting',
      'tabCapture',
      'offscreen',
      'storage',
      'downloads',
      'clipboardWrite',
    ].sort(),
  );
});

test('E2E 빌드만 host 권한을 가진다', async ({ serviceWorker }) => {
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.host_permissions).toEqual(['<all_urls>']);
});

for (const page of ['options', 'permission']) {
  test(`${page} 페이지가 오류 없이 렌더링된다`, async ({ context, extensionId }) => {
    const tab = await context.newPage();
    const errors: string[] = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(`chrome-extension://${extensionId}/${page}.html`);
    await expect(tab.locator('#app h1')).toHaveText('Clipt');
    expect(errors).toEqual([]);
  });
}

test('result 페이지는 id가 없으면 만료 안내를 보여준다', async ({ context, extensionId }) => {
  const tab = await context.newPage();
  const errors: string[] = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(`chrome-extension://${extensionId}/result.html`);
  await expect(tab.locator('.result-status')).toBeVisible();
  expect(errors).toEqual([]);
});
