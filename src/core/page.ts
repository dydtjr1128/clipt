/** 콘텐츠 스크립트가 측정해 서비스 워커에 넘기는 페이지 상태 (CSS px) */
export interface PageProbe {
  viewport: { w: number; h: number };
  dpr: number;
  scroll: { x: number; y: number };
  scrollSize: { w: number; h: number };
  /** 문서는 스크롤되지 않고 내부 요소가 스크롤하는 레이아웃 */
  innerScroller: boolean;
}
