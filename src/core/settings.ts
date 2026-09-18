/**
 * 설정 스키마와 기본값 (docs/architecture.md 10절).
 * 저장값은 부분만 있어도 되며 읽을 때 기본값과 병합한다. 설정 화면과 마이그레이션은 #16.
 */
export interface Settings {
  version: 1;
  image: { format: 'png' | 'jpeg'; jpegQuality: number };
  record: {
    format: 'mp4' | 'webm-vp9' | 'webm-vp8' | 'webm-av1';
    fps: 24 | 30 | 60;
    scale: 1 | 0.75 | 0.5;
    bitrate: 'auto' | 'low' | 'high';
    audio: 'none' | 'tab' | 'mic' | 'tab+mic';
    maxMinutes: 5 | 10 | 30 | 60;
    countdownSeconds: 0 | 3 | 5;
    indicator: 'none' | 'border' | 'widget';
  };
  afterCapture: 'result' | 'download' | 'clipboard';
  afterRecord: 'result' | 'download';
  download: { saveAs: boolean; pattern: string };
  fullpage: { hideFixed: boolean; lazyWaitMs: number };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
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

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 기본값에 저장값을 깊게 병합한다. 기본값에 없는 키와 타입이 다른 값은 버린다.
 * 허용 값 목록 검증은 설정 화면(#16)에서 입력 단계에 한다.
 */
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

export function resolveSettings(stored: unknown): Settings {
  // 기본값을 복제해 결과를 수정해도 DEFAULT_SETTINGS가 바뀌지 않게 한다
  const base = structuredClone(DEFAULT_SETTINGS) as unknown as Plain;
  const merged = merge(base, stored) as unknown as Settings;
  const quality = merged.image.jpegQuality;
  if (!(quality >= 0.6 && quality <= 1))
    merged.image.jpegQuality = DEFAULT_SETTINGS.image.jpegQuality;
  return { ...merged, version: 1 };
}
