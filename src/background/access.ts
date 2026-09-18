import { browser } from 'wxt/browser';
import { CliptError } from '@/core/errors';
import { restrictionOf, type TabAccess } from '@/core/restricted';
import { sendToTab } from '@/shared/messages';

/**
 * 탭 접근 확인과 콘텐츠 스크립트 동적 주입 (docs/architecture.md 4·13절).
 * host 권한 없이 activeTab만 쓰므로, 툴바 클릭·단축키로 권한이 부여된 탭에서만 동작한다.
 */
const CONTENT_SCRIPT = '/content-scripts/content.js';

export async function checkTab(tabId: number): Promise<TabAccess> {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab) throw new CliptError('TAB_CLOSED', `Tab ${tabId} does not exist`);

  const fileAccess = await browser.extension.isAllowedFileSchemeAccess().catch(() => false);
  const reason = restrictionOf(tab.url, { fileAccess });
  if (reason) return { available: false, reason };

  // URL로 걸러지지 않는 제한(정책 차단, activeTab 미부여)은 실제 주입으로 확인한다
  try {
    await browser.scripting.executeScript({ target: { tabId }, func: () => true });
    return { available: true };
  } catch {
    return { available: false, reason: 'no-access' };
  }
}

/** 작업 전 호출: 제한 페이지면 RESTRICTED_PAGE로 거부한다 */
export async function assertTabAvailable(tabId: number): Promise<void> {
  const access = await checkTab(tabId);
  if (!access.available) throw new CliptError('RESTRICTED_PAGE', access.reason);
}

/** 콘텐츠 스크립트가 없을 때만 주입한다. PING 응답으로 중복 주입을 막는다 */
export async function ensureContentScript(tabId: number): Promise<void> {
  const alive = await sendToTab(tabId, 'content:ping', null).catch(() => null);
  if (alive === 'pong') return;
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
  } catch (error) {
    throw new CliptError('RESTRICTED_PAGE', error instanceof Error ? error.message : 'no-access');
  }
}
