import {
  canTransition,
  initialPhase,
  isMode,
  needsSelection,
  restoreAction,
  type Mode,
  type Phase,
} from '@/core/job';

describe('initialPhase', () => {
  it.each<[Mode, Phase]>([
    ['visible', 'preparing'],
    ['fullpage', 'preparing'],
    ['region', 'selecting'],
    ['element', 'selecting'],
    ['rec-tab', 'countdown'],
    ['rec-region', 'selecting'],
    ['rec-element', 'selecting'],
  ])('%s → %s', (mode, phase) => {
    expect(initialPhase(mode)).toBe(phase);
    expect(needsSelection(mode)).toBe(phase === 'selecting');
  });
});

describe('canTransition', () => {
  it('캡처 흐름: selecting → preparing → capturing → finalizing', () => {
    expect(canTransition({ mode: 'region', phase: 'selecting' }, 'preparing')).toBe(true);
    expect(canTransition({ mode: 'region', phase: 'preparing' }, 'capturing')).toBe(true);
    expect(canTransition({ mode: 'region', phase: 'capturing' }, 'finalizing')).toBe(true);
  });

  it('녹화 흐름: selecting → countdown → recording → finalizing', () => {
    expect(canTransition({ mode: 'rec-region', phase: 'selecting' }, 'countdown')).toBe(true);
    expect(canTransition({ mode: 'rec-tab', phase: 'countdown' }, 'recording')).toBe(true);
    expect(canTransition({ mode: 'rec-tab', phase: 'recording' }, 'finalizing')).toBe(true);
  });

  it('모드에 맞지 않거나 단계를 건너뛰는 전이는 거부한다', () => {
    expect(canTransition({ mode: 'region', phase: 'selecting' }, 'countdown')).toBe(false);
    expect(canTransition({ mode: 'rec-region', phase: 'selecting' }, 'preparing')).toBe(false);
    expect(canTransition({ mode: 'visible', phase: 'preparing' }, 'finalizing')).toBe(false);
    expect(canTransition({ mode: 'rec-tab', phase: 'finalizing' }, 'recording')).toBe(false);
  });
});

describe('restoreAction', () => {
  it('선택·카운트다운 중인 작업은 유지한다', () => {
    expect(restoreAction({ mode: 'element', phase: 'selecting' }, false)).toBe('keep');
    expect(restoreAction({ mode: 'rec-tab', phase: 'countdown' }, false)).toBe('keep');
  });

  it('녹화 중 작업은 오프스크린이 살아 있을 때만 유지한다', () => {
    expect(restoreAction({ mode: 'rec-tab', phase: 'recording' }, true)).toBe('keep');
    expect(restoreAction({ mode: 'rec-tab', phase: 'recording' }, false)).toBe('abort');
  });

  it('서비스 워커가 진행하던 캡처 단계는 중단한다', () => {
    expect(restoreAction({ mode: 'fullpage', phase: 'capturing' }, true)).toBe('abort');
    expect(restoreAction({ mode: 'visible', phase: 'preparing' }, true)).toBe('abort');
    expect(restoreAction({ mode: 'region', phase: 'finalizing' }, true)).toBe('abort');
  });
});

it('isMode는 알려진 모드만 허용한다', () => {
  expect(isMode('rec-element')).toBe(true);
  expect(isMode('screen')).toBe(false);
  expect(isMode(1)).toBe(false);
});
