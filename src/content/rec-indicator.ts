import type { NormalizedRect } from '@/core/crop';
import { watchTrackedBox } from './tracker';
import { recordedMs } from '@/core/job';
import { formatElapsed } from '@/core/time';
import { t } from '@/shared/i18n';
import { send } from '@/shared/messages';
import { createOverlay, el, type Overlay } from './overlay/host';

/**
 * 녹화 중 페이지 표시 (docs/architecture.md 9.4절). 설정에서 켠 경우에만 쓴다.
 * 영역·요소 녹화에서는 크롭 경계 바깥에 그려 결과 영상에 찍히지 않는다.
 * 탭 녹화에서는 화면 전체가 녹화되므로 함께 찍힌다(설정 화면에서 경고).
 */
export interface IndicatorState {
  startedAt: number;
  pausedAt?: number;
  pausedTotal?: number;
}

export interface IndicatorOptions {
  kind: 'border' | 'widget';
  jobId: string;
  /** 영역·요소 녹화의 크롭(뷰포트 비율). 탭 녹화면 없음 */
  crop?: NormalizedRect;
  state: IndicatorState;
}

/** 크롭 경계와 테두리 사이 간격(px). 짝수 정렬 반올림으로 테두리가 영상에 들어가지 않게 한다 */
const GAP = 3;
const BORDER = 2;
/** 요소가 멈춘 뒤 테두리를 다시 보이기까지(ms) */
const MOVE_SETTLE_MS = 250;
const WIDGET = { w: 190, h: 40, margin: 12 };

let current: {
  overlay: Overlay;
  update: (state: IndicatorState) => void;
  stop: () => void;
} | null = null;

export function hideIndicator(): void {
  current?.stop();
  current = null;
}

export function updateIndicator(state: IndicatorState): void {
  current?.update(state);
}

/** 위젯을 크롭 영역과 겹치지 않는 모서리에 둔다(오른쪽 아래 우선) */
export function placeWidget(
  crop: { left: number; top: number; right: number; bottom: number } | null,
  viewport: { w: number; h: number },
): { left: number; top: number } {
  const right = viewport.w - WIDGET.w - WIDGET.margin;
  const bottom = viewport.h - WIDGET.h - WIDGET.margin;
  const corners = [
    { left: right, top: bottom },
    { left: WIDGET.margin, top: bottom },
    { left: right, top: WIDGET.margin },
    { left: WIDGET.margin, top: WIDGET.margin },
  ];
  const pad = GAP + BORDER + 2;
  const free = corners.find(
    (c) =>
      !crop ||
      c.left + WIDGET.w < crop.left - pad ||
      c.left > crop.right + pad ||
      c.top + WIDGET.h < crop.top - pad ||
      c.top > crop.bottom + pad,
  );
  return free ?? corners[0]!;
}

export function showIndicator(options: IndicatorOptions): void {
  hideIndicator();
  const overlay = createOverlay('indicator');
  let state = options.state;
  let crop = options.crop
    ? {
        left: options.crop.x * innerWidth,
        top: options.crop.y * innerHeight,
        right: (options.crop.x + options.crop.w) * innerWidth,
        bottom: (options.crop.y + options.crop.h) * innerHeight,
      }
    : null;

  const border = el('div', 'rec-border');
  const placeBorder = () => {
    if (crop) {
      Object.assign(border.style, {
        left: `${crop.left - GAP - BORDER}px`,
        top: `${crop.top - GAP - BORDER}px`,
        width: `${crop.right - crop.left + 2 * (GAP + BORDER)}px`,
        height: `${crop.bottom - crop.top + 2 * (GAP + BORDER)}px`,
      });
    } else {
      Object.assign(border.style, { inset: '0' });
    }
  };
  placeBorder();
  if (options.kind === 'border') overlay.layer.append(border);
  let widgetBox: HTMLElement | null = null;

  let timer = 0;
  let render = () => undefined as void;
  if (options.kind === 'widget') {
    const widget = el('div', 'rec-widget', { role: 'group', 'aria-label': t('recordingShort') });
    const dot = el('span', 'rec-widget-dot', { 'aria-hidden': 'true' });
    dot.textContent = '●';
    const time = el('span', 'rec-widget-time', { role: 'timer' });
    const pause = el('button', 'rec-widget-btn', { type: 'button', 'data-action': 'pause' });
    const stop = el('button', 'rec-widget-btn is-stop', { type: 'button', 'data-action': 'stop' });
    stop.textContent = '■';
    stop.title = t('recStop');
    stop.setAttribute('aria-label', t('recStop'));
    widget.append(dot, time, pause, stop);
    const pos = placeWidget(crop, { w: innerWidth, h: innerHeight });
    Object.assign(widget.style, { left: `${pos.left}px`, top: `${pos.top}px` });
    overlay.layer.append(widget);
    widgetBox = widget;

    pause.addEventListener('click', () => {
      const type = state.pausedAt ? 'job:resume' : 'job:pause';
      void send('background', type, { jobId: options.jobId }).catch(() => undefined);
    });
    stop.addEventListener('click', () => {
      void send('background', 'job:stop', { jobId: options.jobId }).catch(() => undefined);
    });

    // 끌어서 옮기기
    widget.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('button') || event.button !== 0) return;
      const rect = widget.getBoundingClientRect();
      const grab = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      widget.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => {
        const left = Math.min(Math.max(4, e.clientX - grab.x), innerWidth - rect.width - 4);
        const top = Math.min(Math.max(4, e.clientY - grab.y), innerHeight - rect.height - 4);
        Object.assign(widget.style, { left: `${left}px`, top: `${top}px` });
      };
      const up = () => {
        widget.removeEventListener('pointermove', move);
        widget.removeEventListener('pointerup', up);
      };
      widget.addEventListener('pointermove', move);
      widget.addEventListener('pointerup', up);
      event.preventDefault();
    });

    render = () => {
      const paused = state.pausedAt !== undefined;
      time.textContent = formatElapsed(recordedMs(state, Date.now()));
      widget.classList.toggle('is-paused', paused);
      pause.textContent = paused ? '▶' : '❚❚';
      const label = t(paused ? 'recResume' : 'recPause');
      pause.title = label;
      pause.setAttribute('aria-label', label);
    };
    timer = window.setInterval(render, 500);
  }

  // 요소 따라가기: 테두리는 요소를 따라가고, 위젯은 요소와 겹치게 되면 빈 모서리로 옮긴다.
  // 스크롤은 테두리 위치 갱신보다 먼저 화면에 반영될 수 있어, 움직이는 동안에는 테두리를 숨겨 영상에 찍히지 않게 한다
  let moving = 0;
  let first = true;
  watchTrackedBox((box) => {
    crop = box;
    placeBorder();
    if (!first) {
      border.style.visibility = 'hidden';
      clearTimeout(moving);
      moving = window.setTimeout(() => (border.style.visibility = ''), MOVE_SETTLE_MS);
    }
    first = false;
    if (!widgetBox) return;
    const w = widgetBox.getBoundingClientRect();
    const pad = GAP + BORDER + 2;
    const overlaps =
      w.right > box.left - pad &&
      w.left < box.right + pad &&
      w.bottom > box.top - pad &&
      w.top < box.bottom + pad;
    if (!overlaps) return;
    const pos = placeWidget(box, { w: innerWidth, h: innerHeight });
    Object.assign(widgetBox.style, { left: `${pos.left}px`, top: `${pos.top}px` });
  });

  const update = (next: IndicatorState) => {
    state = next;
    border.classList.toggle('is-paused', next.pausedAt !== undefined);
    render();
  };
  update(state);

  current = {
    overlay,
    update,
    stop: () => {
      clearInterval(timer);
      clearTimeout(moving);
      overlay.dispose();
    },
  };
}
