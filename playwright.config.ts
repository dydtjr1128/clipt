import { defineConfig } from '@playwright/test';

// 확장 로드 E2E. 빌드 결과(.output/chrome-mv3)를 대상으로 하므로 `npm run test:e2e`로 실행한다.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
});
