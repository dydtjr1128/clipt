import { t, type MessageKey } from '@/shared/i18n';
import { createOverlay, el } from './overlay/host';
import { settleFrames } from './page';

/**
 * 녹화 시작 전 카운트다운 (docs/ux-design.md 7절).
 * 끝나면 오버레이를 지우고 두 프레임 뒤에 알려 첫 프레임에 찍히지 않게 한다. Esc로 취소.
 */
let cancelCurrent: (() => void) | null = null;

export function cancelCountdown(): void {
  cancelCurrent?.();
}

const MODE_LABEL: Record<string, MessageKey> = {
  'rec-tab': 'countdownTab',
  'rec-region': 'countdownRegion',
  'rec-element': 'countdownElement',
};

/** true: 카운트다운 완료, false: 취소 */
export function runCountdown(seconds: number, mode: string): Promise<boolean> {
  cancelCountdown();
  return new Promise<boolean>((resolve) => {
    const overlay = createOverlay('countdown');
    const wrap = el('div', 'countdown', { role: 'timer', 'aria-live': 'assertive' });
    const label = el('div', 'countdown-label');
    label.textContent = `${t(MODE_LABEL[mode] ?? 'countdownTab')} · Esc`;
    const number = el('div', 'countdown-number');
    wrap.append(label, number);
    overlay.layer.append(wrap);

    let remaining = seconds;
    let done = false;
    const show = () => {
      number.textContent = String(remaining);
      number.classList.remove('is-tick');
      void number.offsetWidth;
      number.classList.add('is-tick');
    };
    show();

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      removeEventListener('keydown', onKey, true);
      cancelCurrent = null;
      overlay.dispose();
      void settleFrames().then(() => resolve(ok));
    };
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) finish(true);
      else show();
    }, 1000);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(false);
    };
    addEventListener('keydown', onKey, true);
    cancelCurrent = () => finish(false);
  });
}
