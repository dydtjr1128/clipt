import { CliptError } from '@/core/errors';
import type { Job } from '@/core/job';
import type { AreaCapture, PageProbe } from '@/core/page';
import type { Settings } from '@/core/settings';
import { pieceRects, planStitch, type StitchPlan } from '@/core/stitch-plan';
import { sendToTab } from '@/shared/messages';
import { captureShot } from './capture-service';
import { getJob, patchJob } from './jobs';

/**
 * 문서의 세로 범위를 스크롤하며 찍어 한 장으로 잇는다 (docs/architecture.md 8.1절).
 * 앱형 페이지는 문서 대신 안쪽 스크롤 영역을 스크롤한다.
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
  /** 문서 대신 스크롤 영역을 스크롤해 찍었는지 */
  scrolledArea: boolean;
}

export interface StitchOptions {
  /**
   * 몇 번째 조각부터 fixed·sticky 요소를 숨길지. 전체 페이지·영역은 1(첫 화면에는 헤더를 남김),
   * 요소는 0(고정 헤더가 요소 위를 덮지 않게). null이면 숨기지 않는다
   */
  hideFixedFrom?: number | null;
  /**
   * 문서 대신 스크롤할 영역. main은 전체 페이지의 가장 큰 안쪽 스크롤 영역, target은 선택한 요소를 가린
   * 스크롤 영역이며 대상 범위는 콘텐츠가 영역 기준으로 다시 잰다. 영역을 쓸 수 없으면 문서 기준 target으로 찍는다
   */
  area?: 'main' | 'target';
}

async function decode(dataUrl: string): Promise<ImageBitmap> {
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

/** 사용자가 도중에 취소하면 작업이 사라진다 */
async function assertActive(jobId: string): Promise<void> {
  if ((await getJob())?.id !== jobId) throw new CliptError('NO_JOB', 'cancelled');
}

function createCanvas(plan: StitchPlan): {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
} {
  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new CliptError('CANVAS_TOO_LARGE');
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

async function drawPieces(
  job: Job,
  windowId: number,
  page: PageProbe,
  target: StitchTarget,
  settings: Settings,
  options: StitchOptions,
): Promise<{ canvas: OffscreenCanvas; plan: StitchPlan; area: AreaCapture | null }> {
  const hideFixedFrom = settings.fullpage.hideFixed ? (options.hideFixedFrom ?? 1) : null;
  // 영역은 먼저 준비해야(화면 안으로 옮기고 다시 잼) 계획할 수 있다. 문서는 계획한 조각 수로 스크롤바를 정한다
  const area = options.area
    ? await sendToTab(job.tabId, 'page:prepare', { hideScrollbar: false, area: options.area })
    : null;
  const plan = planStitch(
    area
      ? {
          target: area.target,
          viewport: { w: area.box.w, h: area.box.h },
          scrollHeight: area.scrollHeight,
          currentScrollY: area.scrollTop,
          dpr: page.dpr,
        }
      : {
          target,
          viewport: page.viewport,
          scrollHeight: page.scrollSize.h,
          currentScrollY: page.scroll.y,
          dpr: page.dpr,
        },
  );
  const { canvas, ctx } = createCanvas(plan);
  const multi = plan.pieces.length > 1;
  if (!area) await sendToTab(job.tabId, 'page:prepare', { hideScrollbar: multi });
  // 영역을 스크롤하면 영역 안의 sticky 머리도 조각마다 반복되므로, 두 번째 조각부터는 대상 안의 요소도 숨긴다
  const hideAllFrom = area && hideFixedFrom !== null ? Math.max(hideFixedFrom, 1) : null;

  for (const [index, piece] of plan.pieces.entries()) {
    await assertActive(job.id);
    if (multi) {
      await patchJob(job.id, { progress: { done: index, total: plan.pieces.length } });
    }
    // 고정 헤더 등이 반복해서(요소 캡처면 요소 위에) 찍히지 않도록 숨긴다
    const hideNow = index === hideFixedFrom || index === hideAllFrom;
    if (hideNow) {
      await sendToTab(job.tabId, 'page:hideFixed', {
        keepDescendants: hideAllFrom === null || index < hideAllFrom,
      });
    }
    // 스크롤하거나 스타일을 바꿨으면 렌더가 안정될 때까지 기다린다. 조각이 하나여도 계획한 위치가 지금과 다르면
    // (영역을 그린 뒤 화면 밖으로 스크롤) 스크롤해야 한다. 스크롤 영역은 준비하며 창을 옮겼을 수 있어 항상 기다린다.
    // 자를 위치는 응답받은 실제 위치로 계산한다
    const scrollY =
      area || multi || hideNow || piece.scrollY !== page.scroll.y
        ? await sendToTab(job.tabId, 'page:scrollTo', {
            y: piece.scrollY,
            lazyWaitMs: settings.fullpage.lazyWaitMs,
          })
        : page.scroll.y;
    const bitmap = await decode(await captureShot(windowId, { format: 'png' }));
    try {
      const r = area
        ? pieceRects(piece, scrollY, area.target, page.dpr, plan.scale, area.box.y)
        : pieceRects(piece, scrollY, target, page.dpr, plan.scale);
      ctx.drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
    } finally {
      bitmap.close();
    }
  }
  if (multi) {
    await patchJob(job.id, { progress: { done: plan.pieces.length, total: plan.pieces.length } });
  }
  return { canvas, plan, area };
}

export async function stitchCapture(
  job: Job,
  windowId: number,
  page: PageProbe,
  target: StitchTarget,
  settings: Settings,
  options: StitchOptions = {},
): Promise<StitchResult> {
  let drawn: Awaited<ReturnType<typeof drawPieces>>;
  try {
    drawn = await drawPieces(job, windowId, page, target, settings, options);
  } finally {
    await sendToTab(job.tabId, 'page:restore', null).catch(() => undefined);
  }

  const { canvas, plan, area } = drawn;
  const type = settings.image.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await canvas.convertToBlob(
    type === 'image/jpeg' ? { type, quality: settings.image.jpegQuality } : { type },
  );
  return {
    blob,
    width: plan.width,
    height: plan.height,
    scale: plan.scale,
    scrolledArea: area !== null,
  };
}
