import { boxFromPoints, clampBox, clampPoint, edgeScrollSpeed, resizeBox } from '@/core/region';

describe('boxFromPoints', () => {
  it('어느 방향으로 드래그해도 양수 크기의 사각형', () => {
    expect(boxFromPoints({ x: 10, y: 20 }, { x: 110, y: 70 })).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    });
    expect(boxFromPoints({ x: 110, y: 70 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    });
  });

  it('Shift(정사각형)는 짧은 변에 맞추고 드래그 방향을 유지한다', () => {
    expect(boxFromPoints({ x: 100, y: 100 }, { x: 40, y: 180 }, true)).toEqual({
      x: 40,
      y: 100,
      w: 60,
      h: 60,
    });
  });
});

describe('clamp', () => {
  const bounds = { x: 0, y: 0, w: 1000, h: 3000 };

  it('사각형을 경계 안으로 옮긴다', () => {
    expect(clampBox({ x: 950, y: -10, w: 100, h: 50 }, bounds)).toEqual({
      x: 900,
      y: 0,
      w: 100,
      h: 50,
    });
  });

  it('점을 경계 안으로 자른다', () => {
    expect(clampPoint({ x: -5, y: 4000 }, bounds)).toEqual({ x: 0, y: 3000 });
  });
});

describe('resizeBox', () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };

  it('모서리 핸들은 반대 꼭짓점을 고정한다', () => {
    expect(resizeBox(box, 'se', { x: 350, y: 260 })).toEqual({ x: 100, y: 100, w: 250, h: 160 });
    expect(resizeBox(box, 'nw', { x: 50, y: 80 })).toEqual({ x: 50, y: 80, w: 250, h: 120 });
  });

  it('변 핸들은 다른 축을 유지한다', () => {
    expect(resizeBox(box, 'e', { x: 400, y: 999 })).toEqual({ x: 100, y: 100, w: 300, h: 100 });
    expect(resizeBox(box, 'n', { x: 999, y: 50 })).toEqual({ x: 100, y: 50, w: 200, h: 150 });
  });

  it('반대편을 넘어 끌면 뒤집힌다', () => {
    expect(resizeBox(box, 'e', { x: 60, y: 0 })).toEqual({ x: 60, y: 100, w: 40, h: 100 });
  });
});

describe('edgeScrollSpeed', () => {
  it('가장자리에 가까울수록 빠르고 가운데에서는 0', () => {
    expect(edgeScrollSpeed(400, 800)).toBe(0);
    expect(edgeScrollSpeed(799, 800)).toBeGreaterThan(edgeScrollSpeed(780, 800));
    expect(edgeScrollSpeed(0, 800)).toBeLessThan(0);
  });
});
