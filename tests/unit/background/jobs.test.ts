import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  JOB_KEY,
  LAST_ERROR_KEY,
  endJob,
  getJob,
  readJob,
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
  // 일반 웹페이지로 간주: 주입 확인 성공
  vi.spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([] as never);
  vi.spyOn(fakeBrowser.extension, 'isAllowedFileSchemeAccess').mockResolvedValue(false as never);
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

describe('복원과 요청 순서', () => {
  it('복원 중 들어온 요청은 정리가 끝난 뒤의 상태를 본다', async () => {
    const tab = await openTab();
    await fakeBrowser.storage.session.set({
      [JOB_KEY]: {
        id: 'old',
        mode: 'fullpage',
        tabId: tab.id,
        windowId: 1,
        phase: 'capturing',
        createdAt: 0,
      },
    });
    let release!: () => void;
    const gate = new Promise<boolean>((resolve) => (release = () => resolve(false)));

    const restoring = restoreJob(() => gate); // 오프스크린 확인이 끝나지 않은 상태
    const read = readJob();
    const started = startJob('visible', tab.id);
    release();

    expect((await restoring).action).toBe('abort');
    expect(await read).toBeNull();
    await expect(started).resolves.toMatchObject({ mode: 'visible' });
  });

  it('없는 탭으로 시작하면 TAB_CLOSED', async () => {
    await expect(startJob('visible', 99999)).rejects.toMatchObject({ code: 'TAB_CLOSED' });
  });
});

describe('제한 페이지', () => {
  it('브라우저 내부 페이지에서는 RESTRICTED_PAGE로 거부한다', async () => {
    const tab = (await fakeBrowser.tabs.create({ url: 'chrome://extensions' })) as { id: number };
    await expect(startJob('visible', tab.id)).rejects.toMatchObject({
      code: 'RESTRICTED_PAGE',
      message: 'browser',
    });
    expect(await getJob()).toBeNull();
  });

  it('주입이 거부되면 no-access로 거부한다', async () => {
    const tab = await openTab();
    vi.mocked(fakeBrowser.scripting.executeScript).mockRejectedValue(new Error('Cannot access'));
    await expect(startJob('visible', tab.id)).rejects.toMatchObject({
      code: 'RESTRICTED_PAGE',
      message: 'no-access',
    });
  });
});

describe('patchJob', () => {
  it('undefined로 준 필드는 저장값에서 지운다', async () => {
    const { patchJob } = await import('@/background/jobs');
    const tab = await openTab();
    const job = await startJob('rec-tab', tab.id);
    await patchJob(job.id, { pausedAt: 5 });
    expect((await getJob())?.pausedAt).toBe(5);
    await patchJob(job.id, { pausedAt: undefined, pausedTotal: 10 });
    const stored = (await fakeBrowser.storage.session.get(JOB_KEY))[JOB_KEY] as Job;
    expect('pausedAt' in stored).toBe(false);
    expect(stored.pausedTotal).toBe(10);
  });
});
