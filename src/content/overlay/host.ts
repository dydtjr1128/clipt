import tokens from '@/styles/tokens.css?inline';
import overlayCss from './overlay.css?inline';

/**
 * 페이지 위 오버레이의 단일 Shadow host (docs/ux-design.md 4절).
 * 페이지 CSS와 격리하고, 끝나면 host 하나만 지우면 흔적이 남지 않는다.
 */
export const HOST_TAG = 'clipt-overlay';

export interface Overlay {
  host: HTMLElement;
  root: ShadowRoot;
  /** 오버레이 요소를 담는 최상위 레이어 */
  layer: HTMLDivElement;
  /** 캡처 직전: 화면에서 완전히 숨긴다 */
  hide(): void;
  dispose(): void;
}

export function createOverlay(className: string): Overlay {
  document.querySelector(HOST_TAG)?.remove();
  const host = document.createElement(HOST_TAG);
  host.setAttribute('data-clipt', '');
  // 페이지 스타일이 host 자체에 영향을 주지 않도록 인라인으로 고정한다
  host.style.cssText =
    'all:initial!important;position:fixed!important;inset:0!important;' +
    'z-index:2147483647!important;pointer-events:none!important;display:block!important;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${tokens}\n${overlayCss}`;
  const layer = document.createElement('div');
  layer.className = `layer ${className}`;
  root.append(style, layer);
  document.documentElement.append(host);

  return {
    host,
    root,
    layer,
    hide() {
      host.style.setProperty('display', 'none', 'important');
    },
    dispose() {
      host.remove();
    },
  };
}

/** 요소를 만들고 클래스·속성을 붙이는 작은 헬퍼 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/** 이벤트가 오버레이 내부에서 시작됐는지 */
export function fromOverlay(event: Event, overlay: Overlay | null): boolean {
  return overlay !== null && event.composedPath().includes(overlay.host);
}
