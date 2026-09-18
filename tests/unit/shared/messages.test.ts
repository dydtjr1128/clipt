import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CliptError } from '@/core/errors';
import { isEnvelope, listen, send, type Envelope, type Response } from '@/shared/messages';

type Listener = (message: unknown, sender: object, sendResponse: (r: Response) => void) => boolean;

/** listen이 등록한 리스너를 직접 호출해 응답을 받는다 */
function captureListener(): { get: () => Listener } {
  let captured: Listener | undefined;
  vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener').mockImplementation((l) => {
    captured = l as unknown as Listener;
  });
  return {
    get: () => {
      if (!captured) throw new Error('listener not registered');
      return captured;
    },
  };
}

function dispatch(listener: Listener, message: Envelope): Promise<Response | 'ignored'> {
  return new Promise((resolve) => {
    const async = listener(message, {}, resolve);
    if (!async) setTimeout(() => resolve('ignored'), 0);
  });
}

const env = (target: Envelope['target'], type: string, payload: unknown = null): Envelope => ({
  __clipt: 1,
  target,
  type,
  payload,
});

describe('listen', () => {
  it('자기 target의 메시지를 처리해 ok 응답을 돌려준다', async () => {
    const cap = captureListener();
    listen('offscreen', { 'offscreen:ping': () => 'pong' as const });
    expect(await dispatch(cap.get(), env('offscreen', 'offscreen:ping'))).toEqual({
      ok: true,
      data: 'pong',
    });
  });

  it('다른 target이나 봉투가 아닌 메시지에는 응답하지 않는다', async () => {
    const cap = captureListener();
    listen('offscreen', { 'offscreen:ping': () => 'pong' as const });
    expect(await dispatch(cap.get(), env('background', 'job:get'))).toBe('ignored');
    expect(cap.get()({ hello: 1 }, {}, () => undefined)).toBe(false);
  });

  it('핸들러 오류를 코드와 함께 직렬화한다', async () => {
    const cap = captureListener();
    listen('background', {
      'job:get': () => {
        throw new CliptError('NO_JOB', 'none');
      },
    });
    expect(await dispatch(cap.get(), env('background', 'job:get'))).toEqual({
      ok: false,
      error: { code: 'NO_JOB', message: 'none' },
    });
  });
});

describe('send', () => {
  it('ok 응답의 data를 돌려주고 오류 응답은 CliptError로 던진다', async () => {
    // sendMessage의 반환 타입이 오버로드로 void가 잡혀 응답 객체를 never로 넘긴다
    const spy = vi.spyOn(fakeBrowser.runtime, 'sendMessage');
    spy.mockResolvedValueOnce({ ok: true, data: null } as never);
    await expect(send('background', 'job:get', null)).resolves.toBeNull();
    expect(isEnvelope(spy.mock.calls[0]?.[0])).toBe(true);

    spy.mockResolvedValueOnce({
      ok: false,
      error: { code: 'JOB_ACTIVE', message: 'busy' },
    } as never);
    await expect(send('background', 'job:start', { mode: 'visible' })).rejects.toMatchObject({
      code: 'JOB_ACTIVE',
    });

    spy.mockResolvedValueOnce(undefined);
    await expect(send('background', 'job:get', null)).rejects.toMatchObject({ code: 'NO_HANDLER' });
  });
});
