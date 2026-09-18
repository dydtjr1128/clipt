import { fakeBrowser } from 'wxt/testing/fake-browser';
import { closeOffscreen, ensureOffscreen } from '@/background/offscreen';

describe('ensureOffscreen', () => {
  let alive: boolean;
  let create: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    alive = false;
    vi.spyOn(fakeBrowser.runtime, 'getContexts').mockImplementation(async () =>
      alive ? ([{}] as never) : [],
    );
    create = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      alive = true;
    });
    vi.spyOn(fakeBrowser.offscreen, 'createDocument').mockImplementation(create as never);
    vi.spyOn(fakeBrowser.offscreen, 'closeDocument').mockImplementation(async () => {
      alive = false;
    });
  });

  it('동시에 여러 번 호출해도 문서를 한 번만 만든다', async () => {
    await Promise.all([
      ensureOffscreen(['USER_MEDIA'], 'test'),
      ensureOffscreen(['USER_MEDIA'], 'test'),
      ensureOffscreen(['BLOBS'], 'test'),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/offscreen.html', reasons: ['USER_MEDIA'] }),
    );
  });

  it('이미 있으면 만들지 않고, 닫은 뒤에는 다시 만든다', async () => {
    await ensureOffscreen(['BLOBS'], 'test');
    await ensureOffscreen(['BLOBS'], 'test');
    expect(create).toHaveBeenCalledTimes(1);

    await closeOffscreen();
    await ensureOffscreen(['BLOBS'], 'test');
    expect(create).toHaveBeenCalledTimes(2);
  });
});
