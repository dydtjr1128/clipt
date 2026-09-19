import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { t } from '@/shared/i18n';
import { discardRecording, orphanRecordings, recoverRecording } from '@/shared/recover';

/** 비정상 종료로 저장되지 못한 녹화가 있으면 복구·삭제를 제안한다 (docs/ux-design.md 8절) */
export function RecoveryBanner() {
  const [orphans, setOrphans] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await browser.storage.session.get('job');
      const active = (stored.job as { id?: string } | undefined)?.id;
      setOrphans(await orphanRecordings(active));
    })().catch(() => undefined);
  }, []);

  if (orphans.length === 0) return null;
  const jobId = orphans[0]!;

  async function recover() {
    setBusy(true);
    const resultId = await recoverRecording(jobId).catch(() => null);
    if (resultId) location.href = `result.html?id=${encodeURIComponent(resultId)}`;
    else setOrphans((list) => list.slice(1));
    setBusy(false);
  }

  async function discard() {
    setBusy(true);
    await discardRecording(jobId).catch(() => undefined);
    setOrphans((list) => list.slice(1));
    setBusy(false);
  }

  return (
    <aside class="banner banner-warn" role="alert" data-banner="recovery">
      <span class="banner-text">{t('recoverMessage')}</span>
      <button
        type="button"
        class="banner-btn is-primary"
        disabled={busy}
        onClick={() => void recover()}
      >
        {t('recoverAction')}
      </button>
      <button type="button" class="banner-btn" disabled={busy} onClick={() => void discard()}>
        {t('recoverDiscard')}
      </button>
    </aside>
  );
}
