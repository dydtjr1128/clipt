/**
 * 좌표 체계 (docs/architecture.md 7절).
 * 콘텐츠 스크립트가 주는 좌표는 뷰포트 기준 CSS px, 캡처 이미지·영상 프레임은 device px.
 */
export type Unit = 'css' | 'device';

export interface Rect<U extends Unit = Unit> {
  x: number;
  y: number;
  w: number;
  h: number;
  unit: U;
}

/** 화면 사각형(뷰포트 CSS px, 모서리 좌표) */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 두 사각형이 겹치는지. pad만큼 b를 넓혀 본다(테두리·반올림 여유) */
export function boxesOverlap(a: Box, b: Box, pad = 0): boolean {
  return (
    a.right > b.left - pad &&
    a.left < b.right + pad &&
    a.bottom > b.top - pad &&
    a.top < b.bottom + pad
  );
}
