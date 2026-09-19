import type { ResultMeta } from '@/shared/db';
import { t, type MessageKey } from '@/shared/i18n';

/** 결과에 남은 주의 사항을 배너로 보여 준다 (docs/ux-design.md 8절) */
const FORMAT_NAME: Record<string, string> = {
  mp4: 'MP4',
  'webm-vp9': 'WebM VP9',
  'webm-vp8': 'WebM VP8',
  'webm-av1': 'WebM AV1',
};

const WARNING_MESSAGE: Record<string, MessageKey> = {
  'layout-changed': 'noticeLayoutChanged',
  'max-length': 'noticeMaxLength',
  'mic-unavailable': 'noticeMicUnavailable',
  'internal-scroll': 'noticeInternalScroll',
  clipped: 'noticeClipped',
  recovered: 'noticeRecovered',
};

export function noticesOf(meta: ResultMeta): string[] {
  const notices: string[] = [];
  if (meta.fallbackReason) {
    const saved = meta.mime.startsWith('video/mp4') ? 'MP4' : 'WebM';
    notices.push(
      t('noticeFallback', [FORMAT_NAME[meta.fallbackReason] ?? meta.fallbackReason, saved]),
    );
  }
  if (meta.scaled !== undefined && meta.scaled < 1) {
    notices.push(t('noticeScaled', String(Math.round(meta.scaled * 100))));
  }
  for (const warning of meta.warnings ?? []) {
    const key = WARNING_MESSAGE[warning];
    if (key) notices.push(t(key));
  }
  return notices;
}

export function ResultNotices({ meta }: { meta: ResultMeta }) {
  const notices = noticesOf(meta);
  if (notices.length === 0) return null;
  return (
    <aside class="banner banner-warn" role="status" data-banner="notices">
      <ul class="banner-list">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </aside>
  );
}
