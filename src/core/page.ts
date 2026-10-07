/** 콘텐츠 스크립트가 측정해 서비스 워커에 넘기는 페이지 상태 (CSS px) */
export interface PageProbe {
  viewport: { w: number; h: number };
  dpr: number;
  scroll: { x: number; y: number };
  scrollSize: { w: number; h: number };
  /** 문서는 (거의) 스크롤되지 않고 내부 요소가 스크롤하는 레이아웃 */
  innerScroller: boolean;
  /**
   * 문서 대신 스크롤하며 이어 붙일 영역. 전체 페이지는 가장 큰 안쪽 스크롤 영역,
   * 요소는 요소를 세로로 가린 스크롤 영역(또는 스크롤되는 요소 자신). 없으면 문서를 스크롤한다
   */
  area?: ScrollArea;
}

/** 스크롤 영역의 상태 (CSS px). box는 테두리·스크롤바를 뺀 안쪽 상자의 뷰포트 위치 */
export interface ScrollArea {
  box: { x: number; y: number; w: number; h: number };
  scrollTop: number;
  scrollHeight: number;
}

/** 영역을 스크롤하며 찍을 준비를 마친 상태. target의 x는 뷰포트, y는 영역 내용 기준 */
export interface AreaCapture extends ScrollArea {
  target: { x: number; y: number; w: number; h: number };
}
