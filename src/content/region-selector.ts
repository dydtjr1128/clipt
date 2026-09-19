import {
  MIN_DRAG,
  boxFromPoints,
  clampBox,
  clampPoint,
  edgeScrollSpeed,
  resizeBox,
  type Box,
  type Handle,
  type Point,
} from '@/core/region';
import { t } from '@/shared/i18n';
import { createOverlay, el, type Overlay } from './overlay/host';

/**
 * 드래그 영역 선택 UI (docs/ux-design.md 6절).
 * 선택은 문서 좌표로 보관해 드래그 중 가장자리 자동 스크롤로 뷰포트 밖까지 넓힐 수 있다.
 * 가로는 현재 보이는 열 안으로 제한한다(스티칭은 세로만 이어 붙인다).
 */
export interface RegionTarget {
  /** 뷰포트 기준 x (CSS px) */
  x: number;
  /** 문서 기준 y (CSS px) */
  y: number;
  w: number;
  h: number;
}

export interface RegionOptions {
  forRecording: boolean;
  onConfirm: (target: RegionTarget, overlay: Overlay) => void;
  onCancel: () => void;
}

type Phase = 'idle' | 'drawing' | 'adjusting' | 'moving' | 'resizing';

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const TOAST_MS = 3000;

export function startRegionSelector(options: RegionOptions): () => void {
  const overlay = createOverlay('region');
  const { layer } = overlay;

  const catcher = el('div', 'catcher');
  const guideX = el('div', 'guide guide-x');
  const guideY = el('div', 'guide guide-y');
  const selection = el('div', 'selection', { hidden: '' });
  for (const handle of HANDLES) selection.append(el('div', 'handle', { 'data-handle': handle }));
  const size = el('div', 'size', { hidden: '' });
  const bar = el('div', 'bar', { hidden: '' });
  const confirmBtn = el('button', `btn ${options.forRecording ? 'btn-rec' : 'btn-primary'}`, {
    type: 'button',
    'data-action': 'confirm',
  });
  confirmBtn.append(
    options.forRecording ? '● ' : '',
    t(options.forRecording ? 'panelRecord' : 'panelCapture'),
    ' ',
    el('kbd'),
  );
  confirmBtn.querySelector('kbd')!.textContent = 'Enter';
  const cancelBtn = el('button', 'btn', { type: 'button', 'data-action': 'cancel' });
  cancelBtn.append(t('commonCancel'), ' ', el('kbd'));
  cancelBtn.querySelector('kbd')!.textContent = 'Esc';
  bar.append(confirmBtn, cancelBtn);
  const toast = el('div', 'toast', { role: 'status' });
  const toastKeys = el('span', 'keys');
  toastKeys.textContent = 'Enter · Esc';
  toast.append(t(options.forRecording ? 'hintDragRegionRec' : 'hintDragRegion'), toastKeys);
  layer.append(catcher, guideX, guideY, selection, size, bar, toast);

  let phase: Phase = 'idle';
  let box: Box | null = null;
  let start: Point = { x: 0, y: 0 };
  let grab: Point = { x: 0, y: 0 };
  let handle: Handle = 'se';
  let pointer = { clientX: innerWidth / 2, clientY: innerHeight / 2, shift: false };
  let spaceHeld = false;
  let raf = 0;
  let disposed = false;

  // 녹화는 보이는 화면만 담을 수 있어 현재 뷰포트 안으로 제한한다
  const bounds = (): Box =>
    options.forRecording
      ? { x: scrollX, y: scrollY, w: innerWidth, h: innerHeight }
      : {
          x: scrollX,
          y: 0,
          w: innerWidth,
          h: Math.max(document.documentElement.scrollHeight, innerHeight),
        };
  const docPoint = (): Point =>
    clampPoint({ x: pointer.clientX + scrollX, y: pointer.clientY + scrollY }, bounds());

  function render(): void {
    const idle = phase === 'idle';
    layer.classList.toggle('is-drawing', phase === 'drawing');
    guideX.hidden = guideY.hidden = !idle;
    guideX.style.top = `${pointer.clientY}px`;
    guideY.style.left = `${pointer.clientX}px`;
    if (!box) {
      selection.hidden = size.hidden = bar.hidden = true;
      return;
    }
    const left = box.x - scrollX;
    const top = box.y - scrollY;
    selection.hidden = size.hidden = false;
    Object.assign(selection.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${box.w}px`,
      height: `${box.h}px`,
    });
    size.textContent = `${Math.round(box.w)}×${Math.round(box.h)}`;
    const below = top + box.h + 8;
    size.style.left = `${Math.max(4, left)}px`;
    size.style.top = `${below + 28 < innerHeight ? below : Math.max(4, top - 26)}px`;

    bar.hidden = phase === 'drawing';
    if (!bar.hidden) {
      const barH = 40;
      const barW = bar.offsetWidth || 220;
      let barTop = top + box.h + 36;
      if (barTop + barH > innerHeight) barTop = top - barH - 8;
      if (barTop < 4) barTop = Math.min(innerHeight - barH - 8, top + box.h - barH - 8);
      bar.style.top = `${Math.max(4, barTop)}px`;
      bar.style.left = `${Math.min(Math.max(4, left + box.w - barW), innerWidth - barW - 4)}px`;
    }
  }

  function update(): void {
    const p = docPoint();
    if (phase === 'drawing') {
      box = boxFromPoints(start, p, pointer.shift);
    } else if (phase === 'moving' && box) {
      box = clampBox({ ...box, x: p.x - grab.x, y: p.y - grab.y }, bounds());
    } else if (phase === 'resizing' && box) {
      box = clampBox(resizeBox(box, handle, p, pointer.shift), bounds());
    }
    render();
  }

  /** 드래그 중 포인터가 가장자리에 있으면 계속 스크롤한다 */
  function autoScroll(): void {
    raf = 0;
    if (disposed || options.forRecording || !['drawing', 'moving', 'resizing'].includes(phase))
      return;
    const speed = edgeScrollSpeed(pointer.clientY, innerHeight);
    if (speed !== 0) {
      scrollBy({ top: speed, behavior: 'instant' });
      update();
    }
    raf = requestAnimationFrame(autoScroll);
  }

  function beginDrag(next: Phase, event: PointerEvent): void {
    phase = next;
    pointer = { clientX: event.clientX, clientY: event.clientY, shift: event.shiftKey };
    (event.target as Element).setPointerCapture?.(event.pointerId);
    if (!raf) raf = requestAnimationFrame(autoScroll);
    event.preventDefault();
    event.stopPropagation();
  }

  catcher.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    beginDrag('drawing', event);
    start = docPoint();
    box = { x: start.x, y: start.y, w: 0, h: 0 };
    toast.classList.add('is-hidden');
    render();
  });

  selection.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !box || phase !== 'adjusting') return;
    const target = event.target as HTMLElement;
    if (target.dataset.handle) {
      handle = target.dataset.handle as Handle;
      beginDrag('resizing', event);
    } else {
      beginDrag('moving', event);
      const p = docPoint();
      grab = { x: p.x - box.x, y: p.y - box.y };
    }
  });

  let lastPointer: Point | null = null;
  overlay.root.addEventListener('pointermove', (event) => {
    const e = event as PointerEvent;
    const prev = lastPointer;
    lastPointer = { x: e.clientX, y: e.clientY };
    pointer = { clientX: e.clientX, clientY: e.clientY, shift: e.shiftKey };
    if (phase === 'idle' && e.clientY < 60) toast.classList.remove('is-hidden');
    if (phase === 'drawing' && spaceHeld && prev) {
      // Space를 누른 채 끌면 시작점도 같이 옮겨 크기를 유지한 채 이동한다
      start = { x: start.x + (e.clientX - prev.x), y: start.y + (e.clientY - prev.y) };
    }
    update();
  });

  overlay.root.addEventListener('pointerup', () => {
    if (phase === 'drawing') {
      if (!box || box.w < MIN_DRAG || box.h < MIN_DRAG) {
        box = null;
        phase = 'idle';
      } else {
        phase = 'adjusting';
      }
    } else if (phase === 'moving' || phase === 'resizing') {
      phase = 'adjusting';
    }
    render();
    if (phase === 'adjusting') confirmBtn.focus({ preventScroll: true });
  });

  layer.addEventListener('contextmenu', (event) => event.preventDefault());

  confirmBtn.addEventListener('click', () => confirm());
  cancelBtn.addEventListener('click', () => cancel());

  function confirm(): void {
    if (!box || disposed) return;
    const target: RegionTarget = {
      x: box.x - scrollX,
      y: box.y,
      w: Math.round(box.w),
      h: Math.round(box.h),
    };
    teardown();
    options.onConfirm(target, overlay);
  }

  function cancel(): void {
    if (disposed) return;
    teardown();
    overlay.dispose();
    options.onCancel();
  }

  function onKey(event: KeyboardEvent): void {
    let handled = true;
    if (event.key === 'Escape') cancel();
    else if (event.key === 'Enter' && phase === 'adjusting') confirm();
    else if (event.key === ' ' && phase === 'drawing') spaceHeld = true;
    else if (event.key.startsWith('Arrow') && phase === 'adjusting' && box) {
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      box = clampBox({ ...box, x: box.x + dx, y: box.y + dy }, bounds());
      render();
    } else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.key === ' ') spaceHeld = false;
  }

  const onScroll = () => render();
  const toastTimer = setTimeout(() => toast.classList.add('is-hidden'), TOAST_MS);
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('scroll', onScroll, true);
  addEventListener('resize', onScroll);
  render();

  function teardown(): void {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(toastTimer);
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKeyUp, true);
    removeEventListener('scroll', onScroll, true);
    removeEventListener('resize', onScroll);
  }

  return () => {
    if (!disposed) teardown();
    overlay.dispose();
  };
}
