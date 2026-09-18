// 콘텐츠 스크립트: 필요할 때만 chrome.scripting으로 주입한다 (docs/architecture.md 4절)
export default defineContentScript({
  registration: 'runtime',
  main() {},
});
