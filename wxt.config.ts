import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';
import { RECORDING_MENU, SCREENSHOT_MENU, SUGGESTED_KEYS } from './src/core/menu';

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

/** 단축키 명령. 설명은 _locales의 cmd_<이름> 메시지 */
const commands = Object.fromEntries(
  [...SCREENSHOT_MENU, ...RECORDING_MENU].map(({ command }) => [
    command,
    {
      description: `__MSG_cmd_${command.replaceAll('-', '_')}__`,
      ...(SUGGESTED_KEYS[command] ? { suggested_key: { default: SUGGESTED_KEYS[command] } } : {}),
    },
  ]),
);

// 권한과 manifest는 docs/architecture.md 13절, 권한 사유는 docs/store/permissions.md
export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  manifestVersion: 3,
  // 스토어 업로드용 zip 이름: .output/clipt-<version>.zip
  zip: { artifactTemplate: 'clipt-{{version}}.zip' },
  outDirTemplate: e2e
    ? '{{browser}}-mv{{manifestVersion}}-e2e'
    : '{{browser}}-mv{{manifestVersion}}',
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    // ko·en 외 언어 사용자에게는 영어로 보이도록 기본 로케일은 en
    default_locale: 'en',
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
    commands,
    ...(e2e ? { host_permissions: ['<all_urls>'], key: e2eKey } : {}),
  },
});
