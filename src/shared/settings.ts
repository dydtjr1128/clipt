import { browser } from 'wxt/browser';
import { resolveSettings, withSetting, type Settings } from '@/core/settings';

/** 설정은 storage.sync의 `settings` 키에 저장한다. 브라우저를 다시 켜도, 다른 기기에서도 유지된다 */
export const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return resolveSettings(stored[SETTINGS_KEY]);
}

/** 한 항목을 바꿔 곧바로 저장한다(저장 버튼 없음) */
export async function saveSetting(path: string, value: unknown): Promise<Settings> {
  const next = withSetting(await loadSettings(), path, value);
  await browser.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

/** 다른 화면(팝업↔옵션 페이지)에서 바뀐 설정을 받는다. 반환값은 구독 해제 */
export function watchSettings(onChange: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
    if (area === 'sync' && SETTINGS_KEY in changes) {
      onChange(resolveSettings(changes[SETTINGS_KEY]?.newValue));
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
