import type { Job } from '@/core/job';

let current: Job | null = null;
vi.mock('@/background/jobs', () => ({
  getJob: vi.fn(async () => current),
  endJob: vi.fn(async () => {
    const job = current;
    current = null;
    return job;
  }),
  transitionJob: vi.fn(async (_id: string, phase: Job['phase']) => {
    current = { ...current!, phase };
    return current;
  }),
  patchJob: vi.fn(async () => undefined),
  recordError: vi.fn(async () => undefined),
}));
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(async () => null),
  sendToTab: vi.fn(async () => null),
}));
vi.mock('@/background/offscreen', () => ({
  closeOffscreen: vi.fn(async () => undefined),
  ensureOffscreen: vi.fn(async () => undefined),
}));
vi.mock('@/background/emit', () => ({ openResultPage: vi.fn(async () => undefined) }));

const { stopTabRecording, resumeFinalizing, onPageResized, finishRecording } =
  await import('@/background/pipelines/recording');
const jobs = await import('@/background/jobs');
const messages = await import('@/shared/messages');
const offscreen = await import('@/background/offscreen');
const emit = await import('@/background/emit');

const job = (phase: Job['phase']): Job => ({
  id: 'j',
  mode: 'rec-tab',
  phase,
  tabId: 1,
  windowId: 1,
  createdAt: 0,
});
const offscreenCalls = () =>
  vi.mocked(messages.send).mock.calls.filter(([target]) => target === 'offscreen');

describe('stopTabRecording', () => {
  beforeEach(() => vi.clearAllMocks());

  it('저장하는 동안 다시 중지해도 저장 중인 녹화를 취소하지 않는다', async () => {
    current = job('recording');
    let saved!: (value: { resultId: string }) => void;
    vi.mocked(messages.send).mockImplementation((async (_target: string, type: string) =>
      type === 'rec:stop' ? new Promise((resolve) => (saved = resolve)) : null) as never);
    const first = stopTabRecording('j');
    await vi.waitFor(() => expect(current?.phase).toBe('finalizing'));
    await stopTabRecording('j');
    expect(offscreenCalls().map(([, type]) => type)).toEqual(['rec:stop']);
    expect(offscreen.closeOffscreen).not.toHaveBeenCalled();
    saved({ resultId: 'r1' });
    await first;
    expect(emit.openResultPage).toHaveBeenCalledWith(expect.objectContaining({ id: 'j' }), 'r1');
  });

  it('자동 종료(rec:ended)와 사용자 중지가 겹쳐도 결과는 한 번만 마무리한다', async () => {
    current = job('recording');
    let saved!: (value: { resultId: string }) => void;
    vi.mocked(messages.send).mockImplementation((async (_target: string, type: string) =>
      type === 'rec:stop' ? new Promise((resolve) => (saved = resolve)) : null) as never);
    const stopping = stopTabRecording('j');
    await vi.waitFor(() => expect(current?.phase).toBe('finalizing'));
    // 오프스크린이 먼저 저장을 끝내고 rec:ended를 보냈다
    await finishRecording(job('finalizing'), 'r1');
    saved({ resultId: 'r1' });
    await stopping;
    expect(emit.openResultPage).toHaveBeenCalledTimes(1);
    expect(offscreen.closeOffscreen).toHaveBeenCalledTimes(1);
    expect(jobs.recordError).not.toHaveBeenCalled();
  });

  it('중지 요청에 작업 id를 실어 진행 중인 자동 종료 저장을 이어 받을 수 있게 한다', async () => {
    current = job('recording');
    vi.mocked(messages.send).mockImplementation((async (_target: string, type: string) =>
      type === 'rec:stop' ? { resultId: 'r3' } : null) as never);
    await stopTabRecording('j');
    expect(messages.send).toHaveBeenCalledWith('offscreen', 'rec:stop', { jobId: 'j' });
  });

  it('서비스 워커 재기동 뒤 남은 저장 중 작업은 오프스크린의 저장 결과를 이어 받아 마무리한다', async () => {
    current = job('finalizing');
    vi.mocked(messages.send).mockImplementation((async (_target: string, type: string) =>
      type === 'rec:result' ? { resultId: 'r2' } : null) as never);
    await resumeFinalizing(current);
    expect(messages.send).toHaveBeenCalledWith('offscreen', 'rec:result', { jobId: 'j' });
    expect(jobs.endJob).toHaveBeenCalledWith('j');
    expect(emit.openResultPage).toHaveBeenCalledWith(expect.objectContaining({ id: 'j' }), 'r2');
  });

  it('이어 받을 저장이 없으면 작업을 끝내고 사유를 남겨 다음 작업이 막히지 않는다', async () => {
    current = job('finalizing');
    vi.mocked(messages.send).mockImplementation((async (_target: string, type: string) => {
      if (type === 'rec:result') throw new Error('no stop in progress');
      return null;
    }) as never);
    await stopTabRecording('j');
    expect(current).toBeNull();
    expect(jobs.recordError).toHaveBeenCalled();
  });

  it('카운트다운 중 중지는 지금처럼 녹화를 취소한다', async () => {
    current = job('countdown');
    vi.mocked(messages.send).mockImplementation((async () => null) as never);
    await stopTabRecording('j');
    expect(jobs.endJob).toHaveBeenCalledWith('j');
    expect(messages.send).toHaveBeenCalledWith('offscreen', 'rec:discard', null);
  });
});

describe('onPageResized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(messages.send).mockImplementation((async () => null) as never);
  });

  it('끝난 작업이면 감시를 그만두게 false를 돌려준다(Esc 취소·시작 실패 뒤)', async () => {
    current = null;
    expect(await onPageResized('j')).toBe(false);
  });

  it('카운트다운 중이면 녹화를 시작하지 않고 LAYOUT_CHANGED를 남긴다', async () => {
    current = { ...job('countdown'), mode: 'rec-region' };
    expect(await onPageResized('j')).toBe(false);
    expect(current).toBeNull();
    expect(jobs.recordError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'LAYOUT_CHANGED' }),
      'rec-region',
    );
  });

  it('확정 직후 아직 선택 단계면 계속 감시한다', async () => {
    current = { ...job('selecting'), mode: 'rec-element' };
    expect(await onPageResized('j')).toBe(true);
  });
});
