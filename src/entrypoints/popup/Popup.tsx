import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ErrorCode } from '@/core/errors';
import { isRecordMode, type Job, type Mode } from '@/core/job';
import { RECORDING_MENU, SCREENSHOT_MENU, type MenuItem } from '@/core/menu';
import type { RestrictReason } from '@/core/restricted';
import { formatElapsed } from '@/core/time';
import { t, type MessageKey } from '@/shared/i18n';
import { send } from '@/shared/messages';
import { clearLastError, useNow, useSessionState, useShortcuts, useTargetTab } from './hooks';

/** 팝업 화면 (docs/ux-design.md 3절). 작업 상태에 따라 메뉴·선택 중·캡처 중·녹화 중 화면을 그린다 */

const MENU_LABEL: Record<Mode, MessageKey> = {
  visible: 'menuVisible',
  fullpage: 'menuFullpage',
  element: 'menuElement',
  region: 'menuRegion',
  'rec-tab': 'menuRecTab',
  'rec-region': 'menuRecRegion',
  'rec-element': 'menuRecElement',
};

const REC_MODE_LABEL: Partial<Record<Mode, MessageKey>> = {
  'rec-tab': 'modeTab',
  'rec-region': 'modeRegion',
  'rec-element': 'modeElement',
};

const ERROR_MESSAGE: Partial<Record<ErrorCode | string, MessageKey>> = {
  JOB_ACTIVE: 'errorJobActive',
  RESTRICTED_PAGE: 'errorRestricted',
  TAB_CLOSED: 'errorTabClosed',
  INTERRUPTED: 'errorInterrupted',
};

const NO_SHORTCUT = '–';
const HINT_KEY = 'popupHintShown';
const HINT_LIMIT = 3;

function errorText(code: string): string {
  return t(ERROR_MESSAGE[code] ?? 'errorGeneric');
}

export function Popup() {
  const { loaded, job, lastError } = useSessionState();
  const target = useTargetTab();
  const shortcuts = useShortcuts();

  if (!loaded) return null;

  return (
    <div class="popup">
      <Header />
      {lastError && (
        <Notice tone="warn" onDismiss={() => void clearLastError()}>
          {errorText(lastError.code)}
        </Notice>
      )}
      {job ? (
        <JobView job={job} shortcuts={shortcuts} />
      ) : (
        <Menu tabId={target.tabId} access={target.access} shortcuts={shortcuts} />
      )}
    </div>
  );
}

function Header() {
  return (
    <header class="popup-header">
      <h1 class="popup-title">
        <span aria-hidden="true">{'✂'}</span> {t('appShortName')}
      </h1>
      <div class="popup-actions">
        <button
          type="button"
          class="icon-button"
          title={t('popupSettings')}
          aria-label={t('popupSettings')}
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          <span aria-hidden="true">{'⚙'}</span>
        </button>
        <button
          type="button"
          class="icon-button"
          title={t('popupShortcuts')}
          aria-label={t('popupShortcuts')}
          onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
        >
          <span aria-hidden="true">{'⌨'}</span>
        </button>
      </div>
    </header>
  );
}

function Notice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'info' | 'warn';
  children: preact.ComponentChildren;
  onDismiss?: () => void;
}) {
  return (
    <div class={`notice notice-${tone}`} role={tone === 'warn' ? 'alert' : 'status'}>
      <div class="notice-body">{children}</div>
      {onDismiss && (
        <button
          type="button"
          class="icon-button"
          aria-label={t('commonDismiss')}
          title={t('commonDismiss')}
          onClick={onDismiss}
        >
          <span aria-hidden="true">{'✕'}</span>
        </button>
      )}
    </div>
  );
}

function restrictedMessage(reason: RestrictReason): MessageKey {
  return reason === 'file' ? 'restrictedFile' : 'restrictedBody';
}

function Menu({
  tabId,
  access,
  shortcuts,
}: {
  tabId: number | null;
  access: ReturnType<typeof useTargetTab>['access'];
  shortcuts: Map<string, string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Mode | null>(null);
  const [showHint, setShowHint] = useState(false);
  const checking = access === null;
  const restricted = access !== null && !access.available;
  const disabled = checking || restricted || tabId === null || pending !== null;

  useEffect(() => {
    void browser.storage.local.get(HINT_KEY).then((stored) => {
      const count = Number(stored[HINT_KEY] ?? 0);
      if (count >= HINT_LIMIT) return;
      setShowHint(true);
      void browser.storage.local.set({ [HINT_KEY]: count + 1 });
    });
  }, []);

  async function start(mode: Mode) {
    if (tabId === null) return;
    setPending(mode);
    setError(null);
    try {
      await send('background', 'job:start', { mode, tabId });
      window.close();
    } catch (e) {
      setError(errorText((e as { code?: string }).code ?? 'UNKNOWN'));
      setPending(null);
    }
  }

  const renderItem = (item: MenuItem) => (
    <li key={item.mode}>
      <button
        type="button"
        class="menu-item"
        data-mode={item.mode}
        disabled={disabled}
        onClick={() => void start(item.mode)}
      >
        <span class={`menu-icon${isRecordMode(item.mode) ? ' is-rec' : ''}`} aria-hidden="true">
          {item.icon}
        </span>
        <span class="menu-label">{t(MENU_LABEL[item.mode])}</span>
        <kbd class="menu-shortcut">{shortcuts.get(item.command) ?? NO_SHORTCUT}</kbd>
      </button>
    </li>
  );

  return (
    <>
      {restricted && access && !access.available && (
        <Notice tone="info">
          <strong class="notice-title">{t('restrictedTitle')}</strong>
          <span>{t(restrictedMessage(access.reason))}</span>
        </Notice>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
      <nav class={`menu${restricted ? ' is-restricted' : ''}`} aria-busy={checking}>
        <section>
          <h2 class="menu-heading">{t('popupScreenshots')}</h2>
          <ul>{SCREENSHOT_MENU.map(renderItem)}</ul>
        </section>
        <section>
          <h2 class="menu-heading">{t('popupRecording')}</h2>
          <ul>{RECORDING_MENU.map(renderItem)}</ul>
        </section>
      </nav>
      {showHint && !restricted && <p class="popup-hint">{t('hintEscCancel')}</p>}
    </>
  );
}

function JobView({ job, shortcuts }: { job: Job; shortcuts: Map<string, string> }) {
  if (job.phase === 'selecting') return <SelectingView job={job} />;
  if (isRecordMode(job.mode)) return <RecordingView job={job} shortcuts={shortcuts} />;
  return <BusyView job={job} />;
}

function SelectingView({ job }: { job: Job }) {
  const element = job.mode === 'element' || job.mode === 'rec-element';
  return (
    <section class="state" data-state="selecting">
      <h2 class="state-title">
        <span aria-hidden="true">{element ? '◱' : '⬚'}</span>{' '}
        {t(element ? 'selectingElement' : 'selectingRegion')}
      </h2>
      <p class="state-text">{t(element ? 'selectingHintElement' : 'selectingHintRegion')}</p>
      <div class="state-actions">
        <button
          type="button"
          class="button"
          onClick={() => void send('background', 'job:cancel', { jobId: job.id })}
        >
          {t('commonCancel')}
        </button>
      </div>
    </section>
  );
}

function BusyView({ job }: { job: Job }) {
  const progress = job.progress && job.progress.total > 1 ? job.progress : null;
  return (
    <section class="state" data-state="busy" aria-busy="true">
      <h2 class="state-title">{t('busyCapturing')}</h2>
      {progress && <progress class="state-progress" max={progress.total} value={progress.done} />}
      <div class="state-actions">
        <button
          type="button"
          class="button"
          onClick={() => void send('background', 'job:cancel', { jobId: job.id })}
        >
          {t('commonCancel')}
        </button>
      </div>
    </section>
  );
}

function RecordingView({ job, shortcuts }: { job: Job; shortcuts: Map<string, string> }) {
  const recording = job.phase === 'recording' && job.startedAt !== undefined;
  const now = useNow(1000, recording);
  const modeLabel = t(REC_MODE_LABEL[job.mode] ?? 'modeTab');
  const stopShortcut = shortcuts.get('toggle-recording');

  return (
    <section class="state" data-state="recording">
      <h2 class="state-title rec-title">
        <span class="rec-dot" aria-hidden="true">
          {'●'}
        </span>{' '}
        {recording ? t('recordingTitle', modeLabel) : t('countdownTitle')}
      </h2>
      {recording && (
        <p class="rec-timer" role="timer" aria-live="off">
          {formatElapsed(now - (job.startedAt ?? now))}
        </p>
      )}
      <div class="state-actions">
        <button
          type="button"
          class="button button-rec"
          onClick={() => void send('background', 'job:stop', { jobId: job.id })}
        >
          <span aria-hidden="true">{'■'}</span> {t('recStop')}
          {stopShortcut && <kbd class="menu-shortcut">{stopShortcut}</kbd>}
        </button>
      </div>
    </section>
  );
}
