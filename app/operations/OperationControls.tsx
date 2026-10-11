import type { ImageFormat } from '../../src/index.js';
import type { WorkspaceItem, WorkspaceSettings } from '../features/workspace/types.js';
import { useRasterInspection } from '../features/workspace/useRasterInspection.js';
import { formatBytes } from '../lib/format.js';
import { STUDIO_OPERATIONS, sourceFormat, type OperationId } from './definitions.js';
import styles from '../App.module.css';

type Scope = 'all' | 'selected';

interface OperationControlsProps {
  readonly operation: OperationId;
  readonly selected: WorkspaceItem | undefined;
  readonly settings: WorkspaceSettings;
  readonly scope: Scope;
  readonly itemCount: number;
  readonly busy: boolean;
  readonly onScope: (scope: Scope) => void;
  readonly onSettings: (patch: Partial<WorkspaceSettings>) => void;
}

export function OperationControls({
  operation, selected, settings, scope, itemCount, busy, onScope, onSettings,
}: OperationControlsProps) {
  const inspection = useRasterInspection(operation === 'inspect' ? selected?.file : undefined);
  const original = selected ? sourceFormat(selected.file) : 'png';
  const format: ImageFormat = operation === 'convert' ? settings.format : original;
  const canEdit = !busy && !!selected;
  const info = inspection.status === 'ready' ? inspection.info : undefined;
  const active = STUDIO_OPERATIONS.find((entry) => entry.id === operation)!;

  return (
    <section className={styles.operationControls} aria-label={active.label + ' controls'}>
      <div className={styles.operationIdentity}>
        <span className={styles.operationSymbol} aria-hidden="true">{active.symbol}</span>
        <span><strong>{active.label}</strong><small>{active.detail}</small></span>
      </div>
      <div className={styles.operationFields}>
        {operation === 'convert' && (
          <>
            <div className={styles.fieldCluster}>
              <span className={styles.fieldLabel}>TO FORMAT</span>
              <div className={styles.segmentedChoices} role="group" aria-label="Output format">
                {(['jpeg', 'png', 'webp'] as const).map((value) => (
                  <button key={value} type="button" disabled={!canEdit}
                    aria-pressed={format === value}
                    className={format === value ? styles.choiceActive : styles.choice}
                    onClick={() => onSettings({ format: value })}>
                    {value === 'jpeg' ? 'JPG' : value.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <span className={styles.fieldSeparator} aria-hidden="true" />
            <span className={styles.inlineNote}>Original is always preserved</span>
          </>
        )}
        {operation === 'optimize' && (
          <>
            <div className={styles.fieldCluster}>
              <span className={styles.fieldLabel}>SOURCE FORMAT</span>
              <span className={styles.staticValue}>{selected ? (original === 'jpeg' ? 'JPG' : original.toUpperCase()) : '—'}</span>
            </div>
            <span className={styles.fieldSeparator} aria-hidden="true" />
            {(format === 'jpeg' || (format === 'webp' && !settings.webpLossless)) ? (
              <label className={styles.fieldCluster}>
                <span className={styles.fieldLabel}>QUALITY <output>{settings.quality}%</output></span>
                <input className={styles.controlSlider} aria-label="Compression quality" type="range" min={1} max={100}
                  value={settings.quality} disabled={!canEdit}
                  onChange={(event) => onSettings({ quality: Number(event.target.value) })} />
              </label>
            ) : format === 'png' ? (
              <label className={styles.fieldCluster}>
                <span className={styles.fieldLabel}>PNG COMPRESSION <output>{settings.pngCompressionLevel}/6</output></span>
                <input className={styles.controlSlider} aria-label="PNG compression level" type="range" min={1} max={6} step={1}
                  value={settings.pngCompressionLevel} disabled={!canEdit}
                  onChange={(event) => onSettings({ pngCompressionLevel: Number(event.target.value) as WorkspaceSettings['pngCompressionLevel'] })} />
              </label>
            ) : (
              <span className={styles.inlineNote}>Pixel-perfect encoding</span>
            )}
            {format === 'webp' && (
              <label className={styles.losslessToggle}>
                <input type="checkbox" checked={settings.webpLossless} disabled={!canEdit}
                  onChange={(event) => onSettings({ webpLossless: event.target.checked })} />
                <span>Lossless</span>
              </label>
            )}
          </>
        )}
        {operation === 'resize' && (
          <>
            <label className={styles.fieldCluster}>
              <span className={styles.fieldLabel}>MAXIMUM WIDTH</span>
              <span className={styles.numberField}>
                <input type="number" min={1} max={8192} step={1} inputMode="numeric"
                  aria-label="Maximum width in pixels" disabled={!canEdit} value={settings.resizeMaxWidth}
                  onChange={(event) => onSettings({ resizeMaxWidth: Number(event.target.value) })} />
                <span>px</span>
              </span>
            </label>
            <span className={styles.fieldSeparator} aria-hidden="true" />
            <span className={styles.inlineNote}>Proportions and original format preserved · no upscaling</span>
          </>
        )}
        {operation === 'inspect' && (
          <div className={styles.inspectFacts} aria-live="polite">
            <InfoFact label="FILE SIZE" value={selected ? formatBytes(selected.file.size) : '—'} />
            <InfoFact label="DIMENSIONS" value={info ? info.width + ' × ' + info.height : inspection.status === 'loading' ? 'Reading…' : '—'} />
            <InfoFact label="TRANSPARENCY" value={info ? info.hasAlpha ? 'Yes' : 'No' : '—'} />
            <InfoFact label="ICC PROFILE" value={info ? info.hasIccProfile ? 'Embedded' : 'None detected' : '—'} />
          </div>
        )}
      </div>
      {itemCount > 1 && operation !== 'inspect' && (
        <div className={styles.scopeChooser} role="group" aria-label="Apply settings to">
          <span className={styles.fieldLabel}>APPLY TO</span>
          <div className={styles.scopeOptions}>
            <button type="button" disabled={!canEdit} aria-pressed={scope === 'all'}
              onClick={() => onScope('all')}>All</button>
            <button type="button" disabled={!canEdit} aria-pressed={scope === 'selected'}
              onClick={() => onScope('selected')}>Selected</button>
          </div>
        </div>
      )}
    </section>
  );
}

function InfoFact({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className={styles.infoFact}><span>{label}</span><strong>{value}</strong></div>;
}
