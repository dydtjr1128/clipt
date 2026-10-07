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

/**
 * `/blocks` 선택 테스트용: 위치가 정해진 블록·링크·Shadow DOM·긴 요소,
 * 스크롤 영역(`#scroller`, 내용 600px)과 스크롤로 펼칠 수 없게 가린 상자(`#clip`, overflow: hidden)
 */
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
#clip{position:absolute;left:100px;top:1100px;width:200px;height:100px;overflow:hidden}
#clip-inner{height:300px;background:linear-gradient(${css(PALETTE.bandA)} 0 50%, ${css(PALETTE.bandB)} 50% 100%)}
#hdr{position:fixed;top:0;left:0;right:0;height:60px;background:${css(PALETTE.header)};z-index:10}
#spacer{height:${Math.max(2000, tall + 1200)}px}</style>
<body><div id="spacer"></div>
<div id="block"></div>
<a id="link" href="/navigated">link target</a>
<div id="host"></div>
<div class="card" id="card"><p id="p1"></p><p id="p2"></p><p id="p3"></p></div>
<div id="tall"></div>
<div id="scroller"><div id="inner-tall"></div></div>
<div id="clip"><div id="clip-inner"></div></div>
${fixed ? '<div id="hdr"></div>' : ''}
<script>
const root = document.getElementById('host').attachShadow({ mode: 'open' });
root.innerHTML = '<button id="inner" style="width:120px;height:40px">shadow</button><button id="inner2" style="width:120px;height:40px">second</button>';
</script></body>`;
}

/**
 * `/app?layout=…&h=높이&sticky=1&snap=1` 앱형 페이지. 스크롤 내용(`#content`)은 500px 색 띠(bandA·bandB 반복)이고,
 * sticky=1이면 맨 위에 sticky 머리(lazy 색, 40px), snap=1이면 스크롤 영역에 띠 단위 스크롤 스냅을 건다.
 * - main: 머리글(60px) 아래 `#main`이 스크롤. scale=self|body면 `#main` 또는 body를 transform: scale(.75)로 축소
 * - body: html은 고정이고 body가 스크롤
 * - sidebar: 왼쪽 메뉴(`#nav`, 200px, 자체 스크롤)와 오른쪽 `#main`이 따로 스크롤.
 *   float=1이면 본문 가운데에 고정 부유 패널(`#float`, 본문 가로·세로의 20~80%, 흰색)
 * - shadow: 고정(fixed) 앱 틀(`#shell`) 안에 왼쪽 메뉴와, 열린 Shadow DOM(`#app`) 안에서 스크롤되는 `#main`
 * - slot: 열린 Shadow DOM(`#app`) 안의 고정 앱 틀·메뉴·스크롤 `#main`에 문서의 `#content`를 slot으로 배치
 * - fixedside: 문서가 스크롤되고 왼쪽 메뉴(200px)만 position: fixed
 * - doc: 짧은 일반 문서. 머리글(10vh)·스크롤 목록 `#main`(60vh)·바닥글(40vh, block 색)이라 문서가 10vh 스크롤.
 *   modal=1이면 모달(`#modal`, 화면 전체 반투명 덮개)을 열어 body 스크롤을 잠근 상태
 */
function appPage(params: URLSearchParams): string {
  const layout = params.get('layout') ?? 'main';
  const height = Number(params.get('h') ?? 3000);
  const sticky = params.get('sticky') === '1';
  const snap = params.get('snap') === '1';
  const modal = params.get('modal') === '1';
  const float = params.get('float') === '1';
  const scale = params.get('scale');
  const scaled = 'transform:scale(.75);transform-origin:0 0;';
  const bands = Array.from({ length: Math.ceil(height / BAND) }, (_, i) => {
    const h = Math.min(BAND, height - i * BAND);
    const align = snap ? ';scroll-snap-align:start' : '';
    return `<div style="height:${h}px;background:${css(i % 2 ? PALETTE.bandB : PALETTE.bandA)}${align}"></div>`;
  }).join('');
  const content = `<div id="content">${sticky ? `<div id="sticky" style="position:sticky;top:0;height:40px;background:${css(PALETTE.lazy)};z-index:1"></div>` : ''}${bands}</div>`;
  const snapType = snap ? 'scroll-snap-type:y mandatory;' : '';
  const base = `html,body{margin:0;background:${css(PALETTE.background)}}`;
  const fill = 'html,body{height:100%;overflow:hidden}';
  const nav = `<nav id="nav" style="width:200px;flex:none;overflow:auto;background:${css(PALETTE.header)}"><div style="height:2000px"></div></nav>`;
  switch (layout) {
    case 'body':
      return `<!doctype html><title>app-body</title>
<style>${base}html{height:100%;overflow:hidden}body{height:100%;overflow:auto;${snapType}}</style>
<body>${content}</body>`;
    case 'sidebar':
      return `<!doctype html><title>app-sidebar</title>
<style>${base}${fill}body{display:flex}#main{flex:1;min-width:0;overflow:auto;${snapType}}
#float{position:fixed;left:calc(200px + (100vw - 200px) * .2);width:calc((100vw - 200px) * .6);top:20vh;height:60vh;background:#fff}</style>
<body>${nav}<div id="main">${content}</div>${float ? '<div id="float"></div>' : ''}</body>`;
    case 'shadow':
      return `<!doctype html><title>app-shadow</title>
<style>${base}${fill}#shell{position:fixed;inset:0;display:flex}#app{flex:1;min-width:0}</style>
<body><div id="shell">${nav}<div id="app"></div></div>
<template id="tpl"><style>:host{display:block;height:100%}#main{height:100%;overflow:auto;${snapType}}</style><div id="main">${content}</div></template>
<script>document.getElementById('app').attachShadow({ mode: 'open' }).append(document.getElementById('tpl').content.cloneNode(true));</script></body>`;
    case 'slot':
      return `<!doctype html><title>app-slot</title>
<style>${base}${fill}</style>
<body><div id="app">${content}</div>
<template id="tpl"><style>#shell{position:fixed;inset:0;display:flex}#main{flex:1;min-width:0;overflow:auto;${snapType}}</style><div id="shell">${nav}<div id="main"><slot></slot></div></div></template>
<script>document.getElementById('app').attachShadow({ mode: 'open' }).append(document.getElementById('tpl').content.cloneNode(true));</script></body>`;
    case 'doc':
      return `<!doctype html><title>app-doc</title>
<style>${base}${modal ? 'body{overflow:hidden}' : ''}#top{height:10vh;background:${css(PALETTE.header)}}#main{height:60vh;overflow:auto}#foot{height:40vh;background:${css(PALETTE.block)}}
#modal{position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.5)}#dialog{width:300px;height:200px;background:#fff}</style>
<body><div id="top"></div><div id="main">${content}</div><div id="foot"></div>${modal ? '<div id="modal"><div id="dialog"></div></div>' : ''}</body>`;
    case 'fixedside':
      return `<!doctype html><title>app-fixedside</title>
<style>${base}#nav{position:fixed;left:0;top:0;bottom:0;width:200px;background:${css(PALETTE.header)}}#content{margin-left:200px}</style>
<body><nav id="nav"></nav>${content}</body>`;
    default:
      return `<!doctype html><title>app</title>
<style>${base}${fill}#top{height:60px;background:${css(PALETTE.header)}}
#main{position:absolute;top:60px;left:0;right:0;bottom:0;overflow:auto;${snapType}${scale === 'self' ? scaled : ''}}
${scale === 'body' ? `body{${scaled}}` : ''}</style>
<body><div id="top"></div><div id="main">${content}</div></body>`;
  }
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
  if (url.pathname === '/app') {
    return route.fulfill({ contentType: 'text/html', body: appPage(url.searchParams) });
  }
  const title = url.searchParams.get('title') ?? 'site';
  return route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>${title}</title><body style="margin:0;background:#0a7"><h1>${title}</h1></body>`,
  });
}
