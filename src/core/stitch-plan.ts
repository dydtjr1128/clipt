/**
 * 스크롤 스티칭 계획 (docs/architecture.md 8.1절). 브라우저 API에 의존하지 않는다.
 * 좌표는 모두 문서 기준 CSS px이며, device px 변환은 drawPiece 단계에서 한다.
 */

/** Chrome 캔버스 한계: 한 변 32767px, 면적 16384² */
export const CANVAS_MAX_SIDE = 32767;
export const CANVAS_MAX_AREA = 16384 * 16384;

export interface StitchInput {
  /** 캡처할 문서 영역 (CSS px, 문서 기준) */
  target: { x: number; y: number; w: number; h: number };
  viewport: { w: number; h: number };
  /** 문서 전체 스크롤 높이 */
  scrollHeight: number;
  /** 현재 세로 스크롤 위치. 대상이 이미 화면 안에 있으면 스크롤하지 않는다 */
  currentScrollY: number;
  dpr: number;
  maxSide?: number;
  maxArea?: number;
}

export interface StitchPiece {
  /** 이 조각을 찍기 위해 요청할 스크롤 위치 */
  scrollY: number;
  /** 대상 안에서 이 조각이 시작하는 위치 (0부터) */
  offset: number;
  /** 조각 높이 */
  height: number;
}

export interface StitchPlan {
  pieces: StitchPiece[];
  /** 캔버스 한계 때문에 줄인 배율 (1이면 원본) */
  scale: number;
  /** 결과 이미지 크기 (device px) */
  width: number;
  height: number;
}

export function planStitch(input: StitchInput): StitchPlan {
  const { target, viewport, dpr } = input;
  const maxSide = input.maxSide ?? CANVAS_MAX_SIDE;
  const maxArea = input.maxArea ?? CANVAS_MAX_AREA;
  const maxScroll = Math.max(0, input.scrollHeight - viewport.h);
  const top = Math.max(0, target.y);
  const bottom = Math.min(Math.max(input.scrollHeight, top), target.y + target.h);
  const pieces: StitchPiece[] = [];

  const visibleNow = top >= input.currentScrollY && bottom <= input.currentScrollY + viewport.h;
  if (visibleNow && bottom > top) {
    pieces.push({ scrollY: input.currentScrollY, offset: 0, height: bottom - top });
  } else {
    let y = top;
    while (y < bottom) {
      const scrollY = Math.min(y, maxScroll);
      // 스크롤이 끝에 막혀 y가 화면 아래쪽에 있어도, 화면에 보이는 만큼만 잘라 붙인다
      const height = Math.min(scrollY + viewport.h, bottom) - y;
      if (height <= 0) break;
      pieces.push({ scrollY, offset: y - top, height });
      y += height;
    }
  }

  const rawWidth = Math.round(target.w * dpr);
  const rawHeight = Math.round((bottom - top) * dpr);
  const scale = Math.min(
    1,
    maxSide / Math.max(rawWidth, 1),
    maxSide / Math.max(rawHeight, 1),
    Math.sqrt(maxArea / Math.max(rawWidth * rawHeight, 1)),
  );
  return {
    pieces,
    scale,
    width: Math.max(1, Math.floor(rawWidth * scale)),
    height: Math.max(1, Math.floor(rawHeight * scale)),
  };
}

/**
 * 조각을 결과 캔버스에 그릴 원본·대상 사각형(device px).
 * 이웃 조각의 경계를 같은 반올림으로 계산해 이음새에 틈이나 겹침이 생기지 않게 한다.
 */
export function pieceRects(
  piece: StitchPiece,
  capturedScrollY: number,
  target: { x: number; y: number; w: number },
  dpr: number,
  scale: number,
) {
  const top = Math.max(0, target.y);
  const srcTop = top + piece.offset - capturedScrollY;
  const sy = Math.round(srcTop * dpr);
  const sh = Math.round((srcTop + piece.height) * dpr) - sy;
  const sx = Math.round(target.x * dpr);
  const sw = Math.round((target.x + target.w) * dpr) - sx;
  const dy = Math.round(piece.offset * dpr * scale);
  const dh = Math.round((piece.offset + piece.height) * dpr * scale) - dy;
  return { sx, sy, sw, sh, dx: 0, dy, dw: Math.round(sw * scale), dh };
}
