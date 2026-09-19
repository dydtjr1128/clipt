import { send, type SelectKind } from '@/shared/messages';
import { probe, setCaptureTarget, settleFrames } from './page';
import { startRegionSelector, type RegionTarget } from './region-selector';
import { startElementSession } from './element-session';

/**
 * 선택 UI 수명 관리. 한 번에 하나만 띄우고, 확정·취소를 서비스 워커에 알린다.
 * 확정 시 오버레이를 지우고 두 프레임 뒤 페이지를 측정해 보낸다(오버레이가 결과에 찍히지 않게).
 */
let active: { jobId: string; dispose: () => void } | null = null;

export function cancelSelection(): void {
  active?.dispose();
  active = null;
}

async function confirm(
  jobId: string,
  target: RegionTarget,
  extra: { selector?: string; element?: Element; warnings?: string[] } = {},
): Promise<void> {
  active = null;
  // 요소 캡처면 고정 요소를 숨길 때 대상 요소는 남긴다
  setCaptureTarget(extra.element ?? null);
  await settleFrames();
  await send('background', 'select:done', {
    jobId,
    target,
    page: probe(),
    ...(extra.selector ? { selector: extra.selector } : {}),
    ...(extra.warnings?.length ? { warnings: extra.warnings } : {}),
  });
}

export function startSelection(jobId: string, kind: SelectKind, forRecording: boolean): void {
  cancelSelection();
  if (kind === 'element') {
    const dispose = startElementSession({
      forRecording,
      onConfirm: (target, selector, element, warnings) => {
        void confirm(jobId, target, { selector, element, warnings }).catch(() => undefined);
      },
      onCancel: () => {
        active = null;
        void send('background', 'select:cancelled', { jobId }).catch(() => undefined);
      },
    });
    active = { jobId, dispose };
    return;
  }
  const dispose = startRegionSelector({
    forRecording,
    onConfirm: (target, overlay) => {
      overlay.dispose();
      void confirm(jobId, target).catch(() => undefined);
    },
    onCancel: () => {
      active = null;
      void send('background', 'select:cancelled', { jobId }).catch(() => undefined);
    },
  });
  active = { jobId, dispose };
}
