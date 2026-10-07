import { deepElementFromPoint, eachElement, encloses, layoutParent, overflowOf } from './dom-tree';

/**
 * 문서 대신 스크롤하며 이어 붙일 영역(스크롤 상자) 찾기 (docs/architecture.md 8.1절).
 * 앱형 페이지는 문서가 아니라 안쪽 상자(body 포함)가 스크롤되므로 그 상자를 스크롤해야 전체 내용을 담는다.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function scrollingElement(): Element {
  return document.scrollingElement ?? document.documentElement;
}

/** 테두리·스크롤바를 뺀 안쪽 상자 (뷰포트 CSS px) */
export function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + el.clientLeft,
    y: r.top + el.clientTop,
    w: el.clientWidth,
    h: el.clientHeight,
  };
}

/** 사용자가 세로로 스크롤할 수 있는 상자인지. 문서 스크롤은 창 스크롤로 다룬다 */
function scrollsY(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el === scrollingElement()) return false;
  if (el === document.documentElement || el.scrollHeight <= el.clientHeight + 1) return false;
  const overflow = overflowOf(el).y;
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
}

/** 상자가 문서 스크롤이 아닌 overflow 조상에 세로로 가려 있는지 */
function clippedY(el: Element, box: Box): boolean {
  const root = scrollingElement();
  for (
    let node = layoutParent(el);
    node && node !== document.documentElement && node !== root;
    node = layoutParent(node)
  ) {
    if (overflowOf(node).y === 'visible') continue;
    const outer = boxOf(node);
    if (box.y < outer.y - 1 || box.y + box.h > outer.y + outer.h + 1) return true;
  }
  return false;
}

/**
 * 화면에 그려진 크기가 레이아웃 크기와 다른지(영역이나 조상의 transform: scale 등). 그러면 화면 좌표와
 * 스크롤 위치·크기의 배율이 달라 영역을 스크롤하며 자를 수 없다
 */
function transformed(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return Math.abs(r.width - el.offsetWidth) > 1 || Math.abs(r.height - el.offsetHeight) > 1;
}

/**
 * 창을 스크롤하면 영역 전체가 화면에 들어와 이어 붙일 수 있는지. 화면보다 크거나, 다른 영역에 가려 있거나,
 * 확대·축소돼 그려지면 다 담을 수 없다
 */
function fitsViewport(area: HTMLElement): boolean {
  const box = boxOf(area);
  return box.h >= 1 && box.h <= innerHeight && !clippedY(area, box) && !transformed(area);
}

/** 요소를 세로로 가린 가장 가까운 overflow 조상. 가리는 조상이 없으면 null */
function nearestClipperY(el: Element): Element | null {
  const r = el.getBoundingClientRect();
  const root = scrollingElement();
  for (
    let node = layoutParent(el);
    node && node !== document.documentElement && node !== root;
    node = layoutParent(node)
  ) {
    if (overflowOf(node).y === 'visible') continue;
    const box = boxOf(node);
    if (r.top < box.y - 0.5 || r.bottom > box.y + box.h + 0.5) return node;
  }
  return null;
}

/**
 * 요소 캡처에서 문서 대신 스크롤할 영역: 스크롤되는 요소 자신, 아니면 요소를 세로로 가린 가장 가까운 조상이
 * 스크롤되는 상자일 때. overflow: hidden처럼 스크롤로 펼칠 수 없게 가렸거나 영역을 화면에 다 보일 수 없으면
 * null이고, 그때는 보이는 부분만 담는다
 */
export function scrollAreaOf(el: Element): HTMLElement | null {
  const area = scrollsY(el) ? el : nearestClipperY(el);
  return area && scrollsY(area) && fitsViewport(area) ? area : null;
}

/** 페이지가 문서 스크롤을 막아 둔 앱 화면인지. 뷰포트 overflow는 html, html이 visible이면 body에서 온다 */
function documentLocked(): boolean {
  const root = getComputedStyle(document.documentElement);
  const propagated = root.overflowX === 'visible' && root.overflowY === 'visible';
  const overflow =
    propagated && document.body ? getComputedStyle(document.body).overflowY : root.overflowY;
  return overflow === 'hidden' || overflow === 'clip';
}

/**
 * 앱 화면에서 안쪽으로 스크롤되며 문서보다 많이 넘치는 큰 상자(화면 높이의 절반 이상). body와 열린 Shadow DOM
 * 안도 찾는다. 앱 화면은 문서가 스크롤되지 않거나(기본 여백 정도는 허용), 문서 스크롤을 막아 두고 넘친 높이가
 * 뷰포트의 1/4 미만인 페이지다. 짧은 일반 문서 안의 큰 스크롤 상자는 고르지 않아 문서를 그대로 이어 붙인다
 */
export function innerScrollers(): HTMLElement[] {
  const docOverflow = scrollingElement().scrollHeight - innerHeight;
  const app = docOverflow <= 24 || (documentLocked() && docOverflow < innerHeight / 4);
  if (!app || !document.body) return [];
  const found: HTMLElement[] = [];
  eachElement(document.body, (el) => {
    if (el.clientHeight < innerHeight * 0.5) return;
    if (el.scrollHeight - el.clientHeight <= Math.max(50, docOverflow)) return;
    if (scrollsY(el) && getComputedStyle(el).visibility !== 'hidden') found.push(el);
  });
  return found;
}

/** 가림을 잴 표본 위치(안쪽 상자의 비율). 가장자리까지 고르게 퍼뜨려 가운데 부유 패널과 전체 덮개를 구분한다 */
const SAMPLES = [0.1, 0.3, 0.5, 0.7, 0.9];

/**
 * 영역이 모달·덮개 같은 다른 요소에 가리지 않고 맨 위에 보이는지. 안쪽 상자의 화면 안 부분에 고르게 퍼진
 * 25개 지점 중 절반 이상에서 맨 위 요소가 영역 안에 있으면 보인다고 본다(작은 부유 패널·토스트는 통과)
 */
function onTop(area: HTMLElement): boolean {
  const box = boxOf(area);
  const top = Math.max(0, box.y);
  const bottom = Math.min(innerHeight, box.y + box.h);
  const left = Math.max(0, box.x);
  const right = Math.min(innerWidth, box.x + box.w);
  if (bottom <= top || right <= left) return false;
  let inside = 0;
  for (const fy of SAMPLES) {
    for (const fx of SAMPLES) {
      const hit = deepElementFromPoint(left + (right - left) * fx, top + (bottom - top) * fy);
      if (hit !== null && encloses(area, hit)) inside += 1;
    }
  }
  return inside * 2 >= SAMPLES.length ** 2;
}

/**
 * 전체 페이지 캡처에서 문서 대신 스크롤할 영역: 안쪽 스크롤 상자 중 가장 넓은 것. 왼쪽 메뉴와 오른쪽 본문이
 * 따로 스크롤되면 넓은 본문을 고른다. 가장 넓은 상자를 이어 붙일 수 없거나(화면에 다 보일 수 없음, 확대·축소)
 * 모달 등에 가려 있으면 더 작은 상자(메뉴 등)로 바꾸지 않고 null이다(문서를 이어 붙인다)
 */
export function mainScrollArea(): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestSize = 0;
  for (const el of innerScrollers()) {
    const size = el.clientWidth * el.clientHeight;
    if (size > bestSize) {
      best = el;
      bestSize = size;
    }
  }
  return best && fitsViewport(best) && onTop(best) ? best : null;
}
