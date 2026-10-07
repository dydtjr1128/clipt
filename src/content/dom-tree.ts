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
  siblings(el) {
    if (el.parentElement) return [...el.parentElement.children];
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? [...root.children] : [el];
  },
  selectable: isSelectable,
};

/**
 * 화면 배치(평탄 트리) 기준 부모. slot에 배치된 요소는 그 slot, Shadow root 최상위 요소는 host다.
 * 잘림·스크롤 조상과 고정 요소를 따질 때 쓴다(요소 경로는 domTree.parent)
 */
export function layoutParent(el: Element): Element | null {
  return el.assignedSlot ?? domTree.parent(el);
}

/** 화면 배치에서 a가 b 자신이거나 b를 감싸는지. slot과 Shadow 경계를 넘어 올라가며 확인한다 */
export function encloses(a: Element, b: Element): boolean {
  for (let node: Element | null = b; node; node = layoutParent(node)) {
    if (node === a) return true;
  }
  return false;
}

/** root와 그 아래 모든 요소를 방문한다. 열린 Shadow DOM 안까지 내려가고 오버레이는 건너뛴다 */
export function eachElement(root: Element, visit: (el: Element) => void): void {
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const el = stack.pop()!;
    if (isOverlay(el)) continue;
    visit(el);
    for (const child of el.children) stack.push(child);
    if (el.shadowRoot) for (const child of el.shadowRoot.children) stack.push(child);
  }
}

/**
 * 요소 자신의 overflow. html이 양쪽 모두 visible이면 body의 overflow는 뷰포트로 전파되어
 * body 자신은 자르지도 스크롤하지도 않는다
 */
export function overflowOf(el: Element): { x: string; y: string } {
  if (el === document.body) {
    const root = getComputedStyle(document.documentElement);
    if (root.overflowX === 'visible' && root.overflowY === 'visible') {
      return { x: 'visible', y: 'visible' };
    }
  }
  const style = getComputedStyle(el);
  return { x: style.overflowX, y: style.overflowY };
}

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
 * 요소에서 실제로 보이는 사각형(뷰포트 CSS px). overflow로 잘라내는 조상(스스로 스크롤되는 body 포함)과
 * 겹친 부분만 남긴다. 문서 자체 스크롤은 스티칭으로 담으므로 여기서는 자르지 않는다.
 */
export function visibleRectOf(el: Element): { rect: DOMRect; clipped: boolean } {
  const r = el.getBoundingClientRect();
  let left = r.left;
  let top = r.top;
  let right = r.right;
  let bottom = r.bottom;
  const scroller = document.scrollingElement ?? document.documentElement;
  for (
    let node = layoutParent(el);
    node && node !== document.documentElement;
    node = layoutParent(node)
  ) {
    if (node === scroller) break;
    const overflow = overflowOf(node);
    const clipsX = overflow.x !== 'visible';
    const clipsY = overflow.y !== 'visible';
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
