import {
  aspectChanged,
  cropPixels,
  MAX_OUTPUT_ASPECT,
  MIN_OUTPUT_SIDE,
  needsPadding,
  normalizeCrop,
  paddedSize,
} from '@/core/crop';

const viewport = { w: 1000, h: 800 };

describe('normalizeCrop', () => {
  it('문서 y를 스크롤 위치로 빼서 뷰포트 비율로 바꾼다', () => {
    expect(normalizeCrop({ x: 200, y: 1150, w: 240, h: 120 }, viewport, 1000)).toEqual({
      crop: { x: 0.2, y: 0.1875, w: 0.24, h: 0.15 },
      clipped: false,
    });
  });

  it('뷰포트 밖 부분은 잘라내고 알린다', () => {
    const result = normalizeCrop({ x: -100, y: 700, w: 400, h: 300 }, viewport, 0);
    expect(result?.clipped).toBe(true);
    expect(result?.crop).toEqual({ x: 0, y: 0.875, w: 0.3, h: 0.125 });
  });

  it('보이는 부분이 없으면 null', () => {
    expect(normalizeCrop({ x: 0, y: 2000, w: 100, h: 100 }, viewport, 0)).toBeNull();
  });
});

describe('cropPixels', () => {
  it('프레임 크기에 곱하고 짝수로 맞춘다', () => {
    const px = cropPixels({ x: 0.2, y: 0.1875, w: 0.24, h: 0.15 }, { width: 1968, height: 1410 });
    expect(px).toEqual({ x: 392, y: 264, width: 472, height: 210 });
    for (const v of Object.values(px)) expect(v % 2).toBe(0);
  });

  it('프레임 밖으로 나가지 않는다', () => {
    const px = cropPixels({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, { width: 1001, height: 801 });
    expect(px.x + px.width).toBeLessThanOrEqual(1001);
    expect(px.y + px.height).toBeLessThanOrEqual(801);
  });
});

describe('paddedSize', () => {
  it('충분히 큰 내용은 크기 그대로다', () => {
    expect(paddedSize({ width: 480, height: 240 })).toEqual({ width: 480, height: 240 });
    expect(needsPadding({ width: 480, height: 240 })).toBe(false);
  });

  it('작은 변은 최소 크기까지 여백을 더한다', () => {
    expect(paddedSize({ width: 300, height: 30 })).toEqual({ width: 300, height: MIN_OUTPUT_SIDE });
    expect(paddedSize({ width: 40, height: 20 })).toEqual({
      width: MIN_OUTPUT_SIDE,
      height: MIN_OUTPUT_SIDE,
    });
    expect(needsPadding({ width: 240, height: 120 })).toBe(true);
  });

  it('가로세로 비율이 최대 비율을 넘지 않게 짧은 변을 늘린다', () => {
    expect(paddedSize({ width: 1904, height: 30 })).toEqual({ width: 1904, height: 476 });
    expect(paddedSize({ width: 30, height: 1000 })).toEqual({ width: 250, height: 1000 });
    for (const content of [
      { width: 1904, height: 30 },
      { width: 700, height: 30 },
      { width: 2, height: 2 },
      { width: 31, height: 999 },
    ]) {
      const size = paddedSize(content);
      expect(size.width / size.height).toBeLessThanOrEqual(MAX_OUTPUT_ASPECT + 0.01);
      expect(size.height / size.width).toBeLessThanOrEqual(MAX_OUTPUT_ASPECT + 0.01);
      expect(size.width).toBeGreaterThanOrEqual(content.width);
      expect(size.height).toBeGreaterThanOrEqual(content.height);
      expect(size.width % 2).toBe(0);
      expect(size.height % 2).toBe(0);
    }
  });

  it('고정 크롭은 같은 픽셀 사각형을 확대·축소 없이 정수 위치 가운데에 그린다', async () => {
    const { centeredDraw } = await import('@/core/crop');
    const frame = { width: 1000, height: 800 };
    // 301×31 선택은 짝수 정렬로 300×30이 되고, 그 사각형 그대로 그린다(재샘플링 없음)
    const rect = cropPixels({ x: 0.1, y: 0.5, w: 0.301, h: 31 / 800 }, frame);
    expect(rect).toEqual({ x: 100, y: 400, width: 300, height: 30 });
    const canvas = paddedSize(rect);
    expect(canvas).toEqual({ width: 300, height: MIN_OUTPUT_SIDE });
    expect(centeredDraw(rect, canvas)).toEqual({
      src: rect,
      dst: { x: 0, y: 65, width: 300, height: 30 },
    });
  });

  it('프레임이 커져 크롭이 캔버스보다 커지면 비율을 지켜 줄인다', async () => {
    const { centeredDraw } = await import('@/core/crop');
    const draw = centeredDraw({ x: 0, y: 0, width: 600, height: 60 }, { width: 300, height: 160 });
    expect(draw.dst).toEqual({ x: 0, y: 65, width: 300, height: 30 });
  });
});

describe('aspectChanged', () => {
  it('같은 비율의 크기 변화는 허용하고 비율이 바뀌면 감지한다', () => {
    expect(aspectChanged({ width: 1000, height: 800 }, { width: 500, height: 400 })).toBe(false);
    expect(aspectChanged({ width: 1000, height: 800 }, { width: 1000, height: 600 })).toBe(true);
  });
});

describe('trackedDraw', () => {
  const frame = { width: 1000, height: 800 };
  const canvas = { width: 240, height: 120 };

  it('요소가 화면 안에 있으면 요소 전체를 캔버스 전체에 그린다', async () => {
    const { trackedDraw } = await import('@/core/crop');
    expect(trackedDraw({ x: 0.2, y: 0.1, w: 0.24, h: 0.15 }, frame, canvas)).toEqual({
      src: { x: 200, y: 80, width: 240, height: 120 },
      dst: { x: 0, y: 0, width: 240, height: 120 },
    });
  });

  it('위로 일부 나가면 보이는 부분만 캔버스의 제자리에 그린다', async () => {
    const { trackedDraw } = await import('@/core/crop');
    const draw = trackedDraw({ x: 0.2, y: -0.05, w: 0.24, h: 0.15 }, frame, canvas)!;
    expect(draw.src).toEqual({ x: 200, y: 0, width: 240, height: 80 });
    expect(draw.dst).toEqual({ x: 0, y: 40, width: 240, height: 80 });
  });

  it('요소 크기가 바뀌면 비율을 지켜 가운데에 맞춘다', async () => {
    const { trackedDraw } = await import('@/core/crop');
    const draw = trackedDraw({ x: 0.2, y: 0.1, w: 0.12, h: 0.15 }, frame, canvas)!;
    expect(draw.dst).toEqual({ x: 60, y: 0, width: 120, height: 120 });
  });

  it('요소가 커지면 비율을 지켜 줄인다', async () => {
    const { trackedDraw } = await import('@/core/crop');
    const draw = trackedDraw({ x: 0.2, y: 0.1, w: 0.48, h: 0.15 }, frame, canvas)!;
    expect(draw.dst).toEqual({ x: 0, y: 30, width: 240, height: 60 });
  });

  it('화면보다 큰 요소는 그 축에서 화면에 보이는 위치 그대로 그린다', async () => {
    const { trackedCanvasSize, trackedDraw } = await import('@/core/crop');
    const tall = { x: 0.2, y: -0.5, w: 0.24, h: 3 };
    const size = trackedCanvasSize(tall, frame);
    expect(size).toEqual({ width: 240, height: 800 });
    expect(trackedDraw(tall, frame, size!)).toEqual({
      src: { x: 200, y: 0, width: 240, height: 800 },
      dst: { x: 0, y: 0, width: 240, height: 800 },
    });
  });

  it('요소가 숨겨져 있으면 캔버스 크기를 정하지 않는다', async () => {
    const { trackedCanvasSize } = await import('@/core/crop');
    expect(trackedCanvasSize({ x: 0, y: 0, w: 0, h: 0 }, frame)).toBeNull();
    expect(trackedCanvasSize({ x: 0.2, y: 0.1, w: 0.001, h: 0.15 }, frame)).toBeNull();
    expect(trackedCanvasSize({ x: 0.2, y: 0.1, w: 0.24, h: 0.15 }, frame)).toEqual(canvas);
  });

  it('전혀 보이지 않으면 null', async () => {
    const { trackedDraw } = await import('@/core/crop');
    expect(trackedDraw({ x: 0.2, y: -0.5, w: 0.24, h: 0.15 }, frame, canvas)).toBeNull();
  });
});
