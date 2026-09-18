import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { Job } from '@/core/job';
import type { TabAccess } from '@/core/restricted';
import { shortcutMap } from '@/core/menu';
import { send } from '@/shared/messages';

const JOB_KEY = 'job';
const LAST_ERROR_KEY = 'lastError';

export interface LastError {
  code: string;
  message: string;
  at: number;
}

/**
 * storage.session의 작업·최근 오류를 구독한다 (docs/architecture.md 5절).
 * 팝업을 다시 열면 저장된 현재 상태를 즉시 읽는다.
 */
export function useSessionState(): {
  loaded: boolean;
  job: Job | null;
  lastError: LastError | null;
} {
  const [state, setState] = useState<{
    loaded: boolean;
    job: Job | null;
    lastError: LastError | null;
  }>({ loaded: false, job: null, lastError: null });

  useEffect(() => {
    let alive = true;
    void browser.storage.session.get([JOB_KEY, LAST_ERROR_KEY]).then((stored) => {
      if (!alive) return;
      setState({
        loaded: true,
        job: (stored[JOB_KEY] as Job | undefined) ?? null,
        lastError: (stored[LAST_ERROR_KEY] as LastError | undefined) ?? null,
      });
    });
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
      if (area !== 'session') return;
      setState((prev) => ({
        ...prev,
        ...(JOB_KEY in changes ? { job: (changes[JOB_KEY]?.newValue as Job) ?? null } : {}),
        ...(LAST_ERROR_KEY in changes
          ? { lastError: (changes[LAST_ERROR_KEY]?.newValue as LastError) ?? null }
          : {}),
      }));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return state;
}

export function clearLastError(): Promise<void> {
  return browser.storage.session.remove(LAST_ERROR_KEY);
}

/**
 * 팝업이 대상으로 삼을 탭과 사용 가능 여부.
 * 기본은 현재 창의 활성 탭이며, `?tabId=`가 있으면 그 탭을 쓴다(개발·E2E 확인용).
 */
export function useTargetTab(): { tabId: number | null; access: TabAccess | null } {
  const [state, setState] = useState<{ tabId: number | null; access: TabAccess | null }>({
    tabId: null,
    access: null,
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const param = new URLSearchParams(location.search).get('tabId');
      let tabId = param ? Number(param) : NaN;
      if (Number.isNaN(tabId)) {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id ?? NaN;
      }
      if (Number.isNaN(tabId)) {
        if (alive) setState({ tabId: null, access: { available: false, reason: 'no-access' } });
        return;
      }
      const access = await send('background', 'tab:status', { tabId }).catch((): TabAccess => ({
        available: false,
        reason: 'no-access',
      }));
      if (alive) setState({ tabId, access });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** 명령 이름 → 설정된 단축키 */
export function useShortcuts(): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void browser.commands
      .getAll()
      .then((commands) => setMap(shortcutMap(commands)))
      .catch(() => undefined);
  }, []);
  return map;
}

/** intervalMs마다 갱신되는 현재 시각 */
export function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}
