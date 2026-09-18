import { render, type ComponentChild } from 'preact';
import '@/styles/page.css';

/** 확장 페이지의 루트(#app)에 Preact 트리를 붙인다. */
export function mount(node: ComponentChild): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app root element is missing');
  render(node, root);
}
