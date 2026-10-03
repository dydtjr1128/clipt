import { selectExpired } from '@/core/retention';

const HOUR = 60 * 60 * 1000;
const policy = { maxAgeMs: 24 * HOUR, maxBytes: 100 };

describe('selectExpired', () => {
  it('보존 기간이 지난 결과를 고른다', () => {
    const now = 100 * HOUR;
    const items = [
      { id: 'old', createdAt: now - 25 * HOUR, bytes: 1 },
      { id: 'new', createdAt: now - 1 * HOUR, bytes: 1 },
    ];
    expect(selectExpired(items, now, policy)).toEqual(['old']);
  });

  it('용량을 넘으면 오래된 것부터 한도 안으로 들어올 때까지 고른다', () => {
    const now = 100 * HOUR;
    const items = [
      { id: 'c', createdAt: now - 1, bytes: 40 },
      { id: 'a', createdAt: now - 3, bytes: 40 },
      { id: 'b', createdAt: now - 2, bytes: 40 },
    ];
    expect(selectExpired(items, now, policy)).toEqual(['a']);
  });

  it('가장 최근 결과는 혼자 용량 한도를 넘어도 지우지 않는다(긴 녹화)', () => {
    const now = 100 * HOUR;
    expect(selectExpired([{ id: 'big', createdAt: now - 1, bytes: 501 }], now, policy)).toEqual([]);
    const items = [
      { id: 'older', createdAt: now - 10, bytes: 30 },
      { id: 'big', createdAt: now - 1, bytes: 501 },
    ];
    expect(selectExpired(items, now, policy)).toEqual(['older']);
  });

  it('keep으로 넘긴 결과는 기간·용량과 관계없이 남긴다', () => {
    const now = 100 * HOUR;
    const items = [
      { id: 'viewing', createdAt: now - 30 * HOUR, bytes: 80 },
      { id: 'newer', createdAt: now - 1 * HOUR, bytes: 80 },
    ];
    expect(selectExpired(items, now, policy, ['viewing'])).toEqual([]);
    expect(selectExpired(items, now, policy)).toEqual(['viewing']);
  });

  it('한도 안이면 아무것도 고르지 않는다', () => {
    expect(selectExpired([{ id: 'x', createdAt: 0, bytes: 10 }], 1, policy)).toEqual([]);
  });
});
