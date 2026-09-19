/**
 * 영역 선택 계산 (docs/ux-design.md 6절). 좌표는 문서 기준 CSS px.
 * 브라우저 API에 의존하지 않아 단위 테스트한다.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** 이 크기 미만의 드래그는 클릭으로 보고 무시한다 */
export const MIN_DRAG = 8;

/** 두 점으로 사각형을 만든다. square면 짧은 변에 맞춰 정사각형 */
export function boxFromPoints(a: Point, b: Point, square = false): Box {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const side = Math.min(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  return {
    x: Math.min(a.x, a.x + dx),
    y: Math.min(a.y, a.y + dy),
    w: Math.abs(dx),
    h: Math.abs(dy),
  };
}

/** 사각형을 bounds 안으로 옮긴다(크기는 bounds를 넘으면 줄인다) */
export function clampBox(box: Box, bounds: Box): Box {
  const w = Math.min(box.w, bounds.w);
  const h = Math.min(box.h, bounds.h);
  const x = Math.min(Math.max(box.x, bounds.x), bounds.x + bounds.w - w);
  const y = Math.min(Math.max(box.y, bounds.y), bounds.y + bounds.h - h);
  return { x, y, w, h };
}

/** 점을 bounds 안으로 자른다 */
export function clampPoint(p: Point, bounds: Box): Point {
  return {
    x: Math.min(Math.max(p.x, bounds.x), bounds.x + bounds.w),
    y: Math.min(Math.max(p.y, bounds.y), bounds.y + bounds.h),
  };
}

/** 핸들을 끌 때 고정되는 반대편 꼭짓점·변 */
export function anchorFor(box: Box, handle: Handle): Point {
  return {
    x: handle.includes('w') ? box.x + box.w : box.x,
    y: handle.includes('n') ? box.y + box.h : box.y,
  };
}

/** 핸들로 크기를 바꾼다. 가로·세로 한쪽 핸들은 다른 축을 유지한다 */
export function resizeBox(box: Box, handle: Handle, pointer: Point, square = false): Box {
  const anchor = anchorFor(box, handle);
  const horizontal = handle.includes('e') || handle.includes('w');
  const vertical = handle.includes('n') || handle.includes('s');
  const moving: Point = {
    x: horizontal ? pointer.x : handle.includes('w') ? box.x : box.x + box.w,
    y: vertical ? pointer.y : handle.includes('n') ? box.y : box.y + box.h,
  };
  if (!horizontal) {
    return { x: box.x, w: box.w, ...pick(boxFromPoints(anchor, moving)) };
  }
  if (!vertical) {
    const b = boxFromPoints(anchor, moving);
    return { x: b.x, w: b.w, y: box.y, h: box.h };
  }
  return boxFromPoints(anchor, moving, square);
}

function pick(b: Box): { y: number; h: number } {
  return { y: b.y, h: b.h };
}

/** 화면 가장자리 근처에서 드래그하면 자동 스크롤할 속도(px/frame). 0이면 스크롤하지 않음 */
export function edgeScrollSpeed(clientY: number, viewportH: number, edge = 32, max = 24): number {
  if (clientY < edge) return -Math.ceil(((edge - clientY) / edge) * max);
  if (clientY > viewportH - edge) return Math.ceil(((clientY - (viewportH - edge)) / edge) * max);
  return 0;
}
