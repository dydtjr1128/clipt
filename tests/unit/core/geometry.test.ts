import { boxesOverlap } from '@/core/geometry';

describe('boxesOverlap', () => {
  const crop = { left: 200, top: 150, right: 440, bottom: 270 };

  it('겹치면 true, 떨어져 있으면 false', () => {
    expect(boxesOverlap({ left: 300, top: 200, right: 490, bottom: 240 }, crop)).toBe(true);
    expect(boxesOverlap({ left: 500, top: 200, right: 690, bottom: 240 }, crop)).toBe(false);
  });

  it('여유(pad)만큼 가까워도 겹친 것으로 본다', () => {
    const near = { left: 444, top: 200, right: 634, bottom: 240 };
    expect(boxesOverlap(near, crop)).toBe(false);
    expect(boxesOverlap(near, crop, 7)).toBe(true);
  });
});
