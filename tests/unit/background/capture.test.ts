import { fakeBrowser } from 'wxt/testing/fake-browser';
import { captureShot, MIN_INTERVAL_MS, resetCaptureQueue } from '@/background/capture-service';
import { waitForPopupClosed } from '@/background/pipelines/visible';

describe('captureShot', () => {
  beforeEach(() => {
    resetCaptureQueue();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('연속 호출 사이에 최소 간격을 둔다', async () => {
    const times: number[] = [];
    vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab').mockImplementation((async () => {
      times.push(Date.now());
      return 'data:image/png;base64,';
    }) as never);

    const shots = [1, 2, 3].map(() => captureShot(1, { format: 'png' }));
    await vi.runAllTimersAsync();
    await Promise.all(shots);

    expect(times).toHaveLength(3);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
  });

  it('JPEG 품질을 0~100으로 넘기고, PNG에는 품질을 넘기지 않는다', async () => {
    const spy = vi
      .spyOn(fakeBrowser.tabs, 'captureVisibleTab')
      .mockResolvedValue('data:,' as never);
    const jpeg = captureShot(7, { format: 'jpeg', quality: 0.92 });
    await vi.runAllTimersAsync();
    await jpeg;
    const png = captureShot(7, { format: 'png', quality: 0.92 });
    await vi.runAllTimersAsync();
    await png;
    expect(spy.mock.calls).toEqual([
      [7, { format: 'jpeg', quality: 92 }],
      [7, { format: 'png' }],
    ]);
  });

  it('API 오류는 CAPTURE_FAILED로 바꾸고 다음 호출은 계속된다', async () => {
    const spy = vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab');
    spy.mockRejectedValueOnce(new Error('quota'));
    spy.mockResolvedValueOnce('data:,' as never);
    const first = captureShot(1, { format: 'png' });
    const firstResult = expect(first).rejects.toMatchObject({ code: 'CAPTURE_FAILED' });
    const second = captureShot(1, { format: 'png' });
    await vi.runAllTimersAsync();
    await firstResult;
    await expect(second).resolves.toBe('data:,');
  });
});

describe('waitForPopupClosed', () => {
  it('팝업 컨텍스트가 사라질 때까지 기다린다', async () => {
    let open = 3;
    const spy = vi
      .spyOn(fakeBrowser.runtime, 'getContexts')
      .mockImplementation(async () => (open-- > 0 ? ([{}] as never) : []));
    await waitForPopupClosed(2000);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('팝업이 닫히지 않아도 제한 시간 뒤에는 진행한다', async () => {
    vi.spyOn(fakeBrowser.runtime, 'getContexts').mockResolvedValue([{}] as never);
    const started = Date.now();
    await waitForPopupClosed(150);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
