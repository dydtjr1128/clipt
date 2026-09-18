import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  JOB_KEY,
  LAST_ERROR_KEY,
  endJob,
  getJob,
  restoreJob,
  startJob,
  transitionJob,
} from '@/background/jobs';
import type { Job } from '@/core/job';

async function openTab() {
  const tab = await fakeBrowser.tabs.create({ url: 'https://example.com', active: true });
  return tab as { id: number; windowId: number };
}

beforeEach(() => {
  vi.spyOn(fakeBrowser.action, 'setBadgeText').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setBadgeBackgroundColor').mockResolvedValue(undefined);
});

describe('startJob', () => {
  it('모드별 첫 단계로 작업을 만들고 storage.session에 저장한다', async () => {
    const tab = await openTab();
    const job = await startJob('region', tab.id, 1000);

    expect(job).toMatchObject({
      mode: 'region',
      tabId: tab.id,
      phase: 'selecting',
      createdAt: 1000,
    });
    const stored = await fakeBrowser.storage.session.get(JOB_KEY);
    expect(stored[JOB_KEY]).toEqual(job);
  });

  it('진행 중인 작업이 있으면 JOB_ACTIVE로 거부한다', async () => {
    const tab = await openTab();
    await startJob('visible', tab.id);
    await expect(startJob('region', tab.id)).rejects.toMatchObject({ code: 'JOB_ACTIVE' });
  });

  it('동시에 두 번 요청돼도 하나만 시작된다', async () => {
    const tab = await openTab();
    const results = await Promise.allSettled([
      startJob('visible', tab.id),
      startJob('region', tab.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('transitionJob', () => {
  it('recording 진입 시 startedAt을 기록하고 배지를 REC로 바꾼다', async () => {
    const tab = await openTab();
    const job = await startJob('rec-tab', tab.id);
    const recording = await transitionJob(job.id, 'recording', {}, 5000);

    expect(recording.startedAt).toBe(5000);
    expect(fakeBrowser.action.setBadgeText).toHaveBeenLastCalledWith({ text: 'REC' });
  });

  it('허용되지 않은 전이와 다른 작업 id는 거부한다', async () => {
    const tab = await openTab();
    const job = await startJob('rec-tab', tab.id);
    await expect(transitionJob(job.id, 'capturing')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    await expect(transitionJob('other', 'recording')).rejects.toMatchObject({ code: 'NO_JOB' });
  });
});

describe('endJob', () => {
  it('jobId가 다르면 끝내지 않는다', async () => {
    const tab = await openTab();
    const job = await startJob('visible', tab.id);
    expect(await endJob('other')).toBeNull();
    expect(await endJob(job.id)).toEqual(job);
    expect(await getJob()).toBeNull();
  });
});

describe('restoreJob (서비스 워커 재기동)', () => {
  const base: Job = {
    id: 'j1',
    mode: 'rec-tab',
    tabId: 1,
    windowId: 1,
    phase: 'recording',
    createdAt: 0,
    startedAt: 10,
  };

  it('오프스크린이 살아 있는 녹화는 유지하고 REC 배지를 복원한다', async () => {
    await fakeBrowser.storage.session.set({ [JOB_KEY]: base });
    const result = await restoreJob(async () => true);

    expect(result.action).toBe('keep');
    expect(await getJob()).toEqual(base);
    expect(fakeBrowser.action.setBadgeText).toHaveBeenLastCalledWith({ text: 'REC' });
  });

  it('오프스크린이 사라진 녹화는 정리하고 INTERRUPTED 오류를 남긴다', async () => {
    await fakeBrowser.storage.session.set({ [JOB_KEY]: base });
    const result = await restoreJob(async () => false);

    expect(result.action).toBe('abort');
    expect(await getJob()).toBeNull();
    const stored = await fakeBrowser.storage.session.get(LAST_ERROR_KEY);
    expect(stored[LAST_ERROR_KEY]).toMatchObject({ code: 'INTERRUPTED', mode: 'rec-tab' });
  });

  it('선택 중인 작업은 오프스크린과 무관하게 유지한다', async () => {
    await fakeBrowser.storage.session.set({
      [JOB_KEY]: { ...base, mode: 'element', phase: 'selecting' },
    });
    expect((await restoreJob(async () => false)).action).toBe('keep');
  });
});
