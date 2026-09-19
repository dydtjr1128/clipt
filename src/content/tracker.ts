import { normalizeRect, type NormalizedRect } from '@/core/crop';
import { send } from '@/shared/messages';
import { visibleRectOf } from './dom-tree';

/**
 * 요소 추적 녹화 (docs/architecture.md 9.6절). 선택한 요소의 화면 위치를 프레임마다 재고,
 * 달라졌을 때만 오프스크린 프레임 처리기에 알린다. 스크롤·리사이즈·애니메이션·레이아웃 변화를
 * 한 경로로 잡으려고 이벤트 대신 requestAnimationFrame으로 잰다(녹화 중인 탭은 보이는 상태라 멈추지 않는다).
 */
const HEARTBEAT_MS = 500;
const MAX_FAILURES = 40;

export interface TrackedBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

let element: Element | null = null;
let raf = 0;
let box: TrackedBox | null = null;
let boxListener: ((box: TrackedBox) => void) | null = null;

/**
 * 추적 중인 요소의 화면 위치(CSS px)를 받는다. 녹화 중 표시가 요소를 따라다니며 영상에 찍히지 않게 하는 데 쓴다.
 * 추적 중이 아니면 false
 */
export function watchTrackedBox(listener: (box: TrackedBox) => void): boolean {
  if (!element || !box) return false;
  boxListener = listener;
  listener(box);
  return true;
}

/** 선택 확정 때 추적할 요소를 기억한다. null이면 추적하지 않는다 */
export function setTrackedElement(target: Element | null): void {
  stopTracking();
  element = target;
}

function measure(target: Element): NormalizedRect {
  // 문서에서 빠진 요소는 크기 0으로 알려 직전 화면을 유지하게 한다
  if (!target.isConnected) return { x: 0, y: 0, w: 0, h: 0 };
  const { rect } = visibleRectOf(target);
  box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  return normalizeRect(rect, { w: innerWidth, h: innerHeight });
}

const same = (a: NormalizedRect, b: NormalizedRect) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** 추적을 시작하고 지금 위치를 돌려준다. 기억한 요소가 없으면 null */
export function startTracking(jobId: string): NormalizedRect | null {
  cancelAnimationFrame(raf);
  const target = element;
  if (!target) return null;
  let last = measure(target);
  let sentAt = performance.now();
  let failures = 0;

  let shown = last;
  // 위치는 프레임마다 두 번 잰다. rAF 안에서는 녹화 중 표시를 그리기 전에 옮기고,
  // 그린 뒤(메시지 채널)에는 같은 프레임의 다른 rAF 콜백이 바꾼 위치까지 반영해 오프스크린에 보낸다.
  // rAF에서만 재면 페이지 스크립트가 뒤이어 스크롤할 때 한 프레임 늦은 위치를 보내게 된다
  const afterPaint = new MessageChannel();
  afterPaint.port1.onmessage = () => {
    if (element !== target) return;
    const rect = measure(target);
    const now = performance.now();
    // 오프스크린이 늦게 뜨거나 메시지를 놓쳐도 곧 맞춰지도록 주기적으로 다시 보낸다
    if (same(rect, last) && now - sentAt <= HEARTBEAT_MS) return;
    last = rect;
    sentAt = now;
    send('offscreen', 'rec:track', { jobId, rect }).then(
      () => (failures = 0),
      () => {
        // 녹화가 끝났는데 정리 메시지를 못 받은 경우 스스로 멈춘다
        if (++failures > MAX_FAILURES) stopTracking();
      },
    );
  };

  const tick = () => {
    if (element !== target) {
      afterPaint.port1.close();
      return;
    }
    const rect = measure(target);
    if (!same(rect, shown)) {
      shown = rect;
      if (box) boxListener?.(box);
    }
    afterPaint.port2.postMessage(0);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return last;
}

export function stopTracking(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  element = null;
  box = null;
  boxListener = null;
}
