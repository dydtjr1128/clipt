import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { browser } from 'wxt/browser';
import { test, expect, extensionPath, E2E_EXTENSION_ID } from './fixtures';

declare const chrome: typeof browser;

test('팝업에서 바꾼 설정이 옵션 페이지에 바로 같은 값으로 보인다', async ({
  openExtensionPage,
}) => {
  const options = await openExtensionPage('options.html');
  const popup = await openExtensionPage('popup.html');
  await popup.locator('[data-action="settings"]').click();
  await expect(popup.locator('[data-view="settings"]')).toBeVisible();

  await popup.locator('[data-setting="image.format"] [data-value="jpeg"]').click();
  await popup.locator('[data-setting="record.fps"] [data-value="60"]').click();
  await popup.locator('[data-setting="record.audio"]').selectOption('none');
  await popup.locator('[data-setting="afterCapture"] input[value="clipboard"]').check();

  const checked = (selector: string) =>
    expect(options.locator(selector)).toHaveAttribute('aria-checked', 'true');
  await checked('[data-setting="image.format"] [data-value="jpeg"]');
  await expect(options.locator('[data-setting="image.jpegQuality"]')).toBeVisible(); // JPEG일 때만
  await checked('[data-setting="record.fps"] [data-value="60"]');
  await expect(options.locator('[data-setting="record.audio"]')).toHaveValue('none');
  await expect(
    options.locator('[data-setting="afterCapture"] input[value="clipboard"]'),
  ).toBeChecked();

  // 옵션 페이지에서 바꾸면 팝업에도 반영된다
  await options.locator('[data-setting="record.indicator"] [data-value="widget"]').click();
  await expect(
    popup.locator('[data-setting="record.indicator"] [data-value="widget"]'),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(popup.locator('.set-hint.is-warn')).toBeVisible(); // 탭 녹화에 찍힌다는 경고

  // 뒤로 가면 메뉴 하단 요약에 반영
  await popup.locator('[data-action="back"]').click();
  await expect(popup.locator('.popup-profile')).toContainText('60fps');
  await expect(popup.locator('.popup-profile')).toContainText('소리 없음');
});

test('지원하지 않는 포맷은 고를 수 없고 마이크를 고르면 권한 안내가 보인다', async ({
  openExtensionPage,
}) => {
  const options = await openExtensionPage('options.html');
  const support = await options.evaluate(() => ({
    mp4: MediaRecorder.isTypeSupported('video/mp4'),
    vp9: MediaRecorder.isTypeSupported('video/webm;codecs=vp9'),
  }));
  expect(support.vp9).toBe(true);
  const select = options.locator('[data-setting="record.format"]');
  await expect(select.locator('option[value="webm-vp9"]')).toBeEnabled();
  if (!support.mp4) await expect(select.locator('option[value="mp4"]')).toBeDisabled();

  await options.locator('[data-setting="record.audio"]').selectOption('tab+mic');
  await expect(options.locator('[data-action="mic-permission"]')).toBeVisible();
});

test('브라우저를 다시 시작해도 설정이 유지된다', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'clipt-settings-'));
  const launch = () =>
    chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      env: { ...process.env, LANGUAGE: 'ko', LANG: 'ko.UTF-8' },
    });
  const url = `chrome-extension://${E2E_EXTENSION_ID}/options.html`;
  try {
    let context = await launch();
    let page = await context.newPage();
    await page.goto(url);
    await page.locator('[data-setting="record.countdownSeconds"] [data-value="5"]').click();
    await page.locator('[data-setting="afterRecord"] input[value="download"]').check();
    await expect
      .poll(() => page.evaluate(async () => (await chrome.storage.sync.get('settings')).settings))
      .toMatchObject({ afterRecord: 'download', record: { countdownSeconds: 5 } });
    await context.close();

    context = await launch();
    page = await context.newPage();
    await page.goto(url);
    await expect(
      page.locator('[data-setting="record.countdownSeconds"] [data-value="5"]'),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      page.locator('[data-setting="afterRecord"] input[value="download"]'),
    ).toBeChecked();
    await context.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
