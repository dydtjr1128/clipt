/**
 * 캡처를 위한 페이지 측정·임시 변경·복원 (docs/architecture.md 8.1절).
 * 바꾼 인라인 스타일과 스크롤 위치를 모두 기억했다가 restore에서 그대로 되돌린다.
 */

import type { PageProbe } from '@/core/page';

export type { PageProbe };

interface SavedStyle {
  value: string;
  priority: string;
  /** 원래 style 속성이 있었는지. 없었다면 복원 후 빈 style 속성도 지운다 */
  hadAttr: boolean;
}

function saveStyle(el: HTMLElement, prop: string): SavedStyle {
  return {
    value: el.style.getPropertyValue(prop),
    priority: el.style.getPropertyPriority(prop),
    hadAttr: el.hasAttribute('style'),
  };
}

function restoreStyle(el: HTMLElement, prop: string, saved: SavedStyle): void {
  if (saved.value) el.style.setProperty(prop, saved.value, saved.priority);
  else el.style.removeProperty(prop);
  if (!saved.hadAttr && el.getAttribute('style') === '') el.removeAttribute('style');
}

const SCROLLBAR_CLASS = 'clipt-hide-scrollbar';

let savedScroll: { x: number; y: number } | null = null;
const hiddenFixed = new Map<HTMLElement, SavedStyle>();
let savedScrollBehavior: SavedStyle | null = null;
let scrollbarStyle: HTMLStyleElement | null = null;

function scrollingElement(): Element {
  return document.scrollingElement ?? document.documentElement;
}

function hasInnerScroller(): boolean {
  const root = scrollingElement();
  if (root.scrollHeight > innerHeight + 1) return false;
  for (const el of document.body?.querySelectorAll<HTMLElement>('*') ?? []) {
    if (el.clientHeight < innerHeight * 0.5) continue;
    if (el.scrollHeight <= el.clientHeight + 50) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return true;
  }
  return false;
}

export function probe(): PageProbe {
  const root = scrollingElement();
  return {
    viewport: { w: innerWidth, h: innerHeight },
    dpr: devicePixelRatio,
    scroll: { x: scrollX, y: scrollY },
    scrollSize: { w: root.scrollWidth, h: root.scrollHeight },
    innerScroller: hasInnerScroller(),
  };
}

/** 캡처를 위해 페이지를 바꿔 둔 상태인지 (Esc로 중단할 수 있는 구간) */
export function isCapturing(): boolean {
  return savedScroll !== null;
}

/** 캡처 시작 전: 현재 스크롤 위치를 기억하고, 부드러운 스크롤과 스크롤바를 끈다 */
export function prepare(options: { hideScrollbar: boolean }): void {
  if (!savedScroll) savedScroll = { x: scrollX, y: scrollY };
  const html = document.documentElement;
  if (!savedScrollBehavior) {
    savedScrollBehavior = saveStyle(html, 'scroll-behavior');
    html.style.setProperty('scroll-behavior', 'auto', 'important');
  }
  if (options.hideScrollbar && !scrollbarStyle) {
    scrollbarStyle = document.createElement('style');
    scrollbarStyle.textContent =
      `html.${SCROLLBAR_CLASS}{scrollbar-width:none!important}` +
      `html.${SCROLLBAR_CLASS}::-webkit-scrollbar{display:none!important}`;
    document.head.append(scrollbarStyle);
    html.classList.add(SCROLLBAR_CLASS);
  }
}

/**
 * position: fixed·sticky 요소를 숨긴다(레이아웃은 유지). 첫 조각 이후 호출해
 * 고정 헤더가 조각마다 반복되지 않게 한다. keep 안에 있거나 keep을 감싸는 요소는 숨기지 않는다.
 */
export function hideFixed(keep?: Element | null): number {
  for (const el of document.body?.querySelectorAll<HTMLElement>('*') ?? []) {
    if (hiddenFixed.has(el)) continue;
    const position = getComputedStyle(el).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    if (keep && (el.contains(keep) || keep.contains(el))) continue;
    if (el.localName === 'clipt-overlay') continue;
    hiddenFixed.set(el, saveStyle(el, 'visibility'));
    el.style.setProperty('visibility', 'hidden', 'important');
  }
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

/** 스크롤 후 렌더가 안정되면 실제 스크롤 위치를 돌려준다(브라우저가 값을 보정할 수 있다) */
export async function scrollToY(y: number, lazyWaitMs: number): Promise<number> {
  window.scrollTo({ left: scrollX, top: y, behavior: 'instant' });
  await settleFrames();
  await waitForImages(lazyWaitMs);
  await settleFrames();
  return scrollY;
}

/** 캡처가 끝나거나 취소되면 바꾼 것을 모두 되돌린다 */
export function restore(): void {
  for (const [el, saved] of hiddenFixed) restoreStyle(el, 'visibility', saved);
  hiddenFixed.clear();
  const html = document.documentElement;
  if (scrollbarStyle) {
    html.classList.remove(SCROLLBAR_CLASS);
    if (html.getAttribute('class') === '') html.removeAttribute('class');
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
