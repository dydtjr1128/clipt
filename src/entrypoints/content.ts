import { listen } from '@/shared/messages';

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
    });
  },
});
