// 녹화 실측: 수동 체크리스트의 "1080p 절반 영역 30fps"와 "장시간 녹화 메모리"를 같은 조건으로 다시 잰다.
// E2E 빌드(.output/chrome-mv3-e2e)를 쓰므로 먼저 `npm run build:e2e`. CI에서는 돌리지 않는다(화면·시간 필요).
//   npm run measure:recording -- fps            헤드풀 1920×1200 창, 매 프레임 바뀌는 페이지의 왼쪽 절반 영역 10초 녹화
//   npm run measure:recording -- memory 10      헤드리스, 탭 녹화 N분(기본 10) 동안 chunk 크기·브라우저 메모리 기록
// 결과는 표로 출력한다. 소리는 내지 않는다(오디오 없음).
// page.evaluate 안의 코드는 브라우저에서 실행된다
/* global chrome, innerWidth, innerHeight, performance, requestAnimationFrame, indexedDB */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(root, '.output/chrome-mv3-e2e');
const extensionId = JSON.parse(readFileSync(path.join(root, 'scripts/e2e-key.json'), 'utf8')).id;
const SITE = 'https://measure.clipt.test/';
const [mode = 'fps', minutesArg] = process.argv.slice(2);

/** 매 프레임 색과 도형이 바뀌는 페이지(인코더가 정지 화면으로 줄이지 못하게) */
const ANIMATED = `<!doctype html><body style="margin:0;overflow:hidden"><canvas id=c></canvas><script>
const c = document.getElementById('c'); c.width = innerWidth; c.height = innerHeight;
const x = c.getContext('2d'); let n = 0;
(function loop() {
  n++;
  for (let i = 0; i < 60; i++) {
    x.fillStyle = 'hsl(' + ((n * 3 + i * 11) % 360) + ',70%,' + (30 + ((n + i) % 40)) + '%)';
    x.fillRect((n * 7 + i * 53) % c.width, (i * 37 + n * 5) % c.height, 60 + i, 60 + i);
  }
  x.fillStyle = '#fff'; x.font = '80px monospace'; x.fillText(String(n), (n * 17) % c.width, 100 + ((n * 11) % (c.height - 100)));
  requestAnimationFrame(loop);
})();
</script></body>`;

async function launch(headless, windowSize) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless,
    viewport: null,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--allowlisted-extension-id=${extensionId}`,
      `--window-size=${windowSize.join(',')}`,
      '--window-position=0,0',
      '--force-device-scale-factor=1',
    ],
  });
  await context.route(`${SITE}**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: ANIMATED }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const site = context.pages()[0] ?? (await context.newPage());
  await site.goto(SITE);
  await site.bringToFront();
  const opened = context.waitForEvent('page', (p) => p.url().includes('options.html'));
  await worker.evaluate(() =>
    chrome.windows.create({ url: '/options.html', focused: false, width: 400, height: 300 }),
  );
  const control = await opened;
  await control.waitForLoadState();
  const tabId = await control.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    SITE,
  );
  const send = (type, payload = null, target = 'background') =>
    control.evaluate(
      ([type, payload, target]) =>
        chrome.runtime.sendMessage({ __clipt: 1, target, type, payload }),
      [type, payload, target],
    );
  const settings = (record) =>
    control.evaluate((r) => chrome.storage.sync.set({ settings: { record: r } }), record);
  const waitPhase = async (phase) => {
    for (let i = 0; i < 200; i++) {
      if ((await send('job:get')).data?.phase === phase) return;
      await site.waitForTimeout(100);
    }
    throw new Error(`job did not reach ${phase}`);
  };
  const stop = async () => {
    const result = context.waitForEvent('page', {
      predicate: (p) => p.url().includes('/result.html?id='),
      timeout: 120_000,
    });
    await send('job:stop', {});
    const page = await result;
    await page.waitForLoadState();
    return page;
  };
  return { context, site, control, tabId, send, settings, waitPhase, stop };
}

async function measureFps() {
  const { context, site, tabId, send, settings, waitPhase, stop } = await launch(
    false,
    [1920, 1200],
  );
  try {
    const vp = await site.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    // 화면 주사율: 탭 캡처 프레임은 화면 갱신에 맞춰 나오므로 결과 해석에 필요하다(대상 탭이 앞에 있을 때 잰다)
    const refresh = await site.evaluate(
      () =>
        new Promise((r) => {
          let n = 0;
          const t = performance.now();
          (function f() {
            n++;
            if (performance.now() - t < 1000) requestAnimationFrame(f);
            else r(n);
          })();
        }),
    );
    await settings({ countdownSeconds: 0, audio: 'none', fps: 30 });
    await send('job:start', { mode: 'rec-region', tabId });
    await site.bringToFront();
    await site.waitForTimeout(300);
    await site.mouse.move(0, 0);
    await site.mouse.down();
    await site.mouse.move(vp.w / 2, vp.h, { steps: 8 });
    await site.mouse.up();
    await site.keyboard.press('Enter');
    await waitPhase('recording');
    await site.waitForTimeout(1500);
    const status = async () => (await send('rec:status', null, 'offscreen')).data.frames;
    const a = await status();
    const t0 = Date.now();
    await site.waitForTimeout(10_000);
    const b = await status();
    const seconds = (Date.now() - t0) / 1000;
    const result = await stop();
    await result.bringToFront();
    const video = await result.locator('video.result-media').evaluate(async (v) => {
      await new Promise((r) =>
        v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true }),
      );
      v.muted = true;
      v.currentTime = 0;
      await v.play();
      await new Promise((r) => v.addEventListener('ended', r, { once: true }));
      const q = v.getVideoPlaybackQuality();
      return {
        width: v.videoWidth,
        height: v.videoHeight,
        total: q.totalVideoFrames,
        dropped: q.droppedVideoFrames,
      };
    });
    console.log('| 항목 | 값 |\n| --- | --- |');
    console.log(`| 뷰포트 | ${vp.w}×${vp.h} (DPR 1), 화면 주사율 약 ${refresh}Hz |`);
    console.log(`| 녹화 영역 | 왼쪽 절반 ${video.width}×${video.height}, 30fps 설정 |`);
    console.log(
      `| 크롭 단계 입력 | ${((b.in - a.in) / seconds).toFixed(1)} fps (${seconds.toFixed(1)}초) |`,
    );
    console.log(`| 크롭 단계 출력 | ${((b.out - a.out) / seconds).toFixed(1)} fps |`);
    console.log(`| 결과 재생 | 프레임 ${video.total}, 드롭 ${video.dropped} |`);
  } finally {
    await context.close();
  }
}

function browserMemoryMB(exe) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        `(Get-Process | Where-Object { $_.Path -eq '${exe}' } | Measure-Object PrivateMemorySize64 -Sum).Sum`,
      ]).toString();
      return Number(out.trim()) / 1048576;
    }
    const out = execFileSync('ps', ['-eo', 'rss=,args=']).toString();
    return (
      out
        .split('\n')
        .filter((line) => line.includes(exe))
        .reduce((sum, line) => sum + Number(line.trim().split(/\s+/)[0] ?? 0), 0) / 1024
    );
  } catch {
    return NaN;
  }
}

async function measureMemory(minutes) {
  const { context, site, control, tabId, send, settings, waitPhase, stop } = await launch(
    true,
    [1280, 800],
  );
  try {
    const exe = chromium.executablePath();
    await settings({
      countdownSeconds: 0,
      audio: 'none',
      fps: 30,
      bitrate: 'high',
      maxMinutes: 60,
    });
    await send('job:start', { mode: 'rec-tab', tabId });
    await waitPhase('recording');
    const chunkBytes = () =>
      control.evaluate(async () => {
        const db = await new Promise((r) => {
          const q = indexedDB.open('clipt');
          q.onsuccess = () => r(q.result);
        });
        const all = await new Promise((r) => {
          const q = db.transaction('chunks').objectStore('chunks').getAll();
          q.onsuccess = () => r(q.result);
        });
        db.close();
        return all.reduce((s, b) => s + b.size, 0);
      });
    console.log('| 시점 | 저장된 chunk | 브라우저 메모리 합계 |\n| --- | ---: | ---: |');
    const t0 = Date.now();
    const marks = [1, 2, 3, 5, 7, 10, 15, 20, 30, 45, 60].filter((m) => m <= minutes);
    for (const m of marks) {
      await site.waitForTimeout(Math.max(0, t0 + m * 60_000 - Date.now()));
      console.log(
        `| ${m}분 | ${((await chunkBytes()) / 1048576).toFixed(1)} MiB | ${browserMemoryMB(exe).toFixed(0)} MB |`,
      );
    }
    const result = await stop();
    const info = await result.locator('video.result-media').evaluate(async (v) => {
      await new Promise((r) =>
        v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true }),
      );
      await new Promise((r) => {
        v.addEventListener('seeked', r, { once: true });
        v.currentTime = v.duration / 2;
      });
      return { duration: v.duration, seeked: Math.abs(v.currentTime - v.duration / 2) < 2 };
    });
    console.log(
      `\n결과: ${info.duration.toFixed(1)}초, 중간 지점 탐색 ${info.seeked ? '정상' : '실패'}`,
    );
  } finally {
    await context.close();
  }
}

if (mode === 'fps') await measureFps();
else if (mode === 'memory') await measureMemory(Number(minutesArg ?? 10));
else {
  console.error('사용법: npm run measure:recording -- fps | memory [분]');
  process.exitCode = 1;
}
