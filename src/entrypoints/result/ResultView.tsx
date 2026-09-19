import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { buildFilename, extensionOf } from '@/core/filename';
import { formatBytes, safeBaseName, shortUrl, splitFilename, stepZoom } from '@/core/format';
import { isRecordMode, type Mode } from '@/core/job';
import { formatElapsed } from '@/core/time';
import { loadResult, type ResultMeta } from '@/shared/db';
import { t, type MessageKey } from '@/shared/i18n';
import { loadSettings } from '@/shared/settings';
import { ResultNotices } from './ResultNotices';

/** 결과 페이지 (docs/ux-design.md 8절): 미리보기, 정보, 다운로드, 클립보드 복사, 다른 포맷 저장 */
type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; meta: ResultMeta; blob: Blob; url: string };

const MODE_LABEL: Record<Mode, MessageKey> = {
  visible: 'menuVisible',
  fullpage: 'menuFullpage',
  element: 'menuElement',
  region: 'menuRegion',
  'rec-tab': 'menuRecTab',
  'rec-region': 'menuRecRegion',
  'rec-element': 'menuRecElement',
};
const AUDIO_LABEL: Record<string, MessageKey> = {
  none: 'audioNone',
  tab: 'audioTab',
  mic: 'audioMic',
  'tab+mic': 'audioTabMic',
};

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
        setState({ status: 'ready', meta: result.meta, blob: result.blob, url });
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
  return <Result meta={state.meta} blob={state.blob} url={state.url} />;
}

/** 이미지를 다른 포맷으로 다시 인코딩한다 */
async function reencode(blob: Blob, type: 'image/png' | 'image/jpeg', quality: number) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fff'; // JPEG에는 투명이 없다
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob(type === 'image/jpeg' ? { type, quality } : { type });
  } finally {
    bitmap.close();
  }
}

function useFlash(): [string | null, (key: string) => void] {
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef(0);
  const show = (key: string) => {
    setFlash(key);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 1500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return [flash, show];
}

function Result({ meta, blob, url }: { meta: ResultMeta; blob: Blob; url: string }) {
  const isImage = meta.kind === 'image';
  const defaultName = useMemo(
    () =>
      buildFilename('clipt_{date}_{mode}', {
        date: new Date(meta.createdAt),
        mode: meta.mode,
        mime: meta.mime,
      }),
    [meta],
  );
  const { base: defaultBase, ext } = splitFilename(defaultName);
  const [base, setBase] = useState(defaultBase);
  const [flash, showFlash] = useFlash();
  const [error, setError] = useState<string | null>(null);
  const modeLabel = [
    t(MODE_LABEL[meta.mode]),
    t(isRecordMode(meta.mode) ? 'resultKindVideo' : 'resultKindImage'),
  ].join(' ');

  useEffect(() => {
    document.title = `Clipt · ${modeLabel} ${meta.width}×${meta.height}`;
  }, [meta, modeLabel]);

  async function download(source: Blob, extension: string) {
    setError(null);
    const settings = await loadSettings();
    const objectUrl = URL.createObjectURL(source);
    try {
      await browser.downloads.download({
        url: objectUrl,
        filename: `${safeBaseName(base, defaultBase)}.${extension}`,
        saveAs: settings.download.saveAs,
      });
      showFlash('saved');
    } catch {
      setError(t('resultDownloadFailed'));
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  }

  async function copy() {
    setError(null);
    try {
      // 클립보드는 PNG만 받는다. JPEG 결과는 PNG로 바꿔 복사한다
      const png = blob.type === 'image/png' ? blob : await reencode(blob, 'image/png', 1);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      showFlash('copied');
    } catch {
      setError(t('resultCopyFailed'));
    }
  }

  async function saveAs(type: 'image/png' | 'image/jpeg') {
    const settings = await loadSettings();
    const converted =
      blob.type === type ? blob : await reencode(blob, type, settings.image.jpegQuality);
    await download(converted, extensionOf(type));
  }

  const copyTitle = !isImage
    ? t('resultCopyVideo')
    : blob.type === 'image/png'
      ? t('resultCopy')
      : t('resultCopyAsPng');

  return (
    <div class="result-app" data-result-id={meta.id}>
      <header class="topbar">
        <span class="topbar-brand">
          <span aria-hidden="true">{'✂'}</span> {t('appShortName')}
        </span>
        <label class="filename">
          <input
            class="filename-input"
            type="text"
            value={base}
            spellcheck={false}
            aria-label={t('resultFilename')}
            onInput={(e) => setBase((e.target as HTMLInputElement).value)}
          />
          <span class="filename-ext">{`.${ext}`}</span>
        </label>
        <div class="topbar-actions">
          <button
            type="button"
            class="tb-button"
            data-action="copy"
            disabled={!isImage}
            title={copyTitle}
            onClick={() => void copy()}
          >
            {flash === 'copied' ? `✓ ${t('resultCopied')}` : t('resultCopy')}
          </button>
          <button
            type="button"
            class="tb-button is-primary"
            data-action="download"
            onClick={() => void download(blob, ext)}
          >
            {flash === 'saved' ? `✓ ${t('resultSaved')}` : `⬇ ${t('resultDownload')}`}
          </button>
        </div>
      </header>
      {error && (
        <aside class="banner banner-warn" role="alert">
          {error}
        </aside>
      )}
      <ResultNotices meta={meta} />
      <div class="result-body">
        {isImage ? <ImagePreview meta={meta} url={url} /> : <VideoPreview url={url} />}
        <aside class="info" aria-label={t('resultInfo')}>
          <h2>{t('resultInfo')}</h2>
          <dl>
            {isImage ? (
              <>
                <Info label={t('infoSize')} value={`${meta.width} × ${meta.height}`} />
                <Info
                  label={t('infoFormat')}
                  value={`${extensionOf(meta.mime).toUpperCase()} · ${formatBytes(meta.bytes)}`}
                />
              </>
            ) : (
              <>
                <Info
                  label={t('infoDuration')}
                  value={formatElapsed((meta.duration ?? 0) * 1000)}
                />
                {meta.width > 0 && (
                  <Info label={t('infoResolution')} value={`${meta.width} × ${meta.height}`} />
                )}
                <Info
                  label={t('infoFormat')}
                  value={[extensionOf(meta.mime).toUpperCase(), meta.fps && `${meta.fps}fps`]
                    .filter(Boolean)
                    .join(' · ')}
                />
                {meta.audio && (
                  <Info label={t('setAudio')} value={t(AUDIO_LABEL[meta.audio] ?? 'audioNone')} />
                )}
                <Info label={t('infoBytes')} value={formatBytes(meta.bytes)} />
              </>
            )}
            {meta.pageUrl && (
              <Info label={t('infoPage')} value={shortUrl(meta.pageUrl)} title={meta.pageUrl} />
            )}
            <Info label={t('infoTime')} value={new Date(meta.createdAt).toLocaleTimeString()} />
            {meta.selector && <Info label={t('infoSelector')} value={meta.selector} mono />}
          </dl>
          {isImage && (
            <section class="info-section">
              <h2>{t('resultSaveAs')}</h2>
              <div class="info-buttons">
                <button
                  type="button"
                  class="tb-button"
                  data-action="save-png"
                  onClick={() => void saveAs('image/png')}
                >
                  {'PNG'}
                </button>
                <button
                  type="button"
                  class="tb-button"
                  data-action="save-jpeg"
                  onClick={() => void saveAs('image/jpeg')}
                >
                  {'JPEG'}
                </button>
              </div>
            </section>
          )}
          <p class="info-note">{t('resultNewCapture')}</p>
        </aside>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  title,
  mono,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    <div class="info-row">
      <dt>{label}</dt>
      <dd class={mono ? 'is-mono' : undefined} title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}

function VideoPreview({ url }: { url: string }) {
  return (
    <main class="preview is-video">
      <video class="result-media" src={url} controls />
    </main>
  );
}

function ImagePreview({ meta, url }: { meta: ResultMeta; url: string }) {
  // 100% = 캡처 당시 화면에서 보이던 크기(CSS px)
  const dpr = meta.dpr && meta.dpr > 0 ? meta.dpr : 1;
  const cssWidth = meta.width / dpr;
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const stage = useRef<HTMLElement>(null);
  const [, rerender] = useState(0);

  const fitScale = () => {
    const el = stage.current;
    if (!el) return 1;
    const scale = Math.min(
      (el.clientWidth - 48) / cssWidth,
      (el.clientHeight - 48) / (meta.height / dpr),
      1,
    );
    return Math.max(0.05, scale);
  };
  const current = zoom === 'fit' ? fitScale() : zoom;

  // 처음 그린 뒤와 창 크기가 바뀔 때 맞춤 배율을 다시 계산한다
  useEffect(() => {
    rerender((n) => n + 1);
    const onResize = () => rerender((n) => n + 1);
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((z) => stepZoom(z === 'fit' ? fitScale() : z, event.deltaY < 0 ? 1 : -1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // 끌어서 이동
  const onPointerDown = (event: PointerEvent) => {
    const el = stage.current;
    if (!el || event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(event.pointerId);
    el.classList.add('is-panning');
    const move = (e: PointerEvent) => {
      el.scrollLeft = start.left - (e.clientX - start.x);
      el.scrollTop = start.top - (e.clientY - start.y);
    };
    const up = () => {
      el.classList.remove('is-panning');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <div class="preview-wrap">
      <main
        class="preview"
        ref={stage}
        onPointerDown={(e) => onPointerDown(e as unknown as PointerEvent)}
      >
        <img
          class="result-media"
          src={url}
          alt={t('resultImageAlt')}
          draggable={false}
          style={{ width: `${Math.round(cssWidth * current)}px` }}
        />
      </main>
      <div class="zoombar" role="toolbar" aria-label={t('resultZoom')}>
        <button
          type="button"
          class="tb-button"
          data-zoom="fit"
          aria-pressed={zoom === 'fit'}
          onClick={() => setZoom('fit')}
        >
          {t('zoomFit')}
        </button>
        <button
          type="button"
          class="tb-button"
          data-zoom="100"
          aria-pressed={zoom === 1}
          onClick={() => setZoom(1)}
        >
          {'100%'}
        </button>
        <button
          type="button"
          class="tb-button"
          data-zoom="out"
          aria-label={t('zoomOut')}
          onClick={() => setZoom(stepZoom(current, -1))}
        >
          {'−'}
        </button>
        <span class="zoom-value" data-zoom="value">{`${Math.round(current * 100)}%`}</span>
        <button
          type="button"
          class="tb-button"
          data-zoom="in"
          aria-label={t('zoomIn')}
          onClick={() => setZoom(stepZoom(current, 1))}
        >
          {'+'}
        </button>
      </div>
    </div>
  );
}
