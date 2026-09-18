import { CAPTURE_MODES, RECORD_MODES } from '@/core/job';
import { RECORDING_MENU, SCREENSHOT_MENU, shortcutMap } from '@/core/menu';
import { formatElapsed } from '@/core/time';

describe('formatElapsed', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [65_000, '01:05'],
    [59 * 60_000 + 59_000, '59:59'],
    [3_600_000 + 2 * 60_000 + 3_000, '1:02:03'],
    [-5_000, '00:00'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});

describe('menu', () => {
  it('스크린샷 4종·녹화 3종을 빠짐없이 한 번씩 담는다', () => {
    expect(SCREENSHOT_MENU.map((i) => i.mode).sort()).toEqual([...CAPTURE_MODES].sort());
    expect(RECORDING_MENU.map((i) => i.mode).sort()).toEqual([...RECORD_MODES].sort());
  });

  it('명령 이름이 겹치지 않는다', () => {
    const commands = [...SCREENSHOT_MENU, ...RECORDING_MENU].map((i) => i.command);
    expect(new Set(commands).size).toBe(commands.length);
  });

  it('shortcutMap은 할당된 단축키만 담는다', () => {
    const map = shortcutMap([
      { name: 'capture-visible', shortcut: 'Alt+Shift+1' },
      { name: 'capture-region', shortcut: '' },
      { name: '_execute_action' },
    ]);
    expect([...map]).toEqual([['capture-visible', 'Alt+Shift+1']]);
  });
});
