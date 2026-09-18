import { CliptError } from '@/core/errors';
import type { Job } from '@/core/job';
import type { PageProbe } from '@/core/page';
import type { Settings } from '@/core/settings';
import { pieceRects, planStitch } from '@/core/stitch-plan';
import { sendToTab } from '@/shared/messages';
import { captureShot } from './capture-service';
import { getJob, patchJob } from './jobs';

/**
 * 문서의 세로 범위를 스크롤하며 찍어 한 장으로 잇는다 (docs/architecture.md 8.1절).
 * 서비스 워커의 OffscreenCanvas에서 그리며, 결과는 항상 PNG/JPEG Blob이다.
 * 끝나거나 실패·취소되면 페이지 상태를 복원한다.
 */
export interface StitchTarget {
  /** 문서 기준 CSS px */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StitchResult {
  blob: Blob;
  width: number;
  height: number;
  /** 캔버스 한계로 줄인 배율. 1이면 원본 */
  scale: number;
}

async function decode(dataUrl: string): Promise<ImageBitmap> {
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

/** 사용자가 도중에 취소하면 작업이 사라진다 */
async function assertActive(jobId: string): Promise<void> {
  if ((await getJob())?.id !== jobId) throw new CliptError('NO_JOB', 'cancelled');
}

export async function stitchCapture(
  job: Job,
  windowId: number,
  page: PageProbe,
  target: StitchTarget,
  settings: Settings,
): Promise<StitchResult> {
  const plan = planStitch({
    target,
    viewport: page.viewport,
    scrollHeight: page.scrollSize.h,
    currentScrollY: page.scroll.y,
    dpr: page.dpr,
  });
  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new CliptError('CANVAS_TOO_LARGE');
  ctx.imageSmoothingQuality = 'high';

  const multi = plan.pieces.length > 1;
  try {
    await sendToTab(job.tabId, 'page:prepare', { hideScrollbar: multi });
    for (const [index, piece] of plan.pieces.entries()) {
      await assertActive(job.id);
      if (multi) {
        await patchJob(job.id, { progress: { done: index, total: plan.pieces.length } });
      }
      // 첫 조각 이후에는 고정 헤더 등이 반복해서 찍히지 않도록 숨긴다
      if (index === 1 && settings.fullpage.hideFixed) {
        await sendToTab(job.tabId, 'page:hideFixed', null);
      }
      const scrollY = multi
        ? await sendToTab(job.tabId, 'page:scrollTo', {
            y: piece.scrollY,
            lazyWaitMs: settings.fullpage.lazyWaitMs,
          })
        : page.scroll.y;
      const bitmap = await decode(await captureShot(windowId, { format: 'png' }));
      try {
        const r = pieceRects(piece, scrollY, target, page.dpr, plan.scale);
        ctx.drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
      } finally {
        bitmap.close();
      }
    }
    if (multi) {
      await patchJob(job.id, {
        progress: { done: plan.pieces.length, total: plan.pieces.length },
      });
    }
  } finally {
    await sendToTab(job.tabId, 'page:restore', null).catch(() => undefined);
  }

  const type = settings.image.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await canvas.convertToBlob(
    type === 'image/jpeg' ? { type, quality: settings.image.jpegQuality } : { type },
  );
  return { blob, width: plan.width, height: plan.height, scale: plan.scale };
}
