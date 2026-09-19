import { sanitizeFilename } from '@/core/filename';
import { formatBytes, safeBaseName, shortUrl, splitFilename, stepZoom } from '@/core/format';

it('formatBytes', () => {
  expect(formatBytes(512)).toBe('512 B');
  expect(formatBytes(219_136)).toBe('214 KB');
  expect(formatBytes(13_002_342)).toBe('12.4 MB');
  expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
});

it('shortUrl은 호스트와 경로만 남기고 길면 줄인다', () => {
  expect(shortUrl('https://github.com/dydtjr1128/clipt?tab=1#x')).toBe(
    'github.com/dydtjr1128/clipt',
  );
  expect(shortUrl('https://example.com/')).toBe('example.com');
  expect(shortUrl(`https://example.com/${'a'.repeat(80)}`).length).toBe(48);
  expect(shortUrl('not a url')).toBe('not a url');
});

it('splitFilename', () => {
  expect(splitFilename('clipt_2026.09.17_region.png')).toEqual({
    base: 'clipt_2026.09.17_region',
    ext: 'png',
  });
  expect(splitFilename('noext')).toEqual({ base: 'noext', ext: '' });
});

describe('파일명 정리', () => {
  it('예약 문자와 제어 문자를 바꾸고 앞의 점을 뗀다', () => {
    const control = String.fromCharCode(7);
    expect(sanitizeFilename(`a/b:c*?"<>|${control}d`)).toBe('a_b_c_______d');
    expect(sanitizeFilename('..hidden')).toBe('hidden');
  });

  it('비면 대체 이름을 쓴다', () => {
    expect(safeBaseName('   ', 'fallback')).toBe('fallback');
    expect(safeBaseName('my shot', 'fallback')).toBe('my shot');
  });
});

it('stepZoom은 정해진 단계로 오르내리고 끝에서 멈춘다', () => {
  expect(stepZoom(0.62, 1)).toBe(0.75);
  expect(stepZoom(0.62, -1)).toBe(0.5);
  expect(stepZoom(1, 1)).toBe(1.5);
  expect(stepZoom(4, 1)).toBe(4);
  expect(stepZoom(0.1, -1)).toBe(0.1);
});
