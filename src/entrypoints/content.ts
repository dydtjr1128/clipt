import { listen, send } from '@/shared/messages';
import { hideFixed, isCapturing, prepare, probe, restore, scrollToY } from '@/content/page';

declare global {
  interface Window {
    __cliptContent?: true;
  }
}

// 콘텐츠 스크립트: 필요할 때만 chrome.scripting으로 주입한다 (docs/architecture.md 4절)
export default defineContentScript({
  registration: 'runtime',
  main() {
    // 같은 문서에 두 번 주입돼도 리스너가 중복 등록되지 않게 한다
    if (window.__cliptContent) return;
    window.__cliptContent = true;

    listen('content', {
      'content:ping': () => 'pong' as const,
      'page:probe': () => probe(),
      'page:prepare': ({ hideScrollbar }) => {
        prepare({ hideScrollbar });
        return null;
      },
      'page:hideFixed': () => hideFixed(),
      'page:scrollTo': ({ y, lazyWaitMs }) => scrollToY(y, lazyWaitMs),
      'page:restore': () => {
        restore();
        return null;
      },
    });

    // 전체 페이지 캡처 도중 Esc로 중단한다. 복원은 서비스 워커의 stitch finally에서 한다
    addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !isCapturing()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void send('background', 'job:cancel', {}).catch(() => undefined);
      },
      true,
    );

    // 페이지를 떠날 때 캡처 도중 바꾼 스타일이 남지 않게 한다
    addEventListener('pagehide', () => restore());
  },
});
