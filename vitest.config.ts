import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// WxtVitest: 경로 별칭(@/)과 fake browser(chrome API 대역)를 테스트에 제공
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
