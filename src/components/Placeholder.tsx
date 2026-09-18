import { t } from '@/shared/i18n';

/** 아직 구현되지 않은 확장 페이지의 공통 임시 화면 */
export function Placeholder() {
  return (
    <main class="placeholder">
      <h1>{t('appShortName')}</h1>
      <p>{t('placeholderComingSoon')}</p>
    </main>
  );
}
