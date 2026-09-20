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

/** 뷰포트 밖으로 나갈 수 있는, 자르지 않은 요소 범위(뷰포트 대비 비율) */
export function normalizeRect(
  rect: { left: number; top: number; width: number; height: number },
  viewport: { w: number; h: number },
): NormalizedRect {
  return {
    x: rect.left / viewport.w,
    y: rect.top / viewport.h,
    w: rect.width / viewport.w,
    h: rect.height / viewport.h,
  };
}

export interface TrackedDraw {
  /** 프레임에서 읽을 영역(px) */
  src: PixelRect;
  /** 출력 캔버스에 그릴 영역(px) */
  dst: PixelRect;
}

/** 한 축의 촬영 구간. 요소가 화면보다 크면 그 축은 화면 전체를 찍는다 */
function subjectSpan(
  start: number,
  length: number,
  frame: number,
): { start: number; length: number } {
  return length > frame ? { start: 0, length: frame } : { start, length };
}

/**
 * 추적 녹화의 고정 출력 크기(px, 짝수). 시작 시점 요소 크기이며 화면보다 클 수 없다.
 * 요소가 숨겨져 있거나(0 크기) 2px보다 작으면 null — 유효한 크기가 잡힐 때까지 기다린다
 */
export function trackedCanvasSize(
  rect: NormalizedRect,
  frame: { width: number; height: number },
): { width: number; height: number } | null {
  if (rect.w * frame.width < 2 || rect.h * frame.height < 2) return null;
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  return {
    width: even(Math.min(rect.w * frame.width, frame.width)),
    height: even(Math.min(rect.h * frame.height, frame.height)),
  };
}

/**
 * 요소 추적 녹화의 한 프레임 그리기 계산. 출력 크기는 고정이고(canvas),
 * 요소가 커지면 비율을 유지해 줄이고 작아지면 그대로 가운데에 둔다(레터박스, 확대하지 않음).
 * 요소가 화면 밖으로 일부 나가면 보이는 부분만 제자리에 그린다. 전혀 보이지 않으면 null(직전 화면 유지).
 */
export function trackedDraw(
  rect: NormalizedRect,
  frame: { width: number; height: number },
  canvas: { width: number; height: number },
): TrackedDraw | null {
  const ex = rect.x * frame.width;
  const ey = rect.y * frame.height;
  const ew = rect.w * frame.width;
  const eh = rect.h * frame.height;
  if (ew < 1 || eh < 1) return null;

  const vx0 = Math.max(0, ex);
  const vy0 = Math.max(0, ey);
  const vx1 = Math.min(frame.width, ex + ew);
  const vy1 = Math.min(frame.height, ey + eh);
  if (vx1 - vx0 < 1 || vy1 - vy0 < 1) return null;

  const sx = subjectSpan(ex, ew, frame.width);
  const sy = subjectSpan(ey, eh, frame.height);
  const scale = Math.min(1, canvas.width / sx.length, canvas.height / sy.length);
  const padX = (canvas.width - sx.length * scale) / 2;
  const padY = (canvas.height - sy.length * scale) / 2;
  return {
    src: { x: vx0, y: vy0, width: vx1 - vx0, height: vy1 - vy0 },
    dst: {
      x: padX + (vx0 - sx.start) * scale,
      y: padY + (vy0 - sy.start) * scale,
      width: (vx1 - vx0) * scale,
      height: (vy1 - vy0) * scale,
    },
  };
}
