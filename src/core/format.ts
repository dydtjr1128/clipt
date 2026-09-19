import { sanitizeFilename } from './filename';

/** 결과 페이지 표시용 서식 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** URL을 호스트+경로로 줄여 보여 준다 */
export function shortUrl(url: string, max = 48): string {
  let text = url;
  try {
    const parsed = new URL(url);
    text = parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
  } catch {
    // 그대로 둔다
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 파일명에서 확장자를 뗀 부분과 확장자 */
export function splitFilename(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot <= 0
    ? { base: name, ext: '' }
    : { base: name.slice(0, dot), ext: name.slice(dot + 1) };
}

/** 사용자가 고친 이름을 안전한 파일명으로. 비면 fallback */
export function safeBaseName(input: string, fallback: string): string {
  return sanitizeFilename(input, fallback);
}

export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** 현재 배율에서 한 단계 확대·축소한 배율 */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > current + 1e-6) ?? ZOOM_STEPS.at(-1)!;
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 1e-6) ?? ZOOM_STEPS[0]!;
}
