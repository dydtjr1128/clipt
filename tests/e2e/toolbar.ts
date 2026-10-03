import type { BrowserContext, CDPSession, Page } from '@playwright/test';

/**
 * 실제 툴바 아이콘 클릭(activeTab 부여)과 그 팝업 조작. 배포 빌드 E2E 전용.
 * CDP `Extensions.triggerAction`은 `--enable-unsafe-extension-debugging`과 파이프 연결(Playwright 기본)이 필요하다.
 * 툴바 팝업은 Playwright Page로 잡히지 않아 CDP 세션(`Target.attachToTarget` + `sendMessageToTarget`)으로 조작한다.
 * 이 방식이 막히면 이 파일만 바꾸면 되게 한곳에 모은다.
 */
interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
}

export interface ToolbarPopup {
  /** 팝업 문서에서 식을 평가한다(값은 JSON으로 돌아온다) */
  evaluate<T>(expression: string): Promise<T>;
  /** 조건이 참이 될 때까지 기다린다 */
  waitFor(expression: string, timeoutMs?: number): Promise<void>;
  /** 요소가 나타나 활성화되면 누른다 */
  click(selector: string): Promise<void>;
}

async function browserSession(context: BrowserContext): Promise<CDPSession> {
  const browser = context.browser();
  if (!browser) throw new Error('browser-level CDP session unavailable');
  return browser.newBrowserCDPSession();
}

async function targets(session: CDPSession): Promise<TargetInfo[]> {
  const { targetInfos } = (await session.send('Target.getTargets', {
    filter: [{}],
  } as never)) as unknown as { targetInfos: TargetInfo[] };
  return targetInfos;
}

/** page의 탭에서 확장 아이콘을 누르고 열린 팝업을 돌려준다 */
export async function clickToolbar(
  context: BrowserContext,
  page: Page,
  extensionId: string,
): Promise<ToolbarPopup> {
  const session = await browserSession(context);
  const url = page.url();
  const tab = (await targets(session)).find((t) => t.type === 'tab' && t.url === url);
  if (!tab) throw new Error(`tab target not found: ${url}`);
  const before = new Set((await targets(session)).map((t) => t.targetId));
  await session.send(
    'Extensions.triggerAction' as never,
    {
      id: extensionId,
      targetId: tab.targetId,
    } as never,
  );

  let popup: TargetInfo | undefined;
  for (let i = 0; i < 100 && !popup; i++) {
    popup = (await targets(session)).find(
      (t) => t.type === 'page' && t.url.endsWith('/popup.html') && !before.has(t.targetId),
    );
    if (!popup) await new Promise((r) => setTimeout(r, 100));
  }
  if (!popup) throw new Error('toolbar popup did not open');

  const { sessionId } = (await session.send('Target.attachToTarget', {
    targetId: popup.targetId,
    flatten: false,
  } as never)) as unknown as { sessionId: string };
  let seq = 0;
  const pending = new Map<number, (message: Record<string, unknown>) => void>();
  session.on(
    'Target.receivedMessageFromTarget' as never,
    ((event: { sessionId: string; message: string }) => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message) as { id?: number };
      if (message.id !== undefined) pending.get(message.id)?.(message);
    }) as never,
  );
  const call = (method: string, params: object) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      void session.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id, method, params }),
      } as never);
    });

  const api: ToolbarPopup = {
    async evaluate<T>(expression: string) {
      const response = (await call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })) as { result?: { result?: { value?: T }; exceptionDetails?: unknown } };
      if (response.result?.exceptionDetails) {
        throw new Error(
          `popup evaluate failed: ${JSON.stringify(response.result.exceptionDetails)}`,
        );
      }
      return response.result?.result?.value as T;
    },
    async waitFor(expression, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (!(await api.evaluate<boolean>(`Boolean(${expression})`))) {
        if (Date.now() > deadline) throw new Error(`popup condition timed out: ${expression}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async click(selector) {
      // 팝업은 대상 탭 상태를 받은 뒤에 메뉴를 활성화한다. 그 전의 클릭은 무시되므로 활성화를 기다린다
      await api.waitFor(
        `(el => el && !el.disabled)(document.querySelector(${JSON.stringify(selector)}))`,
      );
      await api.evaluate(`document.querySelector(${JSON.stringify(selector)}).click(), true`);
    },
  };
  return api;
}
