import type { Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';

declare const chrome: typeof browser;

/** 팝업은 E2E에서 탭으로 열고 `?tabId=`로 대상 탭을 지정한다 */
async function openPopup(open: (path: string) => Promise<Page>, tabId: number) {
  const popup = await open(`popup.html?tabId=${tabId}`);
  await expect(popup.locator('.popup')).toBeVisible();
  return popup;
}

const MODES = [
  'visible',
  'fullpage',
  'element',
  'region',
  'rec-tab',
  'rec-region',
  'rec-element',
] as const;

test('팝업에서 7개 기능을 모두 시작할 수 있다', async ({ context, openExtensionPage }) => {
  const site = await context.newPage();
  await site.goto(`${SITE}/menu`);
  const control = await openExtensionPage('options.html');
  const tabId = await tabIdOf(control, `${SITE}/menu`);

  for (const mode of MODES) {
    const popup = await openPopup(openExtensionPage, tabId);
    const item = popup.locator(`.menu-item[data-mode="${mode}"]`);
    await expect(item).toBeEnabled();
    const closed = popup.waitForEvent('close');
    await item.click();
    await closed; // 시작하면 팝업이 닫힌다

    const job = await sendToBackground(control, 'job:get');
    expect(job.data).toMatchObject({ mode, tabId });
    await sendToBackground(control, 'job:cancel', {});
  }
});

test('제한 페이지에서는 메뉴가 비활성화되고 사유를 안내한다', async ({
  context,
  openExtensionPage,
}) => {
  const internal = await context.newPage();
  await internal.goto('chrome://version');
  const control = await openExtensionPage('options.html');
  const tabId = await control.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((t) => !t.url).sort((a, b) => b.id! - a.id!)[0]!.id!;
  });

  const popup = await openPopup(openExtensionPage, tabId);
  await expect(popup.locator('.notice')).toContainText('이 페이지에서는 사용할 수 없어요');
  const items = popup.locator('.menu-item');
  await expect(items).toHaveCount(7);
  for (const item of await items.all()) await expect(item).toBeDisabled();
});

test('녹화 중 팝업을 다시 열어도 경과 시간이 이어진다', async ({
  context,
  openExtensionPage,
  serviceWorker,
}) => {
  const site = await context.newPage();
  await site.goto(`${SITE}/rec`);
  const control = await openExtensionPage('options.html');
  const tabId = await tabIdOf(control, `${SITE}/rec`);
  await serviceWorker.evaluate(
    (tabId) =>
      chrome.storage.session.set({
        job: {
          id: 'rec-e2e',
          mode: 'rec-region',
          tabId,
          windowId: 1,
          phase: 'recording',
          createdAt: Date.now() - 70_000,
          startedAt: Date.now() - 65_000,
        },
      }),
    tabId,
  );

  const first = await openPopup(openExtensionPage, tabId);
  await expect(first.locator('.rec-title')).toContainText('녹화 중 · 영역');
  await expect(first.locator('.rec-timer')).toHaveText(/^01:0[5-7]$/);
  await first.close();

  await new Promise((r) => setTimeout(r, 2_000));
  const second = await openPopup(openExtensionPage, tabId);
  await expect(second.locator('.rec-timer')).toHaveText(/^01:0[7-9]$/);

  await second.locator('.button-rec').click();
  await expect(second.locator('.menu')).toBeVisible(); // 중지하면 메뉴로 돌아온다
});

test('선택 진행 중에는 안내와 취소 버튼을 보여준다', async ({ context, openExtensionPage }) => {
  const site = await context.newPage();
  await site.goto(`${SITE}/select`);
  const control = await openExtensionPage('options.html');
  const tabId = await tabIdOf(control, `${SITE}/select`);
  await sendToBackground(control, 'job:start', { mode: 'element', tabId });

  const popup = await openPopup(openExtensionPage, tabId);
  const state = popup.locator('[data-state="selecting"]');
  await expect(state).toContainText('요소를 선택하는 중');
  await expect(state).toContainText('Esc');
  await state.getByRole('button').click();
  await expect(popup.locator('.menu')).toBeVisible();
  expect((await sendToBackground(control, 'job:get')).data).toBeNull();
});
