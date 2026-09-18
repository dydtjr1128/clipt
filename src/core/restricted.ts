/**
 * 캡처·녹화할 수 없는 페이지 판정 (docs/architecture.md 12절 RESTRICTED_PAGE).
 * URL만으로 알 수 있는 제한을 먼저 거르고, 나머지는 서비스 워커가 실제 주입 가능 여부로 확인한다.
 */
export type RestrictReason =
  /** chrome://, 확장 페이지, about: 등 브라우저 내부 페이지 */
  | 'browser'
  /** Chrome 웹스토어·Edge 애드온 스토어. 확장이 스크립트를 넣을 수 없다 */
  | 'webstore'
  /** file:// 인데 사용자가 파일 URL 접근을 허용하지 않음 */
  | 'file'
  /** data:, blob: 등 지원하지 않는 스킴 */
  | 'unsupported'
  /** URL을 읽을 수 없거나 주입이 거부됨(activeTab 미부여 등) */
  | 'no-access';

/** 탭에서 캡처·녹화를 시작할 수 있는지 */
export type TabAccess = { available: true } | { available: false; reason: RestrictReason };

const BROWSER_SCHEMES = new Set([
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'about:',
  'view-source:',
]);

function isWebStore(url: URL): boolean {
  return (
    url.hostname === 'chromewebstore.google.com' ||
    (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) ||
    (url.hostname === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons'))
  );
}

export function restrictionOf(
  url: string | undefined,
  options: { fileAccess: boolean },
): RestrictReason | null {
  if (!url) return 'no-access';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'no-access';
  }
  if (BROWSER_SCHEMES.has(parsed.protocol)) return 'browser';
  if (parsed.protocol === 'file:') return options.fileAccess ? null : 'file';
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'unsupported';
  if (isWebStore(parsed)) return 'webstore';
  return null;
}
