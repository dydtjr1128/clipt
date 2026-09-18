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
