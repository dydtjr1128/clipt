import { browser } from 'wxt/browser';
import { resolveSettings, type Settings } from '@/core/settings';

/** 설정은 storage.sync의 `settings` 키에 저장한다 */
export const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return resolveSettings(stored[SETTINGS_KEY]);
}
