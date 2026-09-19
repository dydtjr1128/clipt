import { useEffect, useState } from 'preact/hooks';
import { loadResult, type ResultMeta } from '@/shared/db';
import { t } from '@/shared/i18n';
import { ResultNotices } from './ResultNotices';

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; meta: ResultMeta; url: string };

/**
 * `result.html?id=…`의 결과를 IndexedDB에서 읽어 보여준다.
 * 미리보기 기본 동작만 담당하며 다운로드·복사·정보 패널은 #15에서 추가한다.
 */
export function ResultView({ id }: { id: string | null }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!id) {
      setState({ status: 'missing' });
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    loadResult(id)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setState({ status: 'missing' });
          return;
        }
        url = URL.createObjectURL(result.blob);
        setState({ status: 'ready', meta: result.meta, url });
      })
      .catch(() => !cancelled && setState({ status: 'missing' }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (state.status === 'loading') {
    return (
      <p class="result-status" aria-busy="true">
        {t('resultLoading')}
      </p>
    );
  }
  if (state.status === 'missing') {
    return <p class="result-status">{t('resultExpired')}</p>;
  }
  const { meta, url } = state;
  return (
    <>
      <ResultNotices meta={meta} />
      <main class="result" data-result-id={meta.id}>
        {meta.kind === 'image' ? (
          <img
            class="result-media"
            src={url}
            width={meta.width}
            height={meta.height}
            alt={t('resultImageAlt')}
          />
        ) : (
          <video class="result-media" src={url} controls />
        )}
      </main>
    </>
  );
}
