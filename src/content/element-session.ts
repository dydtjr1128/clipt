import { h, render } from 'preact';
import { current, moveSibling, selectionOf, withDepth, type Selection } from '@/core/element-path';
import { domTree, labelOf, sizeOf } from './dom-tree';
import { startElementPicker } from './element-picker';
import { el } from './overlay/host';
import { SelectionPanel } from './panel/SelectionPanel';
import type { RegionTarget } from './region-selector';

/**
 * 요소 선택 전체 흐름: 호버·고정(element-picker) + 선택 패널 + 키보드 조정 (docs/ux-design.md 5절).
 * 확정하면 오버레이를 지우고 대상 범위와 선택자 경로를 넘긴다.
 */
export interface ElementSessionOptions {
  forRecording: boolean;
  onConfirm: (target: RegionTarget, selector: string) => void;
  onCancel: () => void;
}

const MARGIN = 16;
const DEFAULT_PANEL = { w: 360, h: 280 };

function intersects(a: DOMRect, b: { left: number; top: number; w: number; h: number }): boolean {
  return a.left < b.left + b.w && a.right > b.left && a.top < b.top + b.h && a.bottom > b.top;
}

/** 요소를 가리지 않는 모서리를 오른쪽 아래부터 고른다 */
export function placePanel(
  target: DOMRect,
  panel: { w: number; h: number },
  viewport: { w: number; h: number },
): { left: number; top: number } {
  const right = viewport.w - panel.w - MARGIN;
  const bottom = viewport.h - panel.h - MARGIN;
  const candidates = [
    { left: right, top: bottom },
    { left: MARGIN, top: bottom },
    { left: right, top: MARGIN },
    { left: MARGIN, top: MARGIN },
  ];
  const free = candidates.find((c) => !intersects(target, { ...c, ...panel }));
  const chosen = free ?? candidates[0]!;
  return { left: Math.max(MARGIN, chosen.left), top: Math.max(MARGIN, chosen.top) };
}

function clampPosition(
  pos: { left: number; top: number },
  panel: { w: number; h: number },
): { left: number; top: number } {
  return {
    left: Math.min(Math.max(8, pos.left), Math.max(8, innerWidth - panel.w - 8)),
    top: Math.min(Math.max(8, pos.top), Math.max(8, innerHeight - panel.h - 8)),
  };
}

/** 확정 대상: x는 뷰포트, y는 문서 기준. 가로는 화면 안으로 자른다(스티칭은 세로만) */
export function targetOf(element: Element): RegionTarget {
  const r = element.getBoundingClientRect();
  const left = Math.max(0, r.left);
  const right = Math.min(innerWidth, r.right);
  const top = Math.max(0, r.top + scrollY);
  const bottom = r.bottom + scrollY;
  return {
    x: left,
    y: top,
    w: Math.max(1, Math.round(right - left)),
    h: Math.max(1, Math.round(bottom - top)),
  };
}

export function startElementSession(options: ElementSessionOptions): () => void {
  let selection: Selection<Element> | null = null;
  let position: { left: number; top: number } | null = null;
  let userMoved = false;
  let disposed = false;

  const picker = startElementPicker({
    forRecording: options.forRecording,
    onLock: (target) => {
      selection = selectionOf(target, document.body, domTree);
      addEventListener('keydown', onKey, true);
      update();
    },
    onUnlock: () => closePanel(),
    onCancel: () => {
      finish();
      options.onCancel();
    },
  });

  const panelRoot = el('div', 'panel-root');
  const preview = el('div', 'preview-box', { hidden: '' });
  picker.overlay.layer.append(preview, panelRoot);

  function panelSize(): { w: number; h: number } {
    const node = panelRoot.firstElementChild as HTMLElement | null;
    return node ? { w: node.offsetWidth, h: node.offsetHeight } : DEFAULT_PANEL;
  }

  function showPreview(depth: number | null): void {
    const node = depth === null || !selection ? null : selection.path[depth];
    if (!node) {
      preview.hidden = true;
      return;
    }
    const r = node.getBoundingClientRect();
    preview.hidden = false;
    Object.assign(preview.style, {
      transform: `translate(${r.left}px, ${r.top}px)`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }

  function update(): void {
    if (!selection || disposed) return;
    const target = current(selection);
    picker.lock(target);
    if (!userMoved || !position) {
      position = placePanel(target.getBoundingClientRect(), panelSize(), {
        w: innerWidth,
        h: innerHeight,
      });
    }
    position = clampPosition(position, panelSize());
    renderPanel(target);
  }

  function renderPanel(target: Element): void {
    if (!selection || !position) return;
    const sel = selection;
    render(
      h(SelectionPanel, {
        forRecording: options.forRecording,
        path: sel.path.map((node) => ({ label: labelOf(node) })),
        depth: sel.depth,
        info: {
          tag: target.localName,
          id: target.id,
          classes: [...target.classList].slice(0, 6),
          size: sizeOf(target),
        },
        position,
        onDepth: (depth) => setSelection(withDepth(sel, depth)),
        onPreview: showPreview,
        onConfirm: confirm,
        onReselect: () => {
          picker.unlock();
          closePanel();
        },
        onCancel: () => {
          finish();
          options.onCancel();
        },
        onDragStart: startDrag,
      }),
      panelRoot,
    );
  }

  function setSelection(next: Selection<Element>): void {
    selection = next;
    showPreview(null);
    update();
  }

  function closePanel(): void {
    selection = null;
    removeEventListener('keydown', onKey, true);
    render(null, panelRoot);
    preview.hidden = true;
  }

  function startDrag(event: PointerEvent): void {
    if (event.button !== 0 || !position) return;
    const header = event.currentTarget as HTMLElement;
    const start = { x: event.clientX, y: event.clientY, ...position };
    // 포인터를 헤더에 붙잡아 이동·놓기 이벤트가 오버레이 안에서 오게 한다(페이지 클릭 차단과 무관)
    header.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      userMoved = true;
      position = clampPosition(
        { left: start.left + e.clientX - start.x, top: start.top + e.clientY - start.y },
        panelSize(),
      );
      if (selection) renderPanel(current(selection));
    };
    const up = () => {
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', up);
      header.removeEventListener('pointercancel', up);
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
    header.addEventListener('pointercancel', up);
    event.preventDefault();
  }

  function onKey(event: KeyboardEvent): void {
    if (!selection) return;
    const origin = event.composedPath()[0];
    let next: Selection<Element>;
    switch (event.key) {
      case 'ArrowUp':
        next = withDepth(selection, selection.depth - 1);
        break;
      case 'ArrowDown':
        next = withDepth(selection, selection.depth + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        next = moveSibling(selection, event.key === 'ArrowLeft' ? -1 : 1, document.body, domTree);
        break;
      case 'Enter':
        // 다른 버튼에 포커스가 있으면 그 버튼의 기본 동작(클릭)을 따른다
        if (origin instanceof HTMLButtonElement && !origin.classList.contains('panel-confirm')) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        confirm();
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    setSelection(next);
  }

  function confirm(): void {
    if (!selection || disposed) return;
    const target = current(selection);
    const measured = targetOf(target);
    const selector = selection.path
      .slice(0, selection.depth + 1)
      .map((node) => labelOf(node))
      .join(' > ');
    finish();
    options.onConfirm(measured, selector);
  }

  const onResize = () => update();
  addEventListener('resize', onResize);

  function finish(): void {
    if (disposed) return;
    disposed = true;
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    render(null, panelRoot);
    picker.dispose();
  }

  return finish;
}
