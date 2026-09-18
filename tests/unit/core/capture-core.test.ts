import { buildFilename, extensionOf, formatStamp } from '@/core/filename';
import { DEFAULT_SETTINGS, resolveSettings } from '@/core/settings';

describe('resolveSettings', () => {
  it('저장값이 없으면 기본값', () => {
    expect(resolveSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('일부만 저장돼 있어도 나머지는 기본값으로 채운다', () => {
    const settings = resolveSettings({ image: { format: 'jpeg' }, afterCapture: 'download' });
    expect(settings.image).toEqual({ format: 'jpeg', jpegQuality: 0.92 });
    expect(settings.afterCapture).toBe('download');
    expect(settings.record).toEqual(DEFAULT_SETTINGS.record);
  });

  it('타입이 다른 값과 모르는 키는 버리고 품질 범위를 벗어나면 기본값', () => {
    const settings = resolveSettings({
      image: { format: 3, jpegQuality: 5 },
      unknown: true,
      download: 'x',
    });
    expect(settings.image).toEqual(DEFAULT_SETTINGS.image);
    expect(settings.download).toEqual(DEFAULT_SETTINGS.download);
    expect('unknown' in settings).toBe(false);
  });

  it('기본값 객체를 변경하지 않는다', () => {
    const settings = resolveSettings({ image: { jpegQuality: 0.7 } });
    settings.image.format = 'jpeg';
    const empty = resolveSettings(undefined);
    empty.record.fps = 60;
    empty.download.saveAs = true;
    expect(DEFAULT_SETTINGS.record.fps).toBe(30);
    expect(DEFAULT_SETTINGS.download.saveAs).toBe(false);
    expect(DEFAULT_SETTINGS.image).toEqual({ format: 'png', jpegQuality: 0.92 });
  });
});

describe('filename', () => {
  const date = new Date(2026, 8, 17, 18, 12, 30);

  it('로컬 시각 기준 YYYYMMDD-HHmmss', () => {
    expect(formatStamp(date)).toBe('20260917-181230');
  });

  it('패턴의 {date}·{mode}를 채우고 MIME으로 확장자를 붙인다', () => {
    expect(buildFilename('clipt_{date}_{mode}', { date, mode: 'visible', mime: 'image/png' })).toBe(
      'clipt_20260917-181230_visible.png',
    );
    expect(extensionOf('image/jpeg')).toBe('jpg');
    expect(extensionOf('video/webm;codecs=vp9')).toBe('webm');
  });

  it('파일명에 쓸 수 없는 문자를 바꾼다', () => {
    expect(buildFilename('a/b:c*?{mode}', { date, mode: 'region', mime: 'image/png' })).toBe(
      'a_b_c__region.png',
    );
    expect(buildFilename('..', { date, mode: 'region', mime: 'image/png' })).toBe('clipt.png');
  });
});
