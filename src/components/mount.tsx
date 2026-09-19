import { render, type ComponentChild } from 'preact';
import { browser } from 'wxt/browser';
import '@/styles/page.css';

/** 확장 페이지의 루트(#app)에 Preact 트리를 붙인다. */
export function mount(node: ComponentChild): void {
  // HTML의 lang은 빌드 시 ko로 고정돼 있어 실제 UI 언어로 맞춘다(스크린 리더 발음, 글꼴 선택)
  // @@ui_locale은 실제로 메시지를 고른 로케일이다(예: ko, en_US)
  document.documentElement.lang =
    browser.i18n.getMessage('@@ui_locale' as never).replace('_', '-') || 'ko';
  const root = document.getElementById('app');
  if (!root) throw new Error('#app root element is missing');
  render(node, root);
}
