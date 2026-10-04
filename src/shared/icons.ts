/**
 * 화면 아이콘 (docs/ux-design.md 2절 아이콘과 버튼 문구).
 * 글꼴 기호는 OS·글꼴에 따라 크기가 달라지거나 깨지므로 16px 격자의 SVG 경로로 그린다.
 * Preact 화면은 `components/Icon`, DOM으로 그리는 오버레이는 `iconElement`를 쓴다.
 */
export interface IconShape {
  d: string;
  /** 채움 도형(기본은 1.5px 선) */
  fill?: boolean;
  /** 점선 */
  dashed?: boolean;
}

export const ICONS = {
  /** 보이는 화면: 브라우저 창 */
  visible: [
    {
      d: 'M3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3zM2 6h12',
    },
  ],
  /** 전체 페이지: 긴 문서 */
  fullpage: [
    {
      d: 'M4.5 1.5h7A1.5 1.5 0 0 1 13 3v10a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V3a1.5 1.5 0 0 1 1.5-1.5z',
    },
    { d: 'M5.75 5h4.5M5.75 8h4.5M5.75 11h2.5' },
  ],
  /** 요소: 모서리 괄호 안의 선택된 상자 */
  element: [
    {
      d: 'M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11',
    },
    { d: 'M5.5 5.5h5v5h-5z', fill: true },
  ],
  /** 영역: 점선 사각형 */
  region: [{ d: 'M2.5 3.5h11v9h-11z', dashed: true }],
  record: [{ d: 'M8 3.25a4.75 4.75 0 1 1 0 9.5a4.75 4.75 0 1 1 0-9.5z', fill: true }],
  pause: [{ d: 'M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z', fill: true }],
  play: [{ d: 'M5 2.75l8.5 5.25L5 13.25z', fill: true }],
  stop: [{ d: 'M4 4h8v8H4z', fill: true }],
  /** 설정: 슬라이더 */
  settings: [
    { d: 'M2 4.5h12M2 11.5h12' },
    {
      d: 'M5.5 2.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4zM10.5 9.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4z',
      fill: true,
    },
  ],
  keyboard: [
    { d: 'M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z' },
    { d: 'M4.5 6.25h.01M7 6.25h.01M9.5 6.25h.01M12 6.25h.01M5.5 9.5h5' },
  ],
  download: [{ d: 'M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11' }],
  mic: [
    { d: 'M8 1.75a2.25 2.25 0 0 1 2.25 2.25v3.5a2.25 2.25 0 0 1-4.5 0V4A2.25 2.25 0 0 1 8 1.75z' },
    { d: 'M4 7.5a4 4 0 0 0 8 0M8 11.5v2.75M5.75 14.25h4.5' },
  ],
} satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof ICONS;

/** SVG 루트 속성. Preact와 DOM이 같은 값을 쓴다 */
export const ICON_SVG_ATTRS = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.5',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
  focusable: 'false',
} as const;

/** 도형별 path 속성 */
export function shapeAttrs(shape: IconShape): Record<string, string> {
  const attrs: Record<string, string> = { d: shape.d };
  if (shape.fill) Object.assign(attrs, { fill: 'currentColor', stroke: 'none' });
  if (shape.dashed) attrs['stroke-dasharray'] = '2 1.75';
  return attrs;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** DOM으로 그리는 화면용 아이콘 요소 */
export function iconElement(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries(ICON_SVG_ATTRS)) svg.setAttribute(key, value);
  svg.setAttribute('class', className);
  for (const shape of ICONS[name] as readonly IconShape[]) {
    const path = document.createElementNS(SVG_NS, 'path');
    for (const [key, value] of Object.entries(shapeAttrs(shape))) path.setAttribute(key, value);
    svg.append(path);
  }
  return svg;
}
