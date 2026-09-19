/**
 * 영역·요소 녹화 크롭 계산 (docs/architecture.md 9.2절). 브라우저 API에 의존하지 않는다.
 * 크롭은 뷰포트 대비 비율(0~1)로 넘기고, 오프스크린이 실제 프레임 크기에 곱해 픽셀로 바꾼다.
 * 탭 캡처 프레임 크기가 요청과 조금 달라도 같은 영역을 자를 수 있다.
 */
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * 선택 범위(x는 뷰포트, y는 문서 기준 CSS px)를 녹화 시작 시점 뷰포트 비율로 바꾼다.
 * 뷰포트 밖 부분은 녹화할 수 없으므로 잘라내고 clipped로 알린다.
 */
export function normalizeCrop(
  target: { x: number; y: number; w: number; h: number },
  viewport: { w: number; h: number },
  scrollY: number,
): { crop: NormalizedRect; clipped: boolean } | null {
  const top = target.y - scrollY;
  const x0 = Math.max(0, target.x);
  const y0 = Math.max(0, top);
  const x1 = Math.min(viewport.w, target.x + target.w);
  const y1 = Math.min(viewport.h, top + target.h);
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const clipped = x0 > target.x || y0 > top || x1 < target.x + target.w || y1 < top + target.h;
  return {
    crop: {
      x: clamp01(x0 / viewport.w),
      y: clamp01(y0 / viewport.h),
      w: clamp01((x1 - x0) / viewport.w),
      h: clamp01((y1 - y0) / viewport.h),
    },
    clipped,
  };
}

/** 비율 크롭을 프레임 픽셀로. I420 등은 짝수 정렬이 필요해 위치·크기를 짝수로 맞춘다 */
export function cropPixels(
  crop: NormalizedRect,
  frame: { width: number; height: number },
): PixelRect {
  const even = (n: number) => Math.floor(n / 2) * 2;
  const x = even(crop.x * frame.width);
  const y = even(crop.y * frame.height);
  const width = Math.max(2, Math.min(even(crop.w * frame.width), even(frame.width - x)));
  const height = Math.max(2, Math.min(even(crop.h * frame.height), even(frame.height - y)));
  return { x, y, width, height };
}

/** 녹화 중 프레임 비율이 달라졌는지(창 리사이즈·개발자 도구). 같은 비율의 크기 변화는 허용 */
export function aspectChanged(
  base: { width: number; height: number },
  next: { width: number; height: number },
  tolerance = 0.01,
): boolean {
  const a = base.width / base.height;
  const b = next.width / next.height;
  return Math.abs(a - b) / a > tolerance;
}
