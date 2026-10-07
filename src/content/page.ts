/**
 * 캡처를 위한 페이지 측정·임시 변경·복원 (docs/architecture.md 8.1절).
 * 바꾼 인라인 스타일과 스크롤 위치를 모두 기억했다가 restore에서 그대로 되돌린다.
 */

import type { AreaCapture, PageProbe, ScrollArea } from '@/core/page';
import { eachElement, encloses, visibleRectOf } from './dom-tree';
import { boxOf, innerScrollers, mainScrollArea, type Box } from './scroll-area';

export type { PageProbe };

interface SavedStyle {
  value: string;
  priority: string;
  /** 원래 style 속성이 있었는지. 없었다면 복원 후 빈 style 속성도 지운다 */
  hadAttr: boolean;
}

/** 인라인 스타일을 바꿀 수 있는 요소 */
type Styled = HTMLElement | SVGElement;

function saveStyle(el: Styled, prop: string): SavedStyle {
  return {
    value: el.style.getPropertyValue(prop),
    priority: el.style.getPropertyPriority(prop),
    hadAttr: el.hasAttribute('style'),
  };
}

function restoreStyle(el: Styled, prop: string, saved: SavedStyle): void {
  if (saved.value) el.style.setProperty(prop, saved.value, saved.priority);
  else el.style.removeProperty(prop);
  if (!saved.hadAttr && el.getAttribute('style') === '') el.removeAttribute('style');
}

const SCROLLBAR_CLASS = 'clipt-hide-scrollbar';
const SCROLLBAR_ATTR = 'data-clipt-hide-scrollbar';

let savedScroll: { x: number; y: number } | null = null;
/** 캡처 대상(요소 또는 스크롤 영역). 고정 요소를 숨길 때 이 요소를 감싼 요소는 남긴다 */
let captureTarget: Element | null = null;
/** 요소 캡처: 선택 확정 때 고른, 요소를 가린 스크롤 영역 */
let selectedArea: HTMLElement | null = null;
/** 문서 대신 스크롤하는 영역 (page:prepare에서 정함) */
let captureArea: HTMLElement | null = null;
let savedArea: {
  el: HTMLElement;
  top: number;
  left: number;
  snap: SavedStyle;
  scrollbar: boolean;
} | null = null;

export function setCaptureTarget(target: Element | null, area: HTMLElement | null = null): void {
  captureTarget = target;
  selectedArea = area;
}
const hiddenFixed = new Map<Styled, SavedStyle>();
let savedScrollBehavior: SavedStyle | null = null;
let scrollbarStyle: HTMLStyleElement | null = null;
let htmlScrollbarHidden = false;

function scrollingElement(): Element {
  return document.scrollingElement ?? document.documentElement;
}

function areaState(area: HTMLElement): ScrollArea {
  return { box: boxOf(area), scrollTop: area.scrollTop, scrollHeight: area.scrollHeight };
}

/** area를 주면 문서 대신 스크롤할 그 영역의 상태도 담는다 */
export function probe(area: HTMLElement | null = null): PageProbe {
  const root = scrollingElement();
  return {
    viewport: { w: innerWidth, h: innerHeight },
    dpr: devicePixelRatio,
    scroll: { x: scrollX, y: scrollY },
    scrollSize: { w: root.scrollWidth, h: root.scrollHeight },
    innerScroller: innerScrollers().length > 0,
    ...(area ? { area: areaState(area) } : {}),
  };
}

/** 전체 페이지 캡처 전 측정. 문서 대신 스크롤할 안쪽 영역이 있으면 함께 알린다 */
export function probeFullPage(): PageProbe {
  return probe(mainScrollArea());
}

/** 캡처를 위해 페이지를 바꿔 둔 상태인지 (Esc로 중단할 수 있는 구간) */
export function isCapturing(): boolean {
  return savedScroll !== null;
}

/** 문서(html 클래스)와 스크롤 영역(속성)의 스크롤바를 숨기는 규칙 */
function ensureScrollbarStyle(): void {
  if (scrollbarStyle) return;
  scrollbarStyle = document.createElement('style');
  scrollbarStyle.textContent =
    `html.${SCROLLBAR_CLASS},[${SCROLLBAR_ATTR}]{scrollbar-width:none!important}` +
    `html.${SCROLLBAR_CLASS}::-webkit-scrollbar,[${SCROLLBAR_ATTR}]::-webkit-scrollbar{display:none!important}`;
  document.head.append(scrollbarStyle);
}

/**
 * 캡처 시작 전: 현재 스크롤 위치를 기억하고, 부드러운 스크롤과 스크롤바를 끈다.
 * area면 문서 대신 그 스크롤 영역(main: 가장 큰 안쪽 영역, target: 선택한 요소를 가린 영역)을
 * 스크롤하도록 준비하고 상태를 돌려준다. 영역을 화면에 다 보일 수 없으면 null(문서를 스크롤한다)
 */
export function prepare(options: {
  hideScrollbar: boolean;
  area?: 'main' | 'target';
}): AreaCapture | null {
  if (!savedScroll) savedScroll = { x: scrollX, y: scrollY };
  const html = document.documentElement;
  if (!savedScrollBehavior) {
    savedScrollBehavior = saveStyle(html, 'scroll-behavior');
    html.style.setProperty('scroll-behavior', 'auto', 'important');
  }
  if (options.hideScrollbar && !htmlScrollbarHidden) {
    ensureScrollbarStyle();
    html.classList.add(SCROLLBAR_CLASS);
    htmlScrollbarHidden = true;
  }
  if (options.area === 'main') return prepareArea(mainScrollArea(), null);
  if (options.area === 'target') return prepareArea(selectedArea, captureTarget);
  return null;
}

function prepareArea(area: HTMLElement | null, target: Element | null): AreaCapture | null {
  if (!area?.isConnected) return null;
  // 영역이 화면 밖으로 일부 나가 있으면 창을 스크롤해 다 보이게 한다(원래 위치는 prepare가 기억)
  const before = { x: scrollX, y: scrollY };
  let box = boxOf(area);
  const shift = box.y < 0 ? box.y : Math.max(0, box.y + box.h - innerHeight);
  if (shift) {
    window.scrollBy({ top: shift, behavior: 'instant' });
    box = boxOf(area);
  }
  if (box.h < 1 || box.y < -1 || box.y + box.h > innerHeight + 1) {
    if (shift) window.scrollTo({ left: before.x, top: before.y, behavior: 'instant' });
    return null;
  }
  captureArea = area;
  captureTarget = target ?? area;
  if (!savedArea) {
    savedArea = {
      el: area,
      top: area.scrollTop,
      left: area.scrollLeft,
      snap: saveStyle(area, 'scroll-snap-type'),
      scrollbar: false,
    };
    // 스크롤 스냅이 요청한 위치를 다른 곳으로 끌어당기지 않게 끈다
    area.style.setProperty('scroll-snap-type', 'none', 'important');
    // 자리를 차지하지 않는(오버레이) 스크롤바는 스크롤할 때 내용 위에 떠서 찍히므로 숨긴다.
    // 자리를 차지하는 스크롤바는 안쪽 상자 밖이라 찍히지 않고, 숨기면 내용 너비가 바뀌므로 둔다
    const width = area.clientWidth;
    ensureScrollbarStyle();
    area.setAttribute(SCROLLBAR_ATTR, '');
    if (area.clientWidth === width) savedArea.scrollbar = true;
    else area.removeAttribute(SCROLLBAR_ATTR);
    box = boxOf(area);
  }
  return {
    box,
    scrollTop: area.scrollTop,
    scrollHeight: area.scrollHeight,
    target: areaTargetOf(target, area, box),
  };
}

/**
 * 영역 내용 기준 캡처 범위. 영역 자신(전체 페이지, 스크롤 영역을 고른 요소 캡처)이면 내용 전체,
 * 영역 안의 요소면 그 요소. 가로는 스크롤하지 않으므로 보이는 만큼만 담는다
 */
function areaTargetOf(target: Element | null, area: HTMLElement, box: Box): AreaCapture['target'] {
  if (!target || target === area) {
    const visible = visibleRectOf(area).rect;
    const left = Math.max(0, visible.left, box.x);
    const right = Math.min(innerWidth, visible.right, box.x + box.w);
    return { x: left, y: 0, w: Math.max(1, Math.round(right - left)), h: area.scrollHeight };
  }
  const visible = visibleRectOf(target).rect;
  const left = Math.max(0, visible.left);
  const right = Math.min(innerWidth, visible.right);
  const r = target.getBoundingClientRect();
  return {
    x: left,
    y: r.top - box.y + area.scrollTop,
    w: Math.max(1, Math.round(right - left)),
    h: Math.max(1, Math.round(r.height)),
  };
}

/**
 * position: fixed·sticky 요소를 숨긴다(레이아웃은 유지). 첫 조각 이후 호출해 고정 헤더가 조각마다
 * 반복되지 않게 한다. 캡처 대상을 감싼 요소는 숨기지 않는다. 대상 안의 요소는 keepDescendants일 때만
 * 남긴다(스크롤 영역을 스크롤하면 영역 안의 sticky 머리가 조각마다 반복되므로 두 번째 조각부터 숨긴다)
 */
export function hideFixed(keepDescendants = true): number {
  const keep = captureTarget;
  if (!document.body) return hiddenFixed.size;
  eachElement(document.body, (el) => {
    if (el === document.body) return;
    if (!(el instanceof HTMLElement || el instanceof SVGElement) || hiddenFixed.has(el)) return;
    const position = getComputedStyle(el).position;
    if (position !== 'fixed' && position !== 'sticky') return;
    if (keep && (encloses(el, keep) || (keepDescendants && encloses(keep, el)))) return;
    hiddenFixed.set(el, saveStyle(el, 'visibility'));
    el.style.setProperty('visibility', 'hidden', 'important');
  });
  return hiddenFixed.size;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** 두 프레임을 기다려 스크롤·스타일 변경이 화면에 반영되게 한다 */
export async function settleFrames(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

/** 뷰포트 안의 이미지가 로드·디코드될 때까지(최대 waitMs) 기다린다. 지연 로딩 대응 */
async function waitForImages(waitMs: number): Promise<void> {
  if (waitMs <= 0) return;
  const inView = [...document.images].filter((img) => {
    const r = img.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0;
  });
  const pending = inView
    .filter((img) => !img.complete || img.naturalWidth === 0)
    .map((img) =>
      img.decode().catch(
        () =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    );
  if (pending.length === 0) return;
  await Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, waitMs))]);
}

/**
 * 문서(준비한 스크롤 영역이 있으면 그 영역)를 스크롤하고 렌더가 안정되면 실제 스크롤 위치를 돌려준다
 * (브라우저가 값을 보정할 수 있다)
 */
export async function scrollToY(y: number, lazyWaitMs: number): Promise<number> {
  if (captureArea) captureArea.scrollTo({ top: y, behavior: 'instant' });
  else window.scrollTo({ left: scrollX, top: y, behavior: 'instant' });
  await settleFrames();
  await waitForImages(lazyWaitMs);
  await settleFrames();
  return captureArea ? captureArea.scrollTop : scrollY;
}

/** 캡처가 끝나거나 취소되면 바꾼 것을 모두 되돌린다 */
export function restore(): void {
  captureTarget = null;
  selectedArea = null;
  captureArea = null;
  for (const [el, saved] of hiddenFixed) restoreStyle(el, 'visibility', saved);
  hiddenFixed.clear();
  if (savedArea) {
    const { el, top, left, snap, scrollbar } = savedArea;
    el.scrollTo({ top, left, behavior: 'instant' });
    restoreStyle(el, 'scroll-snap-type', snap);
    if (scrollbar) el.removeAttribute(SCROLLBAR_ATTR);
    savedArea = null;
  }
  const html = document.documentElement;
  if (htmlScrollbarHidden) {
    html.classList.remove(SCROLLBAR_CLASS);
    if (html.getAttribute('class') === '') html.removeAttribute('class');
    htmlScrollbarHidden = false;
  }
  if (scrollbarStyle) {
    scrollbarStyle.remove();
    scrollbarStyle = null;
  }
  if (savedScroll) {
    window.scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: 'instant' });
    savedScroll = null;
  }
  if (savedScrollBehavior) {
    restoreStyle(html, 'scroll-behavior', savedScrollBehavior);
    savedScrollBehavior = null;
  }
}
