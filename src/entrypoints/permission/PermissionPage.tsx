import { useState } from 'preact/hooks';
import { t } from '@/shared/i18n';

/**
 * 마이크 권한 요청 페이지 (docs/ux-design.md 9절).
 * 오프스크린 문서는 권한 프롬프트를 띄울 수 없어 확장 페이지에서 한 번 받는다.
 * 같은 확장 origin이므로 허용하면 오프스크린에서도 마이크를 쓸 수 있다.
 */
type State = 'idle' | 'granted' | 'denied';

export function PermissionPage() {
  const [state, setState] = useState<State>('idle');

  async function request() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      setState('granted');
      setTimeout(() => window.close(), 1000);
    } catch {
      setState('denied');
    }
  }

  return (
    <main class="permission">
      <h1>
        <span aria-hidden="true">{'🎤'}</span> {t('permTitle')}
      </h1>
      <p>{t('permBody')}</p>
      {state === 'idle' && (
        <>
          <button type="button" class="permission-button" onClick={() => void request()}>
            {t('permAllow')}
          </button>
          <p class="permission-note">{t('permAutoClose')}</p>
        </>
      )}
      {state === 'granted' && (
        <p class="permission-result is-ok" role="status">
          {t('permDone')}
        </p>
      )}
      {state === 'denied' && (
        <p class="permission-result is-denied" role="alert">
          {t('permDenied')}
        </p>
      )}
    </main>
  );
}
