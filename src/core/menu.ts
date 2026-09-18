import type { Mode } from './job';

/**
 * 팝업 메뉴 구성과 단축키 명령 이름 (docs/ux-design.md 3.1절, docs/architecture.md 13절).
 * 순서가 곧 화면 순서다.
 */
export interface MenuItem {
  mode: Mode;
  /** chrome.commands 명령 이름. 단축키 힌트 표시에 쓴다 */
  command: string;
  /** 화면 아이콘 문자 */
  icon: string;
}

export const SCREENSHOT_MENU: readonly MenuItem[] = [
  { mode: 'visible', command: 'capture-visible', icon: '▣' },
  { mode: 'fullpage', command: 'capture-fullpage', icon: '▤' },
  { mode: 'element', command: 'capture-element', icon: '◱' },
  { mode: 'region', command: 'capture-region', icon: '⬚' },
];

export const RECORDING_MENU: readonly MenuItem[] = [
  { mode: 'rec-tab', command: 'toggle-recording', icon: '●' },
  { mode: 'rec-region', command: 'record-region', icon: '⬚' },
  { mode: 'rec-element', command: 'record-element', icon: '◱' },
];

/** commands.getAll 결과에서 명령 이름 → 단축키 문자열 맵을 만든다. 미할당은 제외 */
export function shortcutMap(
  commands: readonly { name?: string; shortcut?: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const { name, shortcut } of commands) {
    if (name && shortcut) map.set(name, shortcut);
  }
  return map;
}
