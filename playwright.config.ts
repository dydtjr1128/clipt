import { defineConfig } from '@playwright/test';

// 확장 로드 E2E. 빌드 결과(.output/chrome-mv3-e2e)를 대상으로 하므로 `npm run test:e2e`로 실행한다.
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // 확장·탭 캡처를 쓰는 테스트라 브라우저를 하나씩 띄운다
  workers: 1,
  // CI 러너는 느리고 녹화 타이밍에 민감해 한 번 재시도한다. 로컬에서는 재시도 없이 바로 실패를 본다
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [['list'], ['github']] : [['list']],
  use: { trace: ci ? 'retain-on-failure' : 'off' },
});
