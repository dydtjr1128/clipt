import { describe, type TreeAdapter } from '@/core/element-path';
import { HOST_TAG } from './overlay/host';

/**
 * DOM 트리 어댑터 (docs/architecture.md 8.2절).
 * 열린 Shadow DOM 안까지 내려가고, 부모는 Shadow 경계를 넘어 host로 올라간다.
 */
function isOverlay(el: Element): boolean {
  return el.localName === HOST_TAG;
}

export function isSelectable(el: Element): boolean {
  if (isOverlay(el) || el === document.documentElement) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'contents';
}

export const domTree: TreeAdapter<Element> = {
  parent(el) {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  },
  children(el) {
    return [...el.children];
  },
  selectable: isSelectable,
};

/** 좌표 아래의 가장 깊은 요소. 열린 Shadow root 안으로 반복해서 내려간다 */
export function deepElementFromPoint(x: number, y: number): Element | null {
  let el = document.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  if (el && isOverlay(el)) return null;
  // 크기가 없는 요소면 선택 가능한 조상으로 올라간다
  while (el && !isSelectable(el)) el = domTree.parent(el);
  return el;
}

export function labelOf(el: Element): string {
  return describe({
    tag: el.localName,
    id: el.id || undefined,
    classes: [...el.classList],
  });
}

export function sizeOf(el: Element): string {
  const r = el.getBoundingClientRect();
  return `${Math.round(r.width)}×${Math.round(r.height)}`;
}

/**
 * 요소에서 실제로 보이는 사각형(뷰포트 CSS px). overflow로 잘라내는 조상과 겹친 부분만 남긴다.
 * 문서 자체 스크롤은 스티칭으로 담으므로 여기서는 자르지 않는다.
 */
export function visibleRectOf(el: Element): { rect: DOMRect; clipped: boolean } {
  const r = el.getBoundingClientRect();
  let left = r.left;
  let top = r.top;
  let right = r.right;
  let bottom = r.bottom;
  const scroller = document.scrollingElement ?? document.documentElement;
  for (let node = domTree.parent(el); node && node !== document.body; node = domTree.parent(node)) {
    if (node === scroller) break;
    const style = getComputedStyle(node);
    const clipsX = style.overflowX !== 'visible';
    const clipsY = style.overflowY !== 'visible';
    if (!clipsX && !clipsY) continue;
    const c = node.getBoundingClientRect();
    // 테두리 안쪽(스크롤바 제외) 영역으로 자른다
    const innerLeft = c.left + node.clientLeft;
    const innerTop = c.top + node.clientTop;
    if (clipsX) {
      left = Math.max(left, innerLeft);
      right = Math.min(right, innerLeft + node.clientWidth);
    }
    if (clipsY) {
      top = Math.max(top, innerTop);
      bottom = Math.min(bottom, innerTop + node.clientHeight);
    }
  }
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const clipped =
    Math.round(width) < Math.round(r.width) || Math.round(height) < Math.round(r.height);
  return { rect: new DOMRect(left, top, width, height), clipped };
}
