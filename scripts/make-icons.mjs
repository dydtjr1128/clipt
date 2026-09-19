// assets/icon.svg를 확장 아이콘 PNG(public/icon/{16,32,48,128}.png)로 만든다.
// 별도 이미지 도구 없이 Playwright Chromium으로 렌더링한다. 아이콘을 바꿨을 때만 실행: npm run icons
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const SIZES = [16, 32, 48, 128];
const svg = readFileSync('assets/icon.svg', 'utf8');
mkdirSync('public/icon', { recursive: true });

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true });
    await page.close();
    console.log(`public/icon/${size}.png`);
  }
} finally {
  await browser.close();
}
