import { t } from '@/shared/i18n';
import { deepElementFromPoint, labelOf, sizeOf } from './dom-tree';
import { createOverlay, el, fromOverlay, type Overlay } from './overlay/host';

/**
 * 요소 선택 1·2단계: 호버 하이라이트와 클릭 고정 (docs/ux-design.md 5.1·5.2절).
 * 선택 중 페이지 클릭·링크 이동은 막고, 오버레이(패널) 안의 조작만 통과시킨다.
 * 3단계 선택 패널과 키보드 조정은 onLock 이후 호출자가 붙인다(#9).
 */
export interface PickerOptions {
  forRecording: boolean;
  /** 클릭으로 요소가 고정됨 */
  onLock: (target: Element) => void;
  /** 고정 해제(다시 선택·Esc) */
  onUnlock: () => void;
  /** 호버 단계에서 Esc: 선택 종료 */
  onCancel: () => void;
}

export interface Picker {
  overlay: Overlay;
  /** 고정된 요소. 호버 단계면 null */
  readonly locked: Element | null;
  /** 고정 상태에서 대상을 바꾼다(패널·키보드 조정) */
  lock(target: Element): void;
  unlock(): void;
  dispose(): void;
}

const BLOCKED_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'touchstart',
  'touchend',
] as const;

export function startElementPicker(options: PickerOptions): Picker {
  const overlay = createOverlay('picker');
  const box = el('div', 'hl-box', { hidden: '' });
  for (const corner of ['tl', 'tr', 'bl', 'br']) box.append(el('i', `corner corner-${corner}`));
  const label = el('div', 'hl-label', { hidden: '' });
  const labelName = el('span', 'hl-name');
  const labelSize = el('span', 'hl-size');
  label.append(labelName, labelSize);
  const toast = el('div', 'toast', { role: 'status' });
  const toastKeys = el('span', 'keys');
  toastKeys.textContent = '↑↓ · Esc';
  toast.append(t(options.forRecording ? 'hintPickElementRec' : 'hintPickElement'), toastKeys);
  overlay.layer.append(box, label, toast);
  const html = document.documentElement;
  const savedCursor = {
    value: html.style.getPropertyValue('cursor'),
    priority: html.style.getPropertyPriority('cursor'),
    hadAttr: html.hasAttribute('style'),
  };
  html.style.setProperty('cursor', 'crosshair');

  let hovered: Element | null = null;
  let locked: Element | null = null;
  let pointer = { x: -1, y: -1 };
  let raf = 0;
  let disposed = false;

  function render(): void {
    const target = locked ?? hovered;
    if (!target || !target.isConnected) {
      box.hidden = label.hidden = true;
      return;
    }
    const r = target.getBoundingClientRect();
    box.hidden = label.hidden = false;
    box.classList.toggle('is-locked', locked !== null);
    label.classList.toggle('is-locked', locked !== null);
    Object.assign(box.style, {
      transform: `translate(${r.left}px, ${r.top}px)`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    labelName.textContent = labelOf(target);
    labelSize.textContent = sizeOf(target);
    // 라벨: 박스 위 바깥 → 공간이 없으면 아래 → 그래도 없으면 안쪽 위
    const labelH = 22;
    const labelW = label.offsetWidth || 120;
    let top = r.top - labelH - 4;
    if (top < 2) top = r.bottom + 4;
    if (top + labelH > innerHeight - 2) top = Math.max(2, r.top + 4);
    const left = Math.min(Math.max(2, r.left), innerWidth - labelW - 2);
    label.style.transform = `translate(${left}px, ${top}px)`;
  }

  function schedule(): void {
    if (raf || disposed) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!locked && pointer.x >= 0) hovered = deepElementFromPoint(pointer.x, pointer.y);
      render();
    });
  }

  function onMove(event: PointerEvent): void {
    if (fromOverlay(event, overlay)) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (event.clientY < 60) toast.classList.remove('is-hidden');
    if (!locked) schedule();
  }

  function onBlocked(event: Event): void {
    if (disposed || fromOverlay(event, overlay)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click' || locked) return;
    const click = event as MouseEvent;
    if (click.button !== 0) return;
    const target = deepElementFromPoint(click.clientX, click.clientY) ?? hovered;
    if (target) api.lock(target);
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (locked) {
      api.unlock();
      options.onUnlock();
    } else {
      api.dispose();
      options.onCancel();
    }
  }

  const onViewportChange = () => schedule();
  const toastTimer = setTimeout(() => toast.classList.add('is-hidden'), 3000);
  addEventListener('pointermove', onMove, { capture: true, passive: true });
  for (const type of BLOCKED_EVENTS) addEventListener(type, onBlocked, true);
  addEventListener('keydown', onKey, true);
  addEventListener('scroll', onViewportChange, true);
  addEventListener('resize', onViewportChange);

  const api: Picker = {
    overlay,
    get locked() {
      return locked;
    },
    lock(target) {
      const first = locked === null;
      locked = target;
      hovered = null;
      render();
      if (first) {
        box.classList.remove('is-pulse');
        void box.offsetWidth; // 애니메이션 재시작
        box.classList.add('is-pulse');
        options.onLock(target);
      }
    },
    unlock() {
      locked = null;
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(toastTimer);
      removeEventListener('pointermove', onMove, { capture: true });
      for (const type of BLOCKED_EVENTS) removeEventListener(type, onBlocked, true);
      removeEventListener('keydown', onKey, true);
      removeEventListener('scroll', onViewportChange, true);
      removeEventListener('resize', onViewportChange);
      if (savedCursor.value)
        html.style.setProperty('cursor', savedCursor.value, savedCursor.priority);
      else html.style.removeProperty('cursor');
      if (!savedCursor.hadAttr && html.getAttribute('style') === '') html.removeAttribute('style');
      overlay.dispose();
    },
  };
  return api;
}
