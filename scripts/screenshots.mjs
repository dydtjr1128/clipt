// 확장 화면 캡처 생성: README 이미지(docs/images, ko)와 웹스토어 제출 이미지(.output/store/{ko,en}, 1280×800·440×280).
// 실제 확장 UI를 E2E 빌드로 띄워 직접 만든 데모 페이지(저작권·개인정보 없는 자체 콘텐츠) 위에서 찍는다.
// 툴바 팝업은 브라우저 UI라 찍을 수 없어, 팝업 페이지(popup.html?tabId=)를 찍어 데모 페이지 오른쪽 위에 겹친다.
// 먼저 `npm run build:e2e`. UI·문구를 바꿨으면 다시 실행: npm run screenshots
// page.evaluate 안의 코드는 브라우저에서 실행된다
/* global chrome */
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(root, '.output/chrome-mv3-e2e');
const extensionId = JSON.parse(readFileSync(path.join(root, 'scripts/e2e-key.json'), 'utf8')).id;
const icon = readFileSync(path.join(root, 'public/icon/128.png')).toString('base64');
const SITE = 'https://demo.clipt.test/';
const VIEWPORT = { width: 1280, height: 800 };

const COPY = {
  ko: {
    brand: '오늘의 디자인 노트',
    nav: ['홈', '아티클', '컬렉션', '구독'],
    kicker: '이번 주 추천',
    title: '작은 컴포넌트가 큰 차이를 만든다',
    lead: '버튼, 카드, 차트까지. 화면의 한 조각을 정확히 잘라 공유하면 피드백이 빨라집니다.',
    cards: [
      ['컬러 시스템', '대비와 접근성을 지키는 팔레트 만들기', '6분'],
      ['데이터 카드', '숫자를 한눈에 읽히게 배치하는 법', '4분'],
      ['모션 가이드', '움직임은 짧고 의미 있게', '5분'],
    ],
    stats: [
      ['방문자', '12.4k'],
      ['평균 체류', '3분 21초'],
      ['저장', '1,280'],
    ],
    chart: '주간 방문 추이',
    promo: '웹을 원하는 만큼 캡처·녹화',
  },
  en: {
    brand: 'Daily Design Notes',
    nav: ['Home', 'Articles', 'Collections', 'Subscribe'],
    kicker: 'Pick of the week',
    title: 'Small components make a big difference',
    lead: 'Buttons, cards and charts. Clip exactly the piece you need and get feedback faster.',
    cards: [
      ['Color systems', 'Build palettes that keep contrast accessible', '6 min'],
      ['Data cards', 'Lay out numbers people can read at a glance', '4 min'],
      ['Motion guide', 'Keep movement short and meaningful', '5 min'],
    ],
    stats: [
      ['Visitors', '12.4k'],
      ['Avg. time', '3m 21s'],
      ['Saves', '1,280'],
    ],
    chart: 'Weekly visits',
    promo: 'Clip anything on the web.',
  },
};

function demoPage(c) {
  const bars = [42, 58, 51, 74, 66, 88, 79];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${c.brand}</title><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.5 "Segoe UI","Malgun Gothic",system-ui,sans-serif;background:#f6f7fb;color:#1d2433}
header{display:flex;align-items:center;gap:32px;padding:18px 56px;background:#fff;border-bottom:1px solid #e6e8f0}
.logo{font-weight:800;font-size:20px;color:#3b3fd8}nav{display:flex;gap:24px;color:#5b6478;font-size:15px}
main{max-width:1168px;margin:0 auto;padding:40px 56px}
.kicker{color:#3b3fd8;font-weight:700;font-size:14px;letter-spacing:.04em}h1{margin:6px 0 10px;font-size:40px;line-height:1.2}
.lead{color:#5b6478;font-size:18px;max-width:640px;margin:0 0 32px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.card{background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(20,30,60,.08);overflow:hidden}
.thumb{height:120px}.card:nth-child(1) .thumb{background:linear-gradient(135deg,#ff9a6b,#ff5f8f)}
.card:nth-child(2) .thumb{background:linear-gradient(135deg,#4ec7f2,#3b6fd8)}.card:nth-child(3) .thumb{background:linear-gradient(135deg,#9be15d,#00b37e)}
.body{padding:16px 18px}.body h3{margin:0 0 6px;font-size:18px}.body p{margin:0 0 12px;color:#5b6478;font-size:14px}
.meta{font-size:13px;color:#8a93a6}
.row{display:grid;grid-template-columns:1fr 1.4fr;gap:24px;margin-top:24px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(20,30,60,.08)}
.stat b{display:block;font-size:24px}.stat span{color:#8a93a6;font-size:13px}
.chart{background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(20,30,60,.08)}
.chart h4{margin:0 0 12px;font-size:15px;color:#5b6478}.bars{display:flex;align-items:flex-end;gap:14px;height:120px}
.bars i{flex:1;border-radius:6px 6px 0 0;background:linear-gradient(#6e72ff,#3b3fd8)}
</style></head><body>
<header><span class="logo">◆ ${c.brand}</span><nav>${c.nav.map((n) => `<span>${n}</span>`).join('')}</nav></header>
<main><div class="kicker">${c.kicker}</div><h1>${c.title}</h1><p class="lead">${c.lead}</p>
<section class="cards">${c.cards.map(([t, d, m]) => `<article class="card"><div class="thumb"></div><div class="body"><h3>${t}</h3><p>${d}</p><span class="meta">${m}</span></div></article>`).join('')}</section>
<section class="row"><div class="stats">${c.stats.map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
<div class="chart"><h4>${c.chart}</h4><div class="bars">${bars.map((h) => `<i style="height:${h}%"></i>`).join('')}</div></div></section>
</main></body></html>`;
}

/** 확장 페이지에서 서비스 워커로 프로토콜 메시지를 보낸다 */
const send = (page, type, payload = null) =>
  page.evaluate(
    ([type, payload]) =>
      chrome.runtime.sendMessage({ __clipt: 1, target: 'background', type, payload }),
    [type, payload],
  );

/** 페이지 화면과 팝업 화면을 겹쳐 툴바 팝업이 열린 모습으로 만든다 */
async function composite(ctx, base, overlay, out) {
  const page = await ctx.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.setContent(`<style>html,body{margin:0;width:${VIEWPORT.width}px;height:${VIEWPORT.height}px;overflow:hidden}
img.base{display:block}img.pop{position:absolute;top:10px;right:18px;border-radius:12px;box-shadow:0 12px 40px rgba(20,30,60,.28),0 0 0 1px rgba(20,30,60,.08)}</style>
<img class="base" src="data:image/png;base64,${base.toString('base64')}"><img class="pop" src="data:image/png;base64,${overlay.toString('base64')}">`);
  await page.screenshot({ path: out });
  await page.close();
}

async function shoot(lang, outDir, extraDir) {
  const c = COPY[lang];
  mkdirSync(outDir, { recursive: true });
  if (extraDir) mkdirSync(extraDir, { recursive: true });
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    env: { ...process.env, LANGUAGE: lang, LANG: `${lang}.UTF-8` },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--allowlisted-extension-id=${extensionId}`,
      `--lang=${lang}`,
      '--hide-scrollbars',
    ],
  });
  try {
    await ctx.route(`${SITE}**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: demoPage(c) }),
    );
    const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
    const site = ctx.pages()[0] ?? (await ctx.newPage());
    await site.goto(SITE);
    // 조작용 확장 페이지는 다른 창에 둬 데모 탭을 활성 상태로 유지한다
    const opened = ctx.waitForEvent('page', (p) => p.url().includes('options.html'));
    await worker.evaluate(() =>
      chrome.windows.create({ url: '/options.html', focused: false, width: 400, height: 300 }),
    );
    const control = await opened;
    await control.waitForLoadState();
    const save = (name) => path.join(outDir, name);
    // 5. 설정: 기본값 그대로 먼저 찍는다(아래 녹화 장면을 위해 설정을 바꾸기 전)
    const options = await ctx.newPage();
    await options.setViewportSize(VIEWPORT);
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.waitForTimeout(500);
    await options.screenshot({ path: save('5-settings.png') });
    // README에는 아래가 잘리지 않게 설정 화면 전체를 찍는다(스토어 이미지는 1280×800 고정)
    if (extraDir) {
      await options.setViewportSize({ width: 560, height: 1200 });
      await options.locator('.options').screenshot({ path: path.join(extraDir, 'settings.png') });
    }
    await options.close();
    await control.evaluate(() =>
      chrome.storage.sync.set({
        settings: { record: { countdownSeconds: 0, indicator: 'widget' } },
      }),
    );
    const tabId = await control.evaluate(
      async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
      SITE,
    );

    // 1. 팝업 메뉴
    await site.bringToFront();
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 320, height: 640 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
    await popup.locator('.menu').waitFor();
    const popupShot = await popup.locator('.popup').screenshot();
    await popup.close();
    await site.bringToFront();
    await composite(ctx, await site.screenshot(), popupShot, save('1-popup.png'));

    // 2. 요소 선택 패널(두 번째 카드)
    await send(control, 'job:start', { mode: 'element', tabId });
    await site.locator('clipt-overlay .toast').waitFor();
    const card = await site.locator('.card').nth(1).boundingBox();
    await site.mouse.move(card.x + card.width / 2, card.y + card.height - 20);
    await site.mouse.click(card.x + card.width / 2, card.y + card.height - 20);
    await site.locator('clipt-overlay .panel').waitFor();
    // 카드 본문에서 카드 전체로 한 단계 올린다
    await site.keyboard.press('ArrowUp');
    await site.waitForTimeout(300);
    await site.screenshot({ path: save('2-element.png') });

    // 3. 결과 페이지(위에서 고른 카드 캡처)
    const result = ctx.waitForEvent('page', (p) => p.url().includes('/result.html?id='));
    await site.keyboard.press('Enter');
    const resultPage = await result;
    await resultPage.setViewportSize(VIEWPORT);
    await resultPage.locator('.result-media').waitFor();
    await resultPage.waitForTimeout(500);
    await resultPage.screenshot({ path: save('4-result.png') });
    await resultPage.close();

    // 4. 영역 선택(통계·차트 줄)
    await site.bringToFront();
    await send(control, 'job:start', { mode: 'region', tabId });
    await site.locator('clipt-overlay .catcher').waitFor();
    const row = await site.locator('.row').boundingBox();
    await site.mouse.move(row.x - 12, row.y - 12);
    await site.mouse.down();
    await site.mouse.move(row.x + row.width + 12, row.y + row.height + 12, { steps: 10 });
    await site.mouse.up();
    await site.waitForTimeout(300);
    await site.screenshot({ path: save('3-region.png') });
    await site.keyboard.press('Escape');
    await site.keyboard.press('Escape');

    // 6. 요소 녹화 중(위젯 표시) + 녹화 중 팝업. README에만 쓴다
    if (extraDir) {
      await site.bringToFront();
      await send(control, 'job:start', { mode: 'rec-element', tabId });
      await site.locator('clipt-overlay .toast').waitFor();
      const chart = await site.locator('.chart').boundingBox();
      await site.mouse.click(chart.x + 40, chart.y + 20);
      await site.locator('clipt-overlay .panel').waitFor();
      // 차트 제목에서 차트 카드 전체로 한 단계 올린다
      await site.keyboard.press('ArrowUp');
      await site.waitForTimeout(200);
      await site.keyboard.press('Enter');
      for (let i = 0; i < 100; i++) {
        const job = (await send(control, 'job:get')).data;
        if (job?.phase === 'recording') break;
        await site.waitForTimeout(100);
      }
      await site.waitForTimeout(2200);
      const recPopup = await ctx.newPage();
      await recPopup.setViewportSize({ width: 320, height: 640 });
      await recPopup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
      await recPopup.locator('.rec-timer').waitFor();
      const recShot = await recPopup.locator('.popup').screenshot();
      await recPopup.close();
      await site.bringToFront();
      await site.waitForTimeout(200);
      await composite(ctx, await site.screenshot(), recShot, path.join(extraDir, 'recording.png'));
      await send(control, 'job:cancel', {});
    }

    // 작은 프로모션 타일
    const tile = await ctx.newPage();
    await tile.setViewportSize({ width: 440, height: 280 });
    await tile.setContent(`<style>html,body{margin:0;width:440px;height:280px;overflow:hidden;font-family:"Segoe UI","Malgun Gothic",system-ui,sans-serif}
.t{width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#3b3fd8,#7b5cff);color:#fff}
.t img{width:96px;height:96px}.t b{font-size:40px;letter-spacing:.01em}.t span{font-size:18px;opacity:.92}</style>
<div class="t"><img src="data:image/png;base64,${icon}"><b>Clipt</b><span>${c.promo}</span></div>`);
    await tile.screenshot({ path: save('promo-440x280.png') });
    await tile.close();
  } finally {
    await ctx.close();
  }
}

// README 이미지 이름 ← 스토어 이미지(ko)
const README_IMAGES = {
  'popup.png': '1-popup.png',
  'element.png': '2-element.png',
  'region.png': '3-region.png',
  'result.png': '4-result.png',
};

for (const lang of ['ko', 'en']) {
  const store = path.join(root, '.output/store', lang);
  const readme = path.join(root, 'docs/images');
  await shoot(lang, store, lang === 'ko' ? readme : null);
  if (lang === 'ko') {
    for (const [name, from] of Object.entries(README_IMAGES)) {
      copyFileSync(path.join(store, from), path.join(readme, name));
    }
    console.log(`README images: ${readme}`);
  }
  console.log(`store images: ${store}`);
}
