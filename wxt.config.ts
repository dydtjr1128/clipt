import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// 권한과 manifest는 docs/architecture.md 13절 기준
export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  manifestVersion: 3,
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
  },
});
