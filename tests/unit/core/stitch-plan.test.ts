import { pieceRects, planStitch, type StitchInput } from '@/core/stitch-plan';

const base: StitchInput = {
  target: { x: 0, y: 0, w: 1000, h: 3000 },
  viewport: { w: 1000, h: 800 },
  scrollHeight: 3000,
  currentScrollY: 0,
  dpr: 1,
};

describe('planStitch', () => {
  it('문서 전체를 뷰포트 높이 단위로 나누고 마지막 조각은 남은 만큼만 붙인다', () => {
    const plan = planStitch(base);
    expect(plan.pieces).toEqual([
      { scrollY: 0, offset: 0, height: 800 },
      { scrollY: 800, offset: 800, height: 800 },
      { scrollY: 1600, offset: 1600, height: 800 },
      // 최대 스크롤 2200에서 2400~3000 구간만 사용
      { scrollY: 2200, offset: 2400, height: 600 },
    ]);
    expect(plan).toMatchObject({ scale: 1, width: 1000, height: 3000 });
  });

  it('조각 높이의 합이 대상 높이와 같고 겹치지 않는다', () => {
    for (const h of [1, 799, 800, 801, 2999, 12345]) {
      const plan = planStitch({ ...base, target: { ...base.target, h }, scrollHeight: h });
      const total = plan.pieces.reduce((sum, p) => sum + p.height, 0);
      expect(total).toBe(h);
      plan.pieces.forEach((p, i) => {
        if (i > 0) expect(p.offset).toBe(plan.pieces[i - 1]!.offset + plan.pieces[i - 1]!.height);
        // 조각은 해당 스크롤 위치의 화면 안에 있어야 한다
        expect(p.offset - p.scrollY).toBeGreaterThanOrEqual(0);
        expect(p.offset + p.height - p.scrollY).toBeLessThanOrEqual(800);
      });
    }
  });

  it('대상이 이미 화면 안에 있으면 스크롤하지 않고 한 번에 찍는다', () => {
    const plan = planStitch({
      ...base,
      target: { x: 100, y: 1200, w: 300, h: 200 },
      currentScrollY: 1000,
    });
    expect(plan.pieces).toEqual([{ scrollY: 1000, offset: 0, height: 200 }]);
    expect(plan).toMatchObject({ width: 300, height: 200 });
  });

  it('문서 중간의 큰 요소는 요소 위치부터 스크롤한다', () => {
    const plan = planStitch({ ...base, target: { x: 0, y: 500, w: 1000, h: 1500 } });
    expect(plan.pieces).toEqual([
      { scrollY: 500, offset: 0, height: 800 },
      { scrollY: 1300, offset: 800, height: 700 },
    ]);
  });

  it('캔버스 한계를 넘으면 배율을 줄이고 결과 크기가 한계 안에 들어온다', () => {
    const plan = planStitch({
      ...base,
      target: { x: 0, y: 0, w: 1000, h: 20000 },
      scrollHeight: 20000,
      dpr: 2,
    });
    expect(plan.scale).toBeLessThan(1);
    expect(plan.height).toBeLessThanOrEqual(32767);
    expect(plan.width * plan.height).toBeLessThanOrEqual(16384 * 16384);
  });
});

describe('pieceRects', () => {
  it('이웃 조각의 대상 사각형이 소수 배율에서도 이어진다', () => {
    const dpr = 1.25;
    const target = { x: 10, y: 0, w: 500 };
    const plan = planStitch({ ...base, target: { ...target, h: 3000 }, dpr });
    let nextDy = 0;
    for (const piece of plan.pieces) {
      const r = pieceRects(piece, piece.scrollY, target, dpr, plan.scale);
      expect(r.dy).toBe(nextDy);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sy + r.sh).toBeLessThanOrEqual(Math.round(800 * dpr));
      nextDy = r.dy + r.dh;
    }
    expect(nextDy).toBe(plan.height);
  });

  it('브라우저가 요청과 다른 위치로 스크롤해도 실제 위치 기준으로 자른다', () => {
    const piece = { scrollY: 1000, offset: 1000, height: 800 };
    const r = pieceRects(piece, 990, { x: 0, y: 0, w: 1000 }, 1, 1);
    expect(r.sy).toBe(10);
  });
});
