import type { Route } from '@playwright/test';

/**
 * E2E 테스트 사이트 응답. 네트워크 없이 context.route로 HTML·이미지를 돌려준다.
 * 색은 결과 이미지 픽셀 검사에 쓰므로 PALETTE를 기준으로 비교한다.
 */
export const PALETTE = {
  header: [255, 0, 0],
  bandA: [0, 192, 0],
  bandB: [0, 96, 255],
  lazy: [255, 0, 255],
  block: [255, 160, 0],
  background: [240, 240, 240],
} as const;

const css = (rgb: readonly number[]) => `rgb(${rgb.join(',')})`;

const BAND = 500;

/** `/long?h=높이&fixed=1&lazy=이미지위치` 긴 페이지: 고정 헤더 + 색 띠 + 지연 로딩 이미지 */
function longPage(params: URLSearchParams): string {
  const height = Number(params.get('h') ?? 3000);
  const fixed = params.get('fixed') === '1';
  const lazyAt = params.get('lazy');
  const bands = Array.from({ length: Math.ceil(height / BAND) }, (_, i) => {
    const h = Math.min(BAND, height - i * BAND);
    return `<div style="height:${h}px;background:${css(i % 2 ? PALETTE.bandB : PALETTE.bandA)}"></div>`;
  }).join('');
  return `<!doctype html><title>long</title>
<style>html,body{margin:0}body{position:relative}
#hdr{position:fixed;top:0;left:0;right:0;height:60px;background:${css(PALETTE.header)};z-index:10}
#lazy{position:absolute;left:100px;width:300px;height:200px;display:block}</style>
<body>${fixed ? '<div id="hdr"></div>' : ''}${bands}
${lazyAt ? `<img id="lazy" loading="lazy" src="/img/slow.svg" style="top:${lazyAt}px" alt="">` : ''}
</body>`;
}

/** `/blocks` 선택 테스트용: 위치가 정해진 블록·링크·Shadow DOM·긴 요소 */
function blocksPage(params: URLSearchParams): string {
  const tall = Number(params.get('tall') ?? 0);
  const fixed = params.get('fixed') === '1';
  return `<!doctype html><title>blocks</title>
<style>html,body{margin:0;background:${css(PALETTE.background)};font:16px sans-serif}
#block{position:absolute;left:200px;top:150px;width:240px;height:120px;background:${css(PALETTE.block)}}
#link{position:absolute;left:520px;top:160px;padding:8px}
#host{position:absolute;left:520px;top:260px}
.card{position:absolute;left:100px;top:420px;width:300px;padding:10px;background:#fff}
.card p{margin:0 0 8px;height:30px;background:#ddd}
#tall{position:absolute;left:600px;top:${tall ? 500 : -9999}px;width:200px;height:${tall}px;
 background:linear-gradient(${css(PALETTE.bandA)} 0 50%, ${css(PALETTE.bandB)} 50% 100%)}
#scroller{position:absolute;left:100px;top:700px;width:300px;height:150px;overflow:auto;background:#fff}
#inner-tall{height:600px;background:linear-gradient(${css(PALETTE.bandA)} 0 50%, ${css(PALETTE.bandB)} 50% 100%)}
#hdr{position:fixed;top:0;left:0;right:0;height:60px;background:${css(PALETTE.header)};z-index:10}
#spacer{height:${Math.max(2000, tall + 1200)}px}</style>
<body><div id="spacer"></div>
<div id="block"></div>
<a id="link" href="/navigated">link target</a>
<div id="host"></div>
<div class="card" id="card"><p id="p1"></p><p id="p2"></p><p id="p3"></p></div>
<div id="tall"></div>
<div id="scroller"><div id="inner-tall"></div></div>
${fixed ? '<div id="hdr"></div>' : ''}
<script>
const root = document.getElementById('host').attachShadow({ mode: 'open' });
root.innerHTML = '<button id="inner" style="width:120px;height:40px">shadow</button>';
</script></body>`;
}

const SLOW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="${css(PALETTE.lazy)}"/></svg>`;

export async function handleSite(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  if (url.pathname === '/img/slow.svg') {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return route.fulfill({ contentType: 'image/svg+xml', body: SLOW_SVG });
  }
  if (url.pathname === '/long') {
    return route.fulfill({ contentType: 'text/html', body: longPage(url.searchParams) });
  }
  if (url.pathname === '/blocks') {
    return route.fulfill({ contentType: 'text/html', body: blocksPage(url.searchParams) });
  }
  const title = url.searchParams.get('title') ?? 'site';
  return route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>${title}</title><body style="margin:0;background:#0a7"><h1>${title}</h1></body>`,
  });
}
