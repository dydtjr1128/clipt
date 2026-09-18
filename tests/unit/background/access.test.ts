import { fakeBrowser } from 'wxt/testing/fake-browser';
import { checkTab, ensureContentScript } from '@/background/access';

async function tab(url: string) {
  return ((await fakeBrowser.tabs.create({ url })) as { id: number }).id;
}

beforeEach(() => {
  vi.spyOn(fakeBrowser.extension, 'isAllowedFileSchemeAccess').mockResolvedValue(false as never);
});

describe('checkTab', () => {
  it('URL로 제한을 판정하면 주입을 시도하지 않는다', async () => {
    const exec = vi.spyOn(fakeBrowser.scripting, 'executeScript');
    expect(await checkTab(await tab('chrome://settings'))).toEqual({
      available: false,
      reason: 'browser',
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it('일반 페이지는 주입 성공 여부로 판정한다', async () => {
    const exec = vi.spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([] as never);
    const id = await tab('https://example.com');
    expect(await checkTab(id)).toEqual({ available: true });

    exec.mockRejectedValue(new Error('Cannot access contents of the page'));
    expect(await checkTab(id)).toEqual({ available: false, reason: 'no-access' });
  });

  it('없는 탭은 TAB_CLOSED', async () => {
    await expect(checkTab(424242)).rejects.toMatchObject({ code: 'TAB_CLOSED' });
  });
});

describe('ensureContentScript', () => {
  it('PING에 응답하면 다시 주입하지 않는다', async () => {
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue({
      ok: true,
      data: 'pong',
    } as never);
    const exec = vi.spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([] as never);
    await ensureContentScript(await tab('https://example.com'));
    expect(exec).not.toHaveBeenCalled();
  });

  it('응답이 없으면 콘텐츠 스크립트 파일을 주입한다', async () => {
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockRejectedValue(new Error('no receiver'));
    const exec = vi.spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([] as never);
    const id = await tab('https://example.com');
    await ensureContentScript(id);
    expect(exec).toHaveBeenCalledWith({
      target: { tabId: id },
      files: ['/content-scripts/content.js'],
    });
  });

  it('주입이 거부되면 RESTRICTED_PAGE', async () => {
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockRejectedValue(new Error('no receiver'));
    vi.spyOn(fakeBrowser.scripting, 'executeScript').mockRejectedValue(new Error('denied'));
    await expect(ensureContentScript(await tab('https://example.com'))).rejects.toMatchObject({
      code: 'RESTRICTED_PAGE',
    });
  });
});
