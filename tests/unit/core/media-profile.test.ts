import { chooseMime, containerOf, videoBitrate } from '@/core/media-profile';

describe('chooseMime', () => {
  it('요청 포맷의 첫 지원 후보를 고른다', () => {
    const supported = new Set(['video/webm;codecs=vp9', 'video/webm;codecs=vp8,opus']);
    expect(chooseMime('webm-vp9', (m) => supported.has(m))).toEqual({
      mime: 'video/webm;codecs=vp9',
      format: 'webm-vp9',
    });
  });

  it('지원하지 않으면 폴백 체인으로 넘어가고 원래 요청을 기록한다', () => {
    const supported = new Set(['video/webm;codecs=vp8,opus']);
    expect(chooseMime('mp4', (m) => supported.has(m))).toEqual({
      mime: 'video/webm;codecs=vp8,opus',
      format: 'webm-vp8',
      fallbackFrom: 'mp4',
    });
  });

  it('아무것도 지원하지 않으면 null', () => {
    expect(chooseMime('webm-av1', () => false)).toBeNull();
  });
});

describe('videoBitrate', () => {
  it('1080p30 자동은 수 Mbps, 범위를 벗어나지 않는다', () => {
    const auto = videoBitrate(1920, 1080, 30, 'auto');
    expect(auto).toBeGreaterThan(5_000_000);
    expect(auto).toBeLessThan(12_000_000);
    expect(videoBitrate(1920, 1080, 30, 'high')).toBeGreaterThan(auto);
    expect(videoBitrate(10, 10, 1, 'low')).toBe(500_000);
    expect(videoBitrate(8000, 8000, 60, 'high')).toBe(40_000_000);
  });
});

it('containerOf', () => {
  expect(containerOf('video/mp4;codecs=avc1')).toBe('video/mp4');
  expect(containerOf('video/webm;codecs=vp9')).toBe('video/webm');
});
