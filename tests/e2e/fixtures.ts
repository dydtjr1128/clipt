import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { browser } from 'wxt/browser';
import { handleSite } from './site';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** E2E 전용 빌드(host 권한 포함). 배포 빌드 경로는 productionPath */
export const extensionPath = path.join(root, '.output/chrome-mv3-e2e');
export const productionPath = path.join(root, '.output/chrome-mv3');
/** E2E 빌드의 고정 확장 ID (scripts/e2e-key.json) */
export const E2E_EXTENSION_ID = (
  JSON.parse(readFileSync(path.join(root, 'scripts/e2e-key.json'), 'utf8')) as { id: string }
).id;

/** 테스트 사이트 origin. 네트워크 없이 context.route로 응답한다 */
export const SITE = 'https://clipt.test';

/** 확장 페이지·서비스 워커 전역의 chrome 객체 타입 */
declare const chrome: typeof browser;

type Options = {
  /** Chromium 실행 시 기기 배율. --force-device-scale-factor */
  scaleFactor: number;
  /** 브라우저 창 크기 */
  windowSize: [number, number];
  /** 브라우저 UI 언어(--lang). chrome.i18n이 이 값을 따른다 */
  lang: string;
};

type Fixtures = {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  /** 확장 페이지를 새 탭으로 연다 */
  openExtensionPage: (path: string) => Promise<Page>;
  /**
   * 확장 페이지를 별도 창으로 연다. captureVisibleTab은 창의 활성 탭을 찍으므로
   * 조작용 페이지를 다른 창에 두어 대상 사이트 탭을 활성 상태로 유지한다.
   */
  openControlWindow: (path?: string) => Promise<Page>;
};

/** 빌드된 확장을 로드한 Chromium 컨텍스트와 서비스 워커를 제공한다. */
export const test = base.extend<Fixtures & Options>({
  scaleFactor: [1, { option: true }],
  windowSize: [[1000, 800], { option: true }],
  lang: ['ko', { option: true }],
  context: async ({ scaleFactor, windowSize, lang }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      viewport: null,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--force-device-scale-factor=${scaleFactor}`,
        `--window-size=${windowSize[0]},${windowSize[1]}`,
        `--lang=${lang}`,
        // 툴바 클릭 없이도 탭 캡처를 허용한다(테스트 전용 플래그)
        `--allowlisted-extension-id=${E2E_EXTENSION_ID}`,
        // 주의: --use-fake-ui-for-media-stream은 탭 캡처(getUserMedia)를 NotFoundError로 막는다.
        // 확장 origin에는 마이크 권한도 줄 수 없어 E2E는 마이크 없는 경로만 확인한다
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    await context.route(`${SITE}/**`, handleSite);
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
  openExtensionPage: async ({ context, extensionId }, use) => {
    await use(async (path) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${path}`);
      return page;
    });
  },
  openControlWindow: async ({ context, serviceWorker }, use) => {
    await use(async (path = 'options.html') => {
      const opened = context.waitForEvent('page', (p) => p.url().includes(path));
      await serviceWorker.evaluate(
        (url) => chrome.windows.create({ url, focused: false, width: 400, height: 300 }),
        `/${path}`,
      );
      const page = await opened;
      await page.waitForLoadState();
      return page;
    });
  },
});

export const expect = test.expect;

/** 확장 페이지 컨텍스트에서 서비스 워커로 프로토콜 메시지를 보낸다 */
export function sendToBackground(page: Page, type: string, payload: unknown = null) {
  return page.evaluate(
    ([type, payload]) =>
      chrome.runtime.sendMessage({ __clipt: 1, target: 'background', type, payload }),
    [type, payload] as const,
  ) as Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }>;
}

/** URL로 탭 id를 찾는다 (E2E 빌드는 host 권한이 있어 URL을 읽을 수 있다) */
export function tabIdOf(extensionPage: Page, url: string): Promise<number> {
  return extensionPage.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === url);
    if (tab?.id === undefined) throw new Error(`tab not found: ${url}`);
    return tab.id;
  }, url);
}
