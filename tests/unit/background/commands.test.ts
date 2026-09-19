import { handleCommand, type CommandActions } from '@/background/commands';
import { CliptError } from '@/core/errors';
import type { Job } from '@/core/job';
import { RECORDING_MENU, SCREENSHOT_MENU, SUGGESTED_KEYS, modeOfCommand } from '@/core/menu';

function setup(job: Job | null, startError?: unknown) {
  const actions = {
    getJob: vi.fn(async () => job),
    start: vi.fn(async () => {
      if (startError) throw startError;
    }),
    stop: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    reportError: vi.fn(async () => undefined),
  } satisfies CommandActions;
  return actions;
}

const job = (mode: Job['mode'], phase: Job['phase']): Job => ({
  id: 'j',
  mode,
  phase,
  tabId: 1,
  windowId: 1,
  createdAt: 0,
});

describe('handleCommand', () => {
  it('작업이 없으면 명령에 해당하는 모드를 시작한다', async () => {
    const a = setup(null);
    expect(await handleCommand('capture-region', 7, a)).toBe('started');
    expect(a.start).toHaveBeenCalledWith('region', 7);
  });

  it('녹화 중 토글 키는 저장하고 중지한다(영역·요소 녹화 포함)', async () => {
    const a = setup(job('rec-region', 'recording'));
    expect(await handleCommand('toggle-recording', 1, a)).toBe('stopped');
    expect(a.stop).toHaveBeenCalledWith('j');
    expect(a.start).not.toHaveBeenCalled();
  });

  it('카운트다운 중 토글 키는 취소한다', async () => {
    const a = setup(job('rec-tab', 'countdown'));
    expect(await handleCommand('toggle-recording', 1, a)).toBe('cancelled');
    expect(a.cancel).toHaveBeenCalled();
  });

  it('선택 중 같은 단축키를 다시 누르면 취소, 다른 단축키는 무시', async () => {
    const a = setup(job('element', 'selecting'));
    expect(await handleCommand('capture-element', 1, a)).toBe('cancelled');
    const b = setup(job('element', 'selecting'));
    expect(await handleCommand('capture-visible', 1, b)).toBe('ignored');
    expect(b.start).not.toHaveBeenCalled();
    expect(b.cancel).not.toHaveBeenCalled();
  });

  it('제한 페이지 등 시작 실패는 사용자에게 알린다', async () => {
    const a = setup(null, new CliptError('RESTRICTED_PAGE', 'browser'));
    expect(await handleCommand('capture-visible', 1, a)).toBe('failed');
    expect(a.reportError).toHaveBeenCalledWith(expect.any(CliptError), 'visible');
  });

  it('모르는 명령은 무시한다', async () => {
    const a = setup(null);
    expect(await handleCommand('_execute_action', 1, a)).toBe('ignored');
    expect(a.getJob).not.toHaveBeenCalled();
  });
});

describe('명령 구성', () => {
  it('모든 메뉴 항목이 명령으로 연결되고 기본 단축키는 4개 이하', () => {
    for (const item of [...SCREENSHOT_MENU, ...RECORDING_MENU]) {
      expect(modeOfCommand(item.command)).toBe(item.mode);
    }
    const suggested = Object.keys(SUGGESTED_KEYS);
    expect(suggested.length).toBeLessThanOrEqual(4);
    for (const command of suggested) expect(modeOfCommand(command)).not.toBeNull();
    expect(new Set(Object.values(SUGGESTED_KEYS)).size).toBe(suggested.length);
  });
});
