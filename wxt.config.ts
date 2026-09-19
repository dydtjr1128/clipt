import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

/**
 * E2E 전용 빌드(CLIPT_E2E=1)는 `.output/chrome-mv3-e2e`에 따로 만들고 `<all_urls>` host 권한을 더한다.
 * Playwright는 툴바 클릭·단축키로 activeTab을 부여할 수 없기 때문이다.
 * 배포 빌드(`.output/chrome-mv3`)에는 host 권한이 없으며 E2E가 이를 확인한다.
 */
const e2e = process.env.CLIPT_E2E === '1';
/** E2E 빌드의 확장 ID를 고정하는 공개키. 탭 캡처 허용 플래그(--allowlisted-extension-id)에 쓴다 */
const e2eKey = e2e
  ? (JSON.parse(readFileSync('scripts/e2e-key.json', 'utf8')) as { key: string }).key
  : undefined;

// 권한과 manifest는 docs/architecture.md 13절, 권한 사유는 docs/store/permissions.md
export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  manifestVersion: 3,
  outDirTemplate: e2e
    ? '{{browser}}-mv{{manifestVersion}}-e2e'
    : '{{browser}}-mv{{manifestVersion}}',
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'ko',
    minimum_chrome_version: '116',
    permissions: [
      'activeTab',
      'scripting',
      'tabCapture',
      'offscreen',
      'storage',
      'downloads',
      'clipboardWrite',
    ],
    ...(e2e ? { host_permissions: ['<all_urls>'], key: e2eKey } : {}),
  },
});
