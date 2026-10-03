import type { Job } from '@/core/job';

let current: Job | null = null;
vi.mock('@/background/jobs', () => ({
  getJob: vi.fn(async () => current),
  endJob: vi.fn(async () => undefined),
  transitionJob: vi.fn(async () => current),
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

const { stopTabRecording } = await import('@/background/pipelines/recording');
const jobs = await import('@/background/jobs');
const messages = await import('@/shared/messages');
const offscreen = await import('@/background/offscreen');

const job = (phase: Job['phase']): Job => ({
  id: 'j',
  mode: 'rec-tab',
  phase,
  tabId: 1,
  windowId: 1,
  createdAt: 0,
});

describe('stopTabRecording', () => {
  beforeEach(() => vi.clearAllMocks());

  it('저장 중(finalizing)에 다시 중지하면 아무것도 하지 않는다(저장 중인 결과를 취소하지 않음)', async () => {
    current = job('finalizing');
    await stopTabRecording('j');
    expect(messages.send).not.toHaveBeenCalled();
    expect(jobs.endJob).not.toHaveBeenCalled();
    expect(offscreen.closeOffscreen).not.toHaveBeenCalled();
  });

  it('카운트다운 중 중지는 지금처럼 녹화를 취소한다', async () => {
    current = job('countdown');
    await stopTabRecording('j');
    expect(jobs.endJob).toHaveBeenCalledWith('j');
    expect(messages.send).toHaveBeenCalledWith('offscreen', 'rec:discard', null);
  });
});
