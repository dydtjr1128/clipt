import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, type Settings } from '@/core/settings';
import type { Job } from '@/core/job';
import { saveResult } from '@/shared/db';

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(async () => 'blob:chrome-extension://id/result'),
}));
vi.mock('@/background/emit', () => ({ openResultPage: vi.fn(async () => undefined) }));
vi.mock('@/background/badge', () => ({ flashBadge: vi.fn(async () => undefined) }));

const { emitRecording } = await import('@/background/pipelines/recording');
const { openResultPage } = await import('@/background/emit');
const { flashBadge } = await import('@/background/badge');

const job: Job = {
  id: 'j',
  mode: 'rec-tab',
  phase: 'finalizing',
  tabId: 1,
  windowId: 1,
  createdAt: 0,
};
const settings: Settings = { ...DEFAULT_SETTINGS, afterRecord: 'download' };

async function saved() {
  const meta = await saveResult(
    { kind: 'video', mode: 'rec-tab', mime: 'video/webm', width: 2, height: 2 },
    new Blob(['v'], { type: 'video/webm' }),
  );
  return meta.id;
}

/** 다운로드를 시작하면 바로 그 상태로 바뀐 것으로 알린다(fake browser에는 downloads 이벤트가 없어 대신한다) */
function downloadEndsWith(state: 'complete' | 'interrupted') {
  vi.spyOn(fakeBrowser.downloads, 'download').mockResolvedValue(5 as never);
  vi.spyOn(fakeBrowser.downloads.onChanged, 'addListener').mockImplementation(((
    listener: (delta: unknown) => void,
  ) => {
    queueMicrotask(() => listener({ id: 5, state: { current: state } }));
  }) as never);
  vi.spyOn(fakeBrowser.downloads.onChanged, 'removeListener').mockImplementation(
    (() => undefined) as never,
  );
}

describe('녹화 결과 바로 다운로드', () => {
  beforeEach(() => {
    vi.mocked(openResultPage).mockClear();
    vi.mocked(flashBadge).mockClear();
  });

  it('완료되면 성공 배지만 띄운다', async () => {
    downloadEndsWith('complete');
    await emitRecording(job, await saved(), settings);
    expect(flashBadge).toHaveBeenCalledWith('✓');
    expect(openResultPage).not.toHaveBeenCalled();
  });

  it('중단되면(저장 위치 취소 등) 성공 배지 대신 결과 페이지를 연다', async () => {
    downloadEndsWith('interrupted');
    const id = await saved();
    await emitRecording(job, id, settings);
    expect(flashBadge).not.toHaveBeenCalled();
    expect(openResultPage).toHaveBeenCalledWith(job, id);
  });

  it('다운로드를 시작하지 못하면 결과 페이지를 연다', async () => {
    vi.spyOn(fakeBrowser.downloads, 'download').mockRejectedValue(new Error('Invalid filename'));
    const id = await saved();
    await emitRecording(job, id, settings);
    expect(openResultPage).toHaveBeenCalledWith(job, id);
    expect(flashBadge).not.toHaveBeenCalled();
  });
});
