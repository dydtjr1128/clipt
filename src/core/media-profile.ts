import type { Settings } from './settings';

/**
 * 녹화 미디어 프로파일 (docs/architecture.md 9.3절).
 * 설정 포맷을 후보 mimeType으로 펼쳐 브라우저가 지원하는 첫 항목을 고른다.
 * 모두 실패하면 폴백 체인의 다음 포맷으로 넘어간다.
 */
export type RecordFormat = Settings['record']['format'];

export const MIME_CANDIDATES: Record<RecordFormat, readonly string[]> = {
  mp4: ['video/mp4;codecs=avc1.64002A,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4'],
  'webm-vp9': ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9'],
  'webm-vp8': ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8'],
  'webm-av1': ['video/webm;codecs=av01.0.08M.08,opus', 'video/webm;codecs=av01'],
};

export const FALLBACK: Record<RecordFormat, readonly RecordFormat[]> = {
  mp4: ['mp4', 'webm-vp9', 'webm-vp8'],
  'webm-vp9': ['webm-vp9', 'webm-vp8'],
  'webm-vp8': ['webm-vp8'],
  'webm-av1': ['webm-av1', 'webm-vp9', 'webm-vp8'],
};

export interface MimeChoice {
  mime: string;
  format: RecordFormat;
  /** 요청 포맷과 다르면 요청 포맷 */
  fallbackFrom?: RecordFormat;
}

/** 오디오가 없으면 오디오 코덱이 붙은 후보는 건너뛰지 않아도 되지만, 지원 여부는 그대로 따른다 */
export function chooseMime(
  requested: RecordFormat,
  isSupported: (mime: string) => boolean,
): MimeChoice | null {
  for (const format of FALLBACK[requested]) {
    const mime = MIME_CANDIDATES[format].find(isSupported);
    if (mime) {
      return format === requested ? { mime, format } : { mime, format, fallbackFrom: requested };
    }
  }
  return null;
}

/** 해상도·프레임레이트로 영상 비트레이트(bps)를 정한다. 1080p30 자동 ≈ 8Mbps */
export function videoBitrate(
  width: number,
  height: number,
  fps: number,
  level: Settings['record']['bitrate'],
): number {
  const bitsPerPixel = { low: 0.05, auto: 0.13, high: 0.25 }[level];
  const bps = width * height * fps * bitsPerPixel;
  return Math.round(Math.min(40_000_000, Math.max(500_000, bps)));
}

/** mimeType의 컨테이너 부분 (Blob 타입·확장자 결정용) */
export function containerOf(mime: string): 'video/webm' | 'video/mp4' {
  return mime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
}
