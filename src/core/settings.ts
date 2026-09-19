/**
 * 설정 스키마·기본값·검증·마이그레이션 (docs/architecture.md 10절).
 * 저장값은 부분만 있어도 되며 읽을 때 기본값과 병합한다. 브라우저 API에 의존하지 않는다.
 */
export const SETTINGS_VERSION = 1;

export interface Settings {
  version: typeof SETTINGS_VERSION;
  image: { format: 'png' | 'jpeg'; jpegQuality: number };
  record: {
    format: 'mp4' | 'webm-vp9' | 'webm-vp8' | 'webm-av1';
    fps: 24 | 30 | 60;
    scale: 1 | 0.75 | 0.5;
    bitrate: 'auto' | 'low' | 'high';
    audio: 'none' | 'tab' | 'mic' | 'tab+mic';
    /** 분. 설정 화면은 5·10·30·60을 제공한다 */
    maxMinutes: number;
    countdownSeconds: 0 | 3 | 5;
    indicator: 'none' | 'border' | 'widget';
  };
  afterCapture: 'result' | 'download' | 'clipboard';
  afterRecord: 'result' | 'download';
  download: { saveAs: boolean; pattern: string };
  fullpage: { hideFixed: boolean; lazyWaitMs: number };
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  image: { format: 'png', jpegQuality: 0.92 },
  record: {
    format: 'webm-vp9',
    fps: 30,
    scale: 1,
    bitrate: 'auto',
    audio: 'tab',
    maxMinutes: 30,
    countdownSeconds: 3,
    indicator: 'none',
  },
  afterCapture: 'result',
  afterRecord: 'result',
  download: { saveAs: false, pattern: 'clipt_{date}_{mode}' },
  fullpage: { hideFixed: true, lazyWaitMs: 300 },
};

/** 설정 화면이 제공하는 선택지. 검증에도 쓴다 */
export const OPTIONS = {
  'image.format': ['png', 'jpeg'],
  'record.format': ['mp4', 'webm-vp9', 'webm-vp8', 'webm-av1'],
  'record.fps': [24, 30, 60],
  'record.scale': [1, 0.75, 0.5],
  'record.bitrate': ['auto', 'low', 'high'],
  'record.audio': ['none', 'tab', 'mic', 'tab+mic'],
  'record.maxMinutes': [5, 10, 30, 60],
  'record.countdownSeconds': [0, 3, 5],
  'record.indicator': ['none', 'border', 'widget'],
  afterCapture: ['result', 'download', 'clipboard'],
  afterRecord: ['result', 'download'],
} as const;

/** 목록에 없는 값이면 기본값으로 되돌릴 키(maxMinutes는 양수면 허용) */
const ENUM_KEYS = (Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).filter(
  (key) => key !== 'record.maxMinutes',
);

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 기본값에 저장값을 깊게 병합한다. 기본값에 없는 키와 타입이 다른 값은 버린다 */
function merge<T extends Plain>(base: T, stored: unknown): T {
  if (!isPlain(stored)) return base;
  const out: Plain = { ...base };
  for (const [key, baseValue] of Object.entries(base)) {
    const value = stored[key];
    if (value === undefined) continue;
    if (isPlain(baseValue)) out[key] = merge(baseValue, value);
    else if (typeof value === typeof baseValue) out[key] = value;
  }
  return out as T;
}

function getPath(object: Plain, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (isPlain(o) ? o[k] : undefined), object);
}

function setPath(object: Plain, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<Plain>((o, k) => o[k] as Plain, object);
  parent[last] = value;
}

export type Migration = (stored: Plain) => Plain;

const LEGACY_FLAT_KEYS = [
  'imageFormat',
  'jpegQuality',
  'videoFormat',
  'includeTabAudio',
  'countdownSeconds',
];

/**
 * 버전 n → n+1 마이그레이션. 키는 변환 전 버전.
 * 0: 버전 필드가 없던 초기 평면 스키마(imageFormat, videoFormat, includeTabAudio …)
 */
export const MIGRATIONS: Record<number, Migration> = {
  0: (old) => {
    const next: Plain = { ...old };
    const image: Plain = isPlain(old.image) ? { ...old.image } : {};
    const record: Plain = isPlain(old.record) ? { ...old.record } : {};
    if (typeof old.imageFormat === 'string') image.format = old.imageFormat;
    if (typeof old.jpegQuality === 'number') image.jpegQuality = old.jpegQuality;
    if (old.videoFormat === 'mp4') record.format = 'mp4';
    if (old.videoFormat === 'webm') record.format = 'webm-vp9';
    if (typeof old.includeTabAudio === 'boolean') {
      record.audio = old.includeTabAudio ? 'tab' : 'none';
    }
    if (typeof old.countdownSeconds === 'number') record.countdownSeconds = old.countdownSeconds;
    for (const key of LEGACY_FLAT_KEYS) delete next[key];
    return { ...next, image, record, version: 1 };
  },
};

/** 저장값을 현재 버전까지 순서대로 올린다 */
export function migrateSettings(
  stored: unknown,
  target: number = SETTINGS_VERSION,
  migrations: Record<number, Migration> = MIGRATIONS,
): Plain {
  if (!isPlain(stored)) return {};
  let current: Plain = stored;
  let version = typeof current.version === 'number' ? current.version : 0;
  // 중첩 스키마인데 버전만 없는 저장값은 v1로 본다
  const flat = LEGACY_FLAT_KEYS.some((key) => key in current);
  if (version === 0 && !flat) version = 1;
  while (version < target) {
    const step = migrations[version];
    if (!step) break;
    current = step(current);
    version += 1;
  }
  return current;
}

export function resolveSettings(stored: unknown): Settings {
  // 기본값을 복제해 결과를 수정해도 DEFAULT_SETTINGS가 바뀌지 않게 한다
  const base = structuredClone(DEFAULT_SETTINGS) as unknown as Plain;
  const merged = merge(base, migrateSettings(stored));

  for (const key of ENUM_KEYS) {
    const allowed = OPTIONS[key] as readonly unknown[];
    if (!allowed.includes(getPath(merged, key))) {
      setPath(merged, key, getPath(DEFAULT_SETTINGS as unknown as Plain, key));
    }
  }
  const settings = merged as unknown as Settings;
  const quality = settings.image.jpegQuality;
  if (!(quality >= 0.6 && quality <= 1)) {
    settings.image.jpegQuality = DEFAULT_SETTINGS.image.jpegQuality;
  }
  if (!(settings.record.maxMinutes > 0 && settings.record.maxMinutes <= 60)) {
    settings.record.maxMinutes = DEFAULT_SETTINGS.record.maxMinutes;
  }
  if (!settings.download.pattern.trim()) {
    settings.download.pattern = DEFAULT_SETTINGS.download.pattern;
  }
  return { ...settings, version: SETTINGS_VERSION };
}

/** 점 경로로 설정 한 항목을 바꾼 새 객체 */
export function withSetting(settings: Settings, path: string, value: unknown): Settings {
  const next = structuredClone(settings) as unknown as Plain;
  setPath(next, path, value);
  return resolveSettings(next);
}
