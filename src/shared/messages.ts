import { browser, type Browser } from 'wxt/browser';
import { CliptError, toErrorPayload, type ErrorPayload } from '@/core/errors';
import type { Job, Mode } from '@/core/job';

/**
 * 컨텍스트 간 메시지 프로토콜 (docs/architecture.md 6절).
 * 수신 컨텍스트별로 메시지 이름 → (payload) => 응답 시그니처를 정의한다.
 * 새 메시지는 여기에만 추가하고, 보낼 때는 send*, 받을 때는 listen을 사용한다.
 */
export interface Protocol {
  background: {
    /** 작업 시작. tabId를 생략하면 마지막으로 포커스된 창의 활성 탭 */
    'job:start': (payload: { mode: Mode; tabId?: number }) => Job;
    /** 진행 중인 작업 취소. jobId를 주면 해당 작업일 때만 취소 */
    'job:cancel': (payload: { jobId?: string }) => null;
    'job:get': (payload: null) => Job | null;
  };
  offscreen: {
    'offscreen:ping': (payload: null) => 'pong';
  };
  content: Record<never, never>;
}

export type Target = keyof Protocol;
type Handlers<T extends Target> = Protocol[T];
export type MessageType<T extends Target> = Extract<keyof Handlers<T>, string>;
export type Payload<T extends Target, K extends MessageType<T>> = Handlers<T>[K] extends (
  payload: infer P,
) => unknown
  ? P
  : never;
export type Reply<T extends Target, K extends MessageType<T>> = Handlers<T>[K] extends (
  ...args: never[]
) => infer R
  ? R
  : never;

/** 전송 봉투. 다른 확장·페이지 메시지와 구분하기 위해 표식을 둔다 */
export interface Envelope<T extends Target = Target> {
  __clipt: 1;
  target: T;
  type: string;
  payload: unknown;
}

export type Response<R = unknown> = { ok: true; data: R } | { ok: false; error: ErrorPayload };

export function isEnvelope(message: unknown): message is Envelope {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Envelope).__clipt === 1 &&
    typeof (message as Envelope).target === 'string' &&
    typeof (message as Envelope).type === 'string'
  );
}

function unwrap<R>(response: Response<R> | undefined, type: string): R {
  if (!response) throw new CliptError('NO_HANDLER', `No handler responded to ${type}`);
  if (!response.ok) throw new CliptError(response.error.code, response.error.message);
  return response.data;
}

function envelope<T extends Target>(target: T, type: string, payload: unknown): Envelope<T> {
  return { __clipt: 1, target, type, payload };
}

/** 서비스 워커 또는 오프스크린 문서로 보낸다 */
export async function send<T extends Exclude<Target, 'content'>, K extends MessageType<T>>(
  target: T,
  type: K,
  payload: Payload<T, K>,
): Promise<Reply<T, K>> {
  const response = (await browser.runtime.sendMessage(envelope(target, type, payload))) as
    Response<Reply<T, K>> | undefined;
  return unwrap(response, type);
}

/** 특정 탭의 콘텐츠 스크립트로 보낸다 */
export async function sendToTab<K extends MessageType<'content'>>(
  tabId: number,
  type: K,
  payload: Payload<'content', K>,
): Promise<Reply<'content', K>> {
  const response = (await browser.tabs.sendMessage(tabId, envelope('content', type, payload))) as
    Response<Reply<'content', K>> | undefined;
  return unwrap(response, type);
}

export type Sender = Browser.runtime.MessageSender;

export type HandlerMap<T extends Target> = {
  [K in MessageType<T>]?: (
    payload: Payload<T, K>,
    sender: Sender,
  ) => Reply<T, K> | Promise<Reply<T, K>>;
};

/**
 * 이 컨텍스트가 target으로 지정된 메시지를 처리하도록 등록한다.
 * 다른 target의 메시지에는 응답하지 않아 올바른 수신자가 답할 수 있게 한다.
 * 반환값은 등록 해제 함수.
 */
export function listen<T extends Target>(target: T, handlers: HandlerMap<T>): () => void {
  const listener = (
    message: unknown,
    sender: Sender,
    sendResponse: (response: Response) => void,
  ): boolean => {
    if (!isEnvelope(message) || message.target !== target) return false;
    const handler = handlers[message.type as MessageType<T>] as
      ((payload: unknown, sender: Sender) => unknown) | undefined;
    if (!handler) {
      sendResponse({
        ok: false,
        error: { code: 'NO_HANDLER', message: `${target} has no handler for ${message.type}` },
      });
      return false;
    }
    Promise.resolve()
      .then(() => handler(message.payload, sender))
      .then(
        (data) => sendResponse({ ok: true, data: data ?? null }),
        (error: unknown) => sendResponse({ ok: false, error: toErrorPayload(error) }),
      );
    return true; // 비동기 응답
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
