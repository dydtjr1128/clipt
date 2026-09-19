import type { browser } from 'wxt/browser';
import { test, expect, SITE, sendToBackground, tabIdOf } from './fixtures';
import { waitResult } from './rec';

declare const chrome: typeof browser;

test.describe('영어 브라우저', () => {
  test.use({ lang: 'en-US' });

  test('팝업·설정·선택 패널·결과 페이지가 영어로 표시된다', async ({
    context,
    openExtensionPage,
    openControlWindow,
  }) => {
    const popup = await openExtensionPage('popup.html');
    expect(await popup.evaluate(() => chrome.i18n.getMessage('@@ui_locale'))).toMatch(/^en/);
    await expect(popup.locator('html')).toHaveAttribute('lang', /^en/);
    await expect(popup.locator('.menu')).toContainText('Visible area');
    await expect(popup.locator('.menu')).toContainText('Record tab');
    await expect(popup.locator('.popup')).not.toContainText(/[가-힣]/);
    await popup.locator('[data-action="settings"]').click();
    await expect(popup.locator('.settings')).toContainText('After capture');
    await expect(popup.locator('.popup')).not.toContainText(/[가-힣]/);
    const commands = await popup.evaluate(() => chrome.commands.getAll());
    expect(commands.find((c) => c.name === 'capture-region')?.description).toBe('Capture region');

    // 페이지 위 오버레이와 선택 패널
    const site = await context.newPage();
    await site.goto(`${SITE}/blocks`);
    await site.bringToFront();
    const control = await openControlWindow();
    const tabId = await tabIdOf(control, `${SITE}/blocks`);
    await sendToBackground(control, 'job:start', { mode: 'element', tabId });
    await expect(site.locator('clipt-overlay .toast')).toContainText('Click an element');
    await site.mouse.click(250, 200);
    const panel = site.locator('clipt-overlay .panel');
    await expect(panel).toContainText('Select element');
    await expect(panel).toContainText('Reselect');
    await expect(panel).not.toContainText(/[가-힣]/);

    // 결과 페이지
    const opened = waitResult(context);
    await site.keyboard.press('Enter');
    const result = await opened;
    await expect(result.locator('[data-action="download"]')).toContainText('Download');
    await expect(result.locator('.info')).toContainText('Selector');
    await expect(result).toHaveTitle(/^Clipt · Element capture/);
    await expect(result.locator('.result-app')).not.toContainText(/[가-힣]/);
  });
});

test('한국어 브라우저에서는 한국어로 표시된다', async ({ openExtensionPage }) => {
  const popup = await openExtensionPage('popup.html');
  await expect(popup.locator('html')).toHaveAttribute('lang', /^ko/);
  await expect(popup.locator('.menu')).toContainText('보이는 화면');
});
