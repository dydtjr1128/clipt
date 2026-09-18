import { browser } from 'wxt/browser';
import { buildFilename } from '@/core/filename';
import type { Job } from '@/core/job';
import type { Settings } from '@/core/settings';
import type { ResultMeta } from '@/shared/db';
import { flashBadge } from './badge';

/**
 * 캡처 결과 배출 (docs/architecture.md 11절): 결과 페이지 열기 / 바로 다운로드 / 클립보드 복사.
 * 결과는 이미 IndexedDB에 저장돼 있으며, 다운로드·복사 실패 시 결과 페이지로 대신 연다.
 */
export type EmitOutcome = 'result' | 'download' | 'clipboard';

export async function openResultPage(job: Job, resultId: string): Promise<void> {
  const opener = await browser.tabs.get(job.tabId).catch(() => null);
  await browser.tabs.create({
    url: browser.runtime.getURL(`/result.html?id=${encodeURIComponent(resultId)}`),
    ...(opener
      ? { windowId: opener.windowId, index: opener.index + 1, openerTabId: job.tabId }
      : {}),
  });
}

async function download(meta: ResultMeta, dataUrl: string, settings: Settings): Promise<void> {
  await browser.downloads.download({
    url: dataUrl,
    filename: buildFilename(settings.download.pattern, {
      date: new Date(meta.createdAt),
      mode: meta.mode,
      mime: meta.mime,
    }),
    saveAs: settings.download.saveAs,
  });
}

/**
 * 대상 탭 문서에서 PNG를 클립보드에 쓴다. 팝업이 닫히면 포커스가 페이지로 돌아오므로
 * 페이지 문서가 클립보드 쓰기 조건(포커스)을 만족한다.
 */
async function copyToClipboard(tabId: number, pngDataUrl: string): Promise<void> {
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    args: [pngDataUrl],
    func: async (url: string) => {
      try {
        const blob = await (await fetch(url)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        return true;
      } catch {
        return false;
      }
    },
  });
  if (injection?.result !== true) throw new Error('clipboard write failed');
}

/** Blob을 dataURL로 바꾼다. 서비스 워커에는 URL.createObjectURL이 없어 다운로드·페이지 전달에 쓴다 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export async function emitCapture(
  job: Job,
  meta: ResultMeta,
  blob: Blob,
  settings: Settings,
): Promise<EmitOutcome> {
  try {
    if (settings.afterCapture === 'download') {
      const dataUrl = await blobToDataUrl(blob);
      await download(meta, dataUrl, settings);
      await flashBadge('✓');
      return 'download';
    }
    if (settings.afterCapture === 'clipboard' && meta.mime === 'image/png') {
      await copyToClipboard(job.tabId, await blobToDataUrl(blob));
      await flashBadge('✓');
      return 'clipboard';
    }
  } catch {
    // 다운로드·복사가 막혀도 결과는 저장돼 있으므로 결과 페이지로 연다
  }
  await openResultPage(job, meta.id);
  return 'result';
}
