import type { ImageFormat } from '../../src/index.js';
import type { WorkspaceItem, WorkspaceSettings } from '../features/workspace/types.js';
import { formatBytes, formatSavings } from '../lib/format.js';
import { useRasterInspection } from '../features/workspace/useRasterInspection.js';
import styles from '../App.module.css';

export type SettingsScope = 'all' | 'selected';

interface ProcessingPanelProps {
  readonly selected: WorkspaceItem | undefined;
  readonly settings: WorkspaceSettings;
  readonly scope: SettingsScope;
  readonly onScope: (value: SettingsScope) => void;
  readonly onSettings: (patch: Partial<WorkspaceSettings>) => void;
  readonly activeCount: number;
  readonly readyCount: number;
  readonly completedCount: number;
  readonly itemCount: number;
  readonly onConvert: () => void;
  readonly onConvertAll: () => void;
  readonly onCancel: () => void;
  readonly onCancelAll: () => void;
  readonly onDownload: () => void;
  readonly onDownloadAll: () => void;
  readonly onRetry: () => void;
  readonly onRemove: () => void;
  readonly onClear: () => void;
}

export function ProcessingPanel({
  selected, settings, scope, onScope, onSettings, activeCount, readyCount,
  completedCount, itemCount, onConvert, onConvertAll, onCancel, onCancelAll,
  onDownload, onDownloadAll, onRetry, onRemove, onClear,
}: ProcessingPanelProps) {
  const disabled = activeCount > 0 || !selected;
  const format = settings.format;
  const result = selected?.result;
  const inspection = useRasterInspection(selected?.file);
  const inspected = inspection.status === 'ready' ? inspection.info : undefined;
  const inspecting = inspection.status === 'loading' ? 'Inspecting…' : '—';
  const selectedBusy = selected?.status === 'converting';
  return (
    <aside className={styles.inspector} aria-label="Processing settings">
      <header className={styles.inspectorHead}>
        <div>
          <span className={styles.eyebrow}>Settings</span>
          <h2>Output controls</h2>
        </div>
        <span className={styles.liveMark} title="Processed locally">LOCAL</span>
      </header>

      <fieldset className={styles.settingsSection} disabled={disabled}>
        <legend>Apply settings to</legend>
        <div className={styles.scopeControl} aria-label="Settings scope">
          <button type="button" className={scope === 'all' ? styles.pillActive : styles.pill}
            aria-pressed={scope === 'all'} onClick={() => onScope('all')}>All images</button>
          <button type="button" className={scope === 'selected' ? styles.pillActive : styles.pill}
            aria-pressed={scope === 'selected'} onClick={() => onScope('selected')}>Selected</button>
        </div>
        <p className={styles.helper}>
          {scope === 'all' ? 'Changing these settings resets results for all images.' : 'Only this image will need processing again.'}
        </p>
      </fieldset>

      <fieldset className={styles.settingsSection} disabled={disabled}>
        <legend>Output format</legend>
        <div className={styles.formats}>
          {(['jpeg', 'png', 'webp'] as const).map((value: ImageFormat) => (
            <button key={value} type="button"
              className={format === value ? styles.formatActive : styles.formatButton}
              aria-pressed={format === value}
              onClick={() => onSettings({ format: value })}>
              {value === 'jpeg' ? 'JPG' : value.toUpperCase()}
            </button>
          ))}
        </div>
        {format === 'jpeg' && <p className={styles.helper}>Transparency is flattened onto white.</p>}
      </fieldset>

      {(format === 'jpeg' || (format === 'webp' && !settings.webpLossless)) && (
        <fieldset className={styles.settingsSection} disabled={disabled}>
          <legend>Quality</legend>
          <div className={styles.sliderTitle}>
            <span>Compression quality</span>
            <output>{settings.quality}%</output>
          </div>
          <input className={styles.qualityRange} type="range" min={1} max={100}
            value={settings.quality} aria-label="Compression quality"
            onChange={(event) => onSettings({ quality: Number(event.target.value) })} />
          <div className={styles.rangeEnds}><span>Smaller file</span><span>Higher quality</span></div>
        </fieldset>
      )}

      {format === 'png' && (
        <fieldset className={styles.settingsSection} disabled={disabled}>
          <legend>PNG compression</legend>
          <div className={styles.sliderTitle}>
            <span>Compression level</span><output>{settings.pngCompressionLevel}</output>
          </div>
          <input className={styles.qualityRange} type="range" min={1} max={6}
            value={settings.pngCompressionLevel} aria-label="PNG compression level"
            onChange={(event) => onSettings({ pngCompressionLevel: Number(event.target.value) as WorkspaceSettings['pngCompressionLevel'] })} />
          <div className={styles.rangeEnds}><span>Level 1</span><span>Level 6</span></div>
        </fieldset>
      )}

      {format === 'webp' && (
        <fieldset className={styles.settingsSection} disabled={disabled}>
          <legend>Encoding</legend>
          <label className={styles.switchRow}>
            <span><strong>Lossless</strong><small>Preserve pixel values</small></span>
            <input type="checkbox" checked={settings.webpLossless}
              onChange={(event) => onSettings({ webpLossless: event.target.checked })} />
          </label>
        </fieldset>
      )}

      <section className={styles.resultSection} aria-label="Conversion result">
        <div className={styles.resultHeading}>
          <h3>File details</h3>
          <span>{result ? 'Processed' : selected?.status === 'error' ? 'Failed' : selectedBusy ? 'In progress' : 'Not processed'}</span>
        </div>
        <dl className={styles.metrics}>
          <div><dt>Original</dt><dd>{selected ? formatBytes(selected.file.size) : '—'}</dd></div>
          {selected && (
            <>
              <div><dt>Source dimensions</dt><dd>{inspected ? `${inspected.width} × ${inspected.height}` : inspecting}</dd></div>
              <div><dt>Transparency</dt><dd>{inspected ? (inspected.hasAlpha ? 'Yes' : 'No') : inspecting}</dd></div>
              <div><dt>ICC profile</dt><dd>{inspected ? (inspected.hasIccProfile ? 'Embedded' : 'None detected') : inspecting}</dd></div>
            </>
          )}
          <div><dt>Output</dt><dd>{result ? formatBytes(result.outputBytes) : '—'}</dd></div>
          <div><dt>Difference</dt><dd>{result ? formatSavings(result.inputBytes, result.outputBytes) : '—'}</dd></div>
          <div><dt>Dimensions</dt><dd>{result ? String(result.width) + ' × ' + String(result.height) : '—'}</dd></div>
        </dl>
        {selectedBusy && (
          <div className={styles.processingProgress}>
            <div><span>Processing</span><span>{Math.round((selected?.progress ?? 0) * 100)}%</span></div>
            <progress value={selected?.progress ?? 0} max={1} />
          </div>
        )}
        {selected?.status === 'error' && <p className={styles.errorCopy} role="alert">{selected.error}</p>}
      </section>

      <div className={styles.inspectorActions}>
        {selectedBusy ? (
          <button className={styles.mainAction} type="button" onClick={onCancel}>Cancel image</button>
        ) : (
          <button className={styles.mainAction} type="button" onClick={onConvert}
            disabled={!selected || activeCount > 0}>
            {result ? 'Reprocess image' : 'Convert image'} <span aria-hidden="true">↗</span>
          </button>
        )}
        {activeCount > 0 ? (
          <button type="button" className={styles.secondaryAction} onClick={onCancelAll}>Cancel all</button>
        ) : (
          <button type="button" className={styles.secondaryAction}
            disabled={readyCount === 0} onClick={onConvertAll}>Convert all remaining</button>
        )}
        <div className={styles.exportActions}>
          <button type="button" disabled={!result} onClick={onDownload}>Download image</button>
          <button type="button" disabled={!completedCount || !!activeCount} onClick={onDownloadAll}>Download ZIP</button>
        </div>
        <div className={styles.bottomActions}>
          {selected?.status === 'error' || selected?.status === 'cancelled' ? (
            <button type="button" disabled={!!activeCount} onClick={onRetry}>Retry image</button>
          ) : null}
          <button type="button" disabled={!selected || !!activeCount} onClick={onRemove}>Remove image</button>
          <button type="button" disabled={itemCount === 0 || !!activeCount} onClick={onClear}>Clear all</button>
        </div>
      </div>
    </aside>
  );
}
