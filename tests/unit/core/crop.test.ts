import { aspectChanged, cropPixels, normalizeCrop } from '@/core/crop';

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

describe('aspectChanged', () => {
  it('같은 비율의 크기 변화는 허용하고 비율이 바뀌면 감지한다', () => {
    expect(aspectChanged({ width: 1000, height: 800 }, { width: 500, height: 400 })).toBe(false);
    expect(aspectChanged({ width: 1000, height: 800 }, { width: 1000, height: 600 })).toBe(true);
  });
});
