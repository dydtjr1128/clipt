import { useEffect, useRef } from 'preact/hooks';
import { t } from '@/shared/i18n';

/**
 * 요소 선택 3단계 패널 (docs/ux-design.md 5.3절).
 * 상태는 호출자(element-session)가 들고, 패널은 그리기와 사용자 입력 전달만 한다.
 */
export interface PanelItem {
  label: string;
}

export interface PanelInfo {
  tag: string;
  id: string;
  classes: string[];
  size: string;
}

export interface PanelProps {
  forRecording: boolean;
  path: PanelItem[];
  depth: number;
  info: PanelInfo;
  position: { left: number; top: number };
  onDepth: (depth: number) => void;
  onPreview: (depth: number | null) => void;
  onConfirm: () => void;
  onReselect: () => void;
  onCancel: () => void;
  onDragStart: (event: PointerEvent) => void;
}

export function SelectionPanel(props: PanelProps) {
  const { path, depth, info, forRecording } = props;
  const chipsRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 열릴 때 주 버튼으로 포커스를 옮긴다(접근성)
  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
  }, []);

  // 현재 칩이 항상 보이도록 가로 스크롤
  useEffect(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    chip?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [depth, path]);

  const current = path[depth]?.label ?? '';
  const meta = [info.id && `#${info.id}`, info.classes.map((c) => `.${c}`).join(' ')]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      class="panel"
      role="dialog"
      aria-label={t(forRecording ? 'panelTitleRec' : 'panelTitle')}
      style={{ left: `${props.position.left}px`, top: `${props.position.top}px` }}
    >
      <header
        class="panel-header"
        onPointerDown={(e) => props.onDragStart(e as unknown as PointerEvent)}
      >
        <span class="panel-grip" aria-hidden="true">
          {'⋮⋮'}
        </span>
        <span class="panel-title">{t(forRecording ? 'panelTitleRec' : 'panelTitle')}</span>
        <button
          type="button"
          class="icon-btn"
          aria-label={t('commonCancel')}
          title={t('commonCancel')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={props.onCancel}
        >
          <span aria-hidden="true">{'✕'}</span>
        </button>
      </header>

      <div class="panel-row">
        <div class="panel-caption">{t('panelPath')}</div>
        <div class="chips" ref={chipsRef} onPointerLeave={() => props.onPreview(null)}>
          {path.map((item, index) => (
            <span class="chip-wrap" key={index}>
              {index > 0 && (
                <span class="chip-sep" aria-hidden="true">
                  {'›'}
                </span>
              )}
              <button
                type="button"
                class="chip"
                aria-current={index === depth ? 'true' : undefined}
                onPointerEnter={() => props.onPreview(index)}
                onClick={() => props.onDepth(index)}
              >
                {item.label}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div class="panel-row panel-depth">
        <label class="panel-caption" for="clipt-depth">
          {t('panelDepth')}
        </label>
        <span class="depth-end">{t('panelParent')}</span>
        <input
          id="clipt-depth"
          class="slider"
          type="range"
          min={0}
          max={Math.max(0, path.length - 1)}
          step={1}
          value={depth}
          aria-valuetext={t('panelDepthValue', [String(depth + 1), String(path.length), current])}
          onInput={(e) => props.onDepth(Number((e.target as HTMLInputElement).value))}
        />
        <span class="depth-end">{t('panelChild')}</span>
        <span class="depth-value" aria-hidden="true">
          {`${depth + 1} / ${path.length}`}
        </span>
      </div>

      <div class="panel-row panel-info">
        <div class="info-main">
          <span class="info-tag">{current}</span>
          <span class="info-size">{info.size}</span>
        </div>
        {meta && <div class="info-meta">{meta}</div>}
      </div>

      <div class="panel-actions">
        <button
          type="button"
          ref={confirmRef}
          class={`btn ${forRecording ? 'btn-rec' : 'btn-primary'} panel-confirm`}
          onClick={props.onConfirm}
        >
          <span aria-hidden="true">{forRecording ? '●' : '◱'}</span>{' '}
          {t(forRecording ? 'panelRecord' : 'panelCapture')}
        </button>
        <button type="button" class="btn" onClick={props.onReselect}>
          {t('panelReselect')}
        </button>
        <button type="button" class="btn btn-ghost" onClick={props.onCancel}>
          {t('commonCancel')}
        </button>
      </div>

      <footer class="panel-footer">
        <span>
          <kbd>{'Enter'}</kbd> {t(forRecording ? 'panelRecord' : 'panelCapture')}
        </span>
        <span>
          <kbd>{'↑↓'}</kbd> {t('panelDepth')}
        </span>
        <span>
          <kbd>{'←→'}</kbd> {t('panelSibling')}
        </span>
        <span>
          <kbd>{'Esc'}</kbd> {t('panelBack')}
        </span>
      </footer>
    </section>
  );
}
