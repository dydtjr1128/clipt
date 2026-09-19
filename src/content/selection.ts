import { send, type SelectKind } from '@/shared/messages';
import { probe, settleFrames } from './page';
import { startRegionSelector, type RegionTarget } from './region-selector';

/**
 * 선택 UI 수명 관리. 한 번에 하나만 띄우고, 확정·취소를 서비스 워커에 알린다.
 * 확정 시 오버레이를 지우고 두 프레임 뒤 페이지를 측정해 보낸다(오버레이가 결과에 찍히지 않게).
 */
let active: { jobId: string; dispose: () => void } | null = null;

export function cancelSelection(): void {
  active?.dispose();
  active = null;
}

async function confirm(jobId: string, target: RegionTarget, selector?: string): Promise<void> {
  active = null;
  await settleFrames();
  await send('background', 'select:done', {
    jobId,
    target,
    page: probe(),
    ...(selector ? { selector } : {}),
  });
}

export function startSelection(jobId: string, kind: SelectKind, forRecording: boolean): void {
  cancelSelection();
  if (kind !== 'region') {
    // 요소 선택 UI는 #8에서 추가한다
    void send('background', 'select:cancelled', { jobId });
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
