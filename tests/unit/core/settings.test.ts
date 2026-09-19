import {
  DEFAULT_SETTINGS,
  migrateSettings,
  resolveSettings,
  withSetting,
  type Migration,
} from '@/core/settings';

describe('검증', () => {
  it('선택지에 없는 값은 기본값으로 되돌린다', () => {
    const s = resolveSettings({
      record: { format: 'avi', fps: 25, indicator: 'blink', audio: 'mic' },
      afterCapture: 'email',
    });
    expect(s.record.format).toBe('webm-vp9');
    expect(s.record.fps).toBe(30);
    expect(s.record.indicator).toBe('none');
    expect(s.record.audio).toBe('mic'); // 올바른 값은 유지
    expect(s.afterCapture).toBe('result');
  });

  it('최대 길이는 0~60분 사이 숫자만 허용하고 빈 파일명 패턴은 기본값', () => {
    expect(resolveSettings({ record: { maxMinutes: 0.05 } }).record.maxMinutes).toBe(0.05);
    expect(resolveSettings({ record: { maxMinutes: 600 } }).record.maxMinutes).toBe(30);
    expect(resolveSettings({ download: { pattern: '  ' } }).download.pattern).toBe(
      DEFAULT_SETTINGS.download.pattern,
    );
  });
});

describe('마이그레이션', () => {
  it('버전이 없던 평면 스키마(v0)를 현재 스키마로 옮긴다', () => {
    const s = resolveSettings({
      imageFormat: 'jpeg',
      jpegQuality: 0.8,
      videoFormat: 'mp4',
      includeTabAudio: false,
      countdownSeconds: 5,
      afterCapture: 'download',
    });
    expect(s.image).toEqual({ format: 'jpeg', jpegQuality: 0.8 });
    expect(s.record.format).toBe('mp4');
    expect(s.record.audio).toBe('none');
    expect(s.record.countdownSeconds).toBe(5);
    expect(s.afterCapture).toBe('download');
    expect(s.record.fps).toBe(30); // 없던 키는 기본값
    expect(s.version).toBe(1);
  });

  it('버전을 올려도 기존 값은 보존하고 새 키만 채운다', () => {
    const migrations: Record<number, Migration> = {
      1: (old) => ({ ...old, version: 2, theme: 'auto' }),
    };
    const stored = { version: 1, image: { format: 'jpeg', jpegQuality: 0.7 } };
    expect(migrateSettings(stored, 2, migrations)).toMatchObject({
      version: 2,
      theme: 'auto',
      image: { format: 'jpeg', jpegQuality: 0.7 },
    });
  });

  it('이미 최신 버전이면 그대로', () => {
    const stored = { version: 1, afterRecord: 'download' };
    expect(migrateSettings(stored)).toBe(stored);
  });
});

it('withSetting은 한 항목만 바꾼 새 객체를 돌려주고 잘못된 값은 기본값으로', () => {
  const next = withSetting(DEFAULT_SETTINGS, 'record.fps', 60);
  expect(next.record.fps).toBe(60);
  expect(DEFAULT_SETTINGS.record.fps).toBe(30);
  expect(withSetting(DEFAULT_SETTINGS, 'record.fps', 61).record.fps).toBe(30);
});
