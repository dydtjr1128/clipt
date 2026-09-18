// E2E 전용 빌드: host 권한을 더한 확장을 .output/chrome-mv3-e2e에 만든다 (wxt.config.ts 참고)
process.env.CLIPT_E2E = '1';
const { build } = await import('wxt');
await build();
