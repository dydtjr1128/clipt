import { browser } from 'wxt/browser';

/** ko 메시지 파일의 키(ko·en 키 일치는 테스트가 보장). 키 오타를 타입 단계에서 막는다. */
export type MessageKey = keyof typeof import('../../public/_locales/ko/messages.json');

/**
 * 사용자에게 보이는 모든 문자열은 이 함수로 가져온다.
 * 치환자는 messages.json의 `$1`, `$2` … 순서를 따른다.
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  // browser.i18n.getMessage의 키 타입은 WXT가 생성하므로 문자열로 넘긴다.
  const message = (browser.i18n.getMessage as (k: string, s?: string | string[]) => string)(
    key,
    substitutions,
  );
  return message || key;
}
