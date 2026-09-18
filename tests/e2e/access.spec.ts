import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';

declare const chrome: typeof browser;

test('일반 웹페이지는 사용 가능, 브라우저 내부 페이지는 사유와 함께 제한된다', async ({
  context,
  openExtensionPage,
}) => {
  const site = await context.newPage();
  await site.goto(`${SITE}/ok`);
  const internal = await context.newPage();
  await internal.goto('chrome://version');

  const page = await openExtensionPage('options.html');
  const siteTab = await tabIdOf(page, `${SITE}/ok`);
  // 확장은 chrome:// 탭의 URL을 읽을 수 없다. URL이 없는 가장 최근 탭이 내부 페이지다
  const internalTab = await page.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((t) => !t.url).sort((a, b) => b.id! - a.id!)[0]!.id!;
  });

  expect((await sendToBackground(page, 'tab:status', { tabId: siteTab })).data).toEqual({
    available: true,
  });
  expect((await sendToBackground(page, 'tab:status', { tabId: internalTab })).data).toEqual({
    available: false,
    reason: 'no-access',
  });

  const refused = await sendToBackground(page, 'job:start', {
    mode: 'visible',
    tabId: internalTab,
  });
  expect(refused).toMatchObject({
    ok: false,
    error: { code: 'RESTRICTED_PAGE', message: 'no-access' },
  });
  expect((await sendToBackground(page, 'job:get')).data).toBeNull();
});
