import { browser, type Browser } from 'wxt/browser';

/**
 * 오프스크린 문서 수명 관리. 동시에 하나만 존재할 수 있으므로
 * 생성 중인 요청을 공유해 중복 생성 오류를 막는다.
 */
export type OffscreenReason = `${Browser.offscreen.Reason}`;

const PATH = '/offscreen.html';
let creating: Promise<void> | null = null;

export async function hasOffscreen(): Promise<boolean> {
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType],
    documentUrls: [browser.runtime.getURL(PATH)],
  });
  return contexts.length > 0;
}

export async function ensureOffscreen(
  reasons: OffscreenReason[],
  justification: string,
): Promise<void> {
  if (creating) return creating;
  if (await hasOffscreen()) return;
  creating ??= browser.offscreen
    .createDocument({
      url: PATH,
      reasons: reasons as Browser.offscreen.Reason[],
      justification,
    })
    .finally(() => {
      creating = null;
    });
  return creating;
}

export async function closeOffscreen(): Promise<void> {
  if (creating) await creating.catch(() => undefined);
  if (await hasOffscreen()) await browser.offscreen.closeDocument();
}
