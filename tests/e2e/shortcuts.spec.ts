import type { Worker } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { test, expect, SITE, tabIdOf } from './fixtures';
import { jobOf, readVideo, setSettings, waitRecording, waitResult } from './rec';

declare const chrome: typeof browser;

/**
 * Playwright는 브라우저 수준 단축키를 누를 수 없어, 서비스 워커에서 commands.onCommand 이벤트를
 * 직접 발생시킨다. 실제 키 입력은 수동 확인 대상이다.
 */
function pressCommand(serviceWorker: Worker, command: string, tabId: number) {
  return serviceWorker.evaluate(
    async ([command, tabId]) => {
      const tab = await chrome.tabs.get(tabId);
      (
        chrome.commands.onCommand as unknown as { dispatch: (c: string, t: unknown) => void }
      ).dispatch(command, tab);
    },
    [command, tabId] as const,
  );
}

test('기본 단축키 4개가 등록되고 팝업에 표시된다', async ({ openExtensionPage }) => {
  const popup = await openExtensionPage('popup.html');
  const commands = await popup.evaluate(() => chrome.commands.getAll());
  const assigned = Object.fromEntries(
    commands.filter((c) => c.shortcut).map((c) => [c.name, c.shortcut]),
  );
  expect(assigned).toEqual({
    'capture-visible': 'Alt+Shift+1',
    'capture-region': 'Alt+Shift+2',
    'capture-element': 'Alt+Shift+3',
    'toggle-recording': 'Alt+Shift+4',
  });
  expect(commands.find((c) => c.name === 'capture-visible')?.description).toBe('보이는 화면 캡처');

  await expect(popup.locator('[data-mode="visible"] .menu-shortcut')).toHaveText('Alt+Shift+1');
  await expect(popup.locator('[data-mode="rec-tab"] .menu-shortcut')).toHaveText('Alt+Shift+4');
  const unassigned = popup.locator('[data-mode="fullpage"] .menu-shortcut');
  await expect(unassigned).toHaveText('–');
  await expect(unassigned).toHaveAttribute('title', /단축키가 없어요/);
});

test('단축키로 캡처를 시작하고, 선택 중 다시 누르면 취소한다', async ({
  context,
  serviceWorker,
  openControlWindow,
}) => {
  const site = await context.newPage();
  await site.goto(`${SITE}/blocks`);
  await site.bringToFront();
  const control = await openControlWindow();
  const tabId = await tabIdOf(control, `${SITE}/blocks`);

  const opened = waitResult(context);
  await pressCommand(serviceWorker, 'capture-visible', tabId);
  await expect((await opened).locator('img.result-media')).toBeVisible();

  await site.bringToFront();
  await pressCommand(serviceWorker, 'capture-region', tabId);
  await expect(site.locator('clipt-overlay .catcher')).toBeVisible();
  await pressCommand(serviceWorker, 'capture-region', tabId);
  await expect(site.locator('clipt-overlay')).toHaveCount(0);
  await expect.poll(() => jobOf(control)).toBeNull();
});

test('팝업 없이 단축키로 녹화를 시작하고 중지한다', async ({
  context,
  serviceWorker,
  openControlWindow,
}) => {
  const site = await context.newPage();
  await site.goto(`${SITE}/long?h=2000`);
  await site.bringToFront();
  const control = await openControlWindow();
  await setSettings(control, { record: { countdownSeconds: 0 } });
  const tabId = await tabIdOf(control, `${SITE}/long?h=2000`);

  await pressCommand(serviceWorker, 'toggle-recording', tabId);
  await waitRecording(control, 2);
  const opened = waitResult(context);
  await pressCommand(serviceWorker, 'toggle-recording', tabId);
  const video = await readVideo(await opened);
  expect(video.duration).toBeGreaterThan(1);
  await expect.poll(() => jobOf(control)).toBeNull();
});

test('제한 페이지에서 단축키를 누르면 배지와 팝업 알림으로 알린다', async ({
  context,
  serviceWorker,
  openExtensionPage,
}) => {
  const internal = await context.newPage();
  await internal.goto('chrome://version');
  const control = await openExtensionPage('options.html');
  const tabId = await control.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((t) => !t.url).sort((a, b) => b.id! - a.id!)[0]!.id!;
  });
  await pressCommand(serviceWorker, 'capture-visible', tabId);
  await expect.poll(() => control.evaluate(() => chrome.action.getBadgeText({}))).toBe('!');
  const popup = await openExtensionPage('popup.html');
  await expect(popup.locator('.notice-warn')).toContainText('사용할 수 없어요');
});
