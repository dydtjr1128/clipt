import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { MIME_CANDIDATES, type RecordFormat } from '@/core/media-profile';
import { DEFAULT_SETTINGS, OPTIONS, type Settings } from '@/core/settings';
import { t, type MessageKey } from '@/shared/i18n';
import { loadSettings, saveSetting, watchSettings } from '@/shared/settings';
import './settings.css';

/**
 * 설정 폼 (docs/ux-design.md 3.5절). 팝업 ⚙ 화면과 옵션 페이지가 함께 쓴다.
 * 바꾸는 즉시 storage.sync에 저장하고, 다른 화면에서 바뀐 값도 바로 반영한다.
 */
export function useSettings(): [Settings, (path: string, value: unknown) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    void loadSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);
  const update = (path: string, value: unknown) => {
    void saveSetting(path, value).then(setSettings);
  };
  return [settings, update];
}

const FORMAT_LABEL: Record<RecordFormat, MessageKey> = {
  mp4: 'formatMp4',
  'webm-vp9': 'formatVp9',
  'webm-vp8': 'formatVp8',
  'webm-av1': 'formatAv1',
};
const FORMAT_HINT: Record<RecordFormat, MessageKey> = {
  mp4: 'formatMp4Hint',
  'webm-vp9': 'formatVp9Hint',
  'webm-vp8': 'formatVp8Hint',
  'webm-av1': 'formatAv1Hint',
};
const AUDIO_LABEL: Record<Settings['record']['audio'], MessageKey> = {
  none: 'audioNone',
  tab: 'audioTab',
  mic: 'audioMic',
  'tab+mic': 'audioTabMic',
};

/** 이 브라우저의 MediaRecorder가 지원하는 포맷 */
export function supportedFormats(): Set<RecordFormat> {
  const formats = Object.keys(MIME_CANDIDATES) as RecordFormat[];
  if (typeof MediaRecorder === 'undefined') return new Set(formats);
  return new Set(
    formats.filter((f) => MIME_CANDIDATES[f].some((mime) => MediaRecorder.isTypeSupported(mime))),
  );
}

function useMicPermission(enabled: boolean): PermissionState | null {
  const [state, setState] = useState<PermissionState | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let status: PermissionStatus | null = null;
    const sync = () => setState(status?.state ?? null);
    void navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener('change', sync);
        sync();
      })
      .catch(() => setState(null));
    return () => status?.removeEventListener('change', sync);
  }, [enabled]);
  return state;
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <details class="set-section" open>
      <summary>{title}</summary>
      <div class="set-body">{children}</div>
    </details>
  );
}

function Row({
  label,
  children,
  hint,
  tone,
}: {
  label: string;
  children: ComponentChildren;
  hint?: string | false;
  tone?: 'warn';
}) {
  return (
    <div class="set-row">
      <div class="set-line">
        <span class="set-label">{label}</span>
        <div class="set-control">{children}</div>
      </div>
      {hint && <p class={`set-hint${tone ? ` is-${tone}` : ''}`}>{hint}</p>}
    </div>
  );
}

function Segmented<T extends string | number>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div class="segmented" role="radiogroup" data-setting={name}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          class="segmented-item"
          data-value={String(option.value)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsForm() {
  const [settings, update] = useSettings();
  const [formats] = useState(supportedFormats);
  const wantsMic = settings.record.audio === 'mic' || settings.record.audio === 'tab+mic';
  const mic = useMicPermission(wantsMic);
  const { image, record } = settings;

  return (
    <form class="settings" onSubmit={(e) => e.preventDefault()}>
      <Section title={t('setImage')}>
        <Row label={t('setFormat')}>
          <Segmented
            name="image.format"
            value={image.format}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpeg', label: 'JPEG' },
            ]}
            onChange={(v) => update('image.format', v)}
          />
        </Row>
        {image.format === 'jpeg' && (
          <Row label={t('setJpegQuality')}>
            <input
              class="set-range"
              type="range"
              min={60}
              max={100}
              step={1}
              value={Math.round(image.jpegQuality * 100)}
              data-setting="image.jpegQuality"
              aria-label={t('setJpegQuality')}
              onChange={(e) =>
                update('image.jpegQuality', Number((e.target as HTMLInputElement).value) / 100)
              }
            />
            <span class="set-value">{Math.round(image.jpegQuality * 100)}</span>
          </Row>
        )}
      </Section>

      <Section title={t('setRecord')}>
        <Row label={t('setFormat')} hint={t(FORMAT_HINT[record.format])}>
          <select
            class="set-select"
            data-setting="record.format"
            aria-label={t('setFormat')}
            value={record.format}
            onChange={(e) => update('record.format', (e.target as HTMLSelectElement).value)}
          >
            {OPTIONS['record.format'].map((format) => (
              <option key={format} value={format} disabled={!formats.has(format)}>
                {t(FORMAT_LABEL[format])}
                {formats.has(format) ? '' : ` (${t('formatUnsupported')})`}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('setFps')}>
          <Segmented
            name="record.fps"
            value={record.fps}
            options={OPTIONS['record.fps'].map((v) => ({ value: v, label: String(v) }))}
            onChange={(v) => update('record.fps', v)}
          />
        </Row>
        <Row label={t('setScale')}>
          <Segmented
            name="record.scale"
            value={record.scale}
            options={OPTIONS['record.scale'].map((v) => ({ value: v, label: `${v * 100}%` }))}
            onChange={(v) => update('record.scale', v)}
          />
        </Row>
        <Row label={t('setBitrate')}>
          <Segmented
            name="record.bitrate"
            value={record.bitrate}
            options={[
              { value: 'auto', label: t('bitrateAuto') },
              { value: 'low', label: t('bitrateLow') },
              { value: 'high', label: t('bitrateHigh') },
            ]}
            onChange={(v) => update('record.bitrate', v)}
          />
        </Row>
        <Row label={t('setAudio')} hint={wantsMic && mic !== 'granted' && t('micNeedsPermission')}>
          <select
            class="set-select"
            data-setting="record.audio"
            aria-label={t('setAudio')}
            value={record.audio}
            onChange={(e) => update('record.audio', (e.target as HTMLSelectElement).value)}
          >
            {OPTIONS['record.audio'].map((audio) => (
              <option key={audio} value={audio}>
                {t(AUDIO_LABEL[audio])}
              </option>
            ))}
          </select>
          {wantsMic && mic !== 'granted' && (
            <button
              type="button"
              class="set-button"
              data-action="mic-permission"
              onClick={() =>
                void browser.tabs.create({ url: browser.runtime.getURL('/permission.html') })
              }
            >
              {t('permAllow')}
            </button>
          )}
        </Row>
        <Row label={t('setCountdown')}>
          <Segmented
            name="record.countdownSeconds"
            value={record.countdownSeconds}
            options={OPTIONS['record.countdownSeconds'].map((v) => ({
              value: v,
              label: v === 0 ? t('countdownOff') : t('countdownSeconds', String(v)),
            }))}
            onChange={(v) => update('record.countdownSeconds', v)}
          />
        </Row>
        <Row label={t('setMaxLength')}>
          <select
            class="set-select"
            data-setting="record.maxMinutes"
            aria-label={t('setMaxLength')}
            value={record.maxMinutes}
            onChange={(e) =>
              update('record.maxMinutes', Number((e.target as HTMLSelectElement).value))
            }
          >
            {OPTIONS['record.maxMinutes'].map((minutes) => (
              <option key={minutes} value={minutes}>
                {t('minutes', String(minutes))}
              </option>
            ))}
          </select>
        </Row>
        <Row
          label={t('setIndicator')}
          hint={record.indicator !== 'none' && t('indicatorWarn')}
          tone="warn"
        >
          <Segmented
            name="record.indicator"
            value={record.indicator}
            options={[
              { value: 'none', label: t('indicatorNone') },
              { value: 'border', label: t('indicatorBorder') },
              { value: 'widget', label: t('indicatorWidget') },
            ]}
            onChange={(v) => update('record.indicator', v)}
          />
        </Row>
      </Section>

      <Section title={t('setAfterCapture')}>
        <RadioList
          name="afterCapture"
          value={settings.afterCapture}
          options={[
            { value: 'result', label: t('afterResult') },
            { value: 'download', label: t('afterDownload') },
            { value: 'clipboard', label: t('afterClipboard') },
          ]}
          onChange={(v) => update('afterCapture', v)}
        />
      </Section>

      <Section title={t('setAfterRecord')}>
        <RadioList
          name="afterRecord"
          value={settings.afterRecord}
          options={[
            { value: 'result', label: t('afterResult') },
            { value: 'download', label: t('afterDownload') },
          ]}
          onChange={(v) => update('afterRecord', v)}
        />
      </Section>

      <Section title={t('setDownload')}>
        <label class="set-check">
          <input
            type="checkbox"
            data-setting="download.saveAs"
            checked={settings.download.saveAs}
            onChange={(e) => update('download.saveAs', (e.target as HTMLInputElement).checked)}
          />
          {t('setSaveAs')}
        </label>
      </Section>
    </form>
  );
}

function RadioList<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div class="set-radios" role="radiogroup" data-setting={name}>
      {options.map((option) => (
        <label key={option.value} class="set-check">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** 현재 녹화 프로파일 한 줄 요약 (팝업 하단) */
export function profileSummary(settings: Settings): string {
  const { record } = settings;
  return [t(FORMAT_LABEL[record.format]), `${record.fps}fps`, t(AUDIO_LABEL[record.audio])].join(
    ' · ',
  );
}
