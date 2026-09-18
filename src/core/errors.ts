/** 오류 분류. 사용자 노출 방식은 docs/architecture.md 12절 */
export type ErrorCode =
  | 'RESTRICTED_PAGE'
  | 'RATE_LIMITED'
  | 'CANVAS_TOO_LARGE'
  | 'CAPTURE_FAILED'
  | 'PERMISSION_DENIED'
  | 'TAB_CLOSED'
  | 'UNSUPPORTED_FORMAT'
  | 'LAYOUT_CHANGED'
  | 'INTERNAL_SCROLL'
  // 작업 흐름
  | 'JOB_ACTIVE'
  | 'NO_JOB'
  | 'INVALID_TRANSITION'
  | 'NO_ACTIVE_TAB'
  | 'INTERRUPTED'
  // 메시징
  | 'NO_HANDLER'
  | 'UNKNOWN';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export class CliptError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string = code) {
    super(message);
    this.name = 'CliptError';
    this.code = code;
  }
}

/** 메시지 응답·저장용으로 오류를 직렬화한다. */
export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof CliptError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: 'UNKNOWN', message: error.message };
  return { code: 'UNKNOWN', message: String(error) };
}
