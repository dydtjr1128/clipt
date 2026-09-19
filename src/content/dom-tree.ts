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
