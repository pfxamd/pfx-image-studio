import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FileRail } from './components/FileRail.js';
import { PreviewStage } from './components/PreviewStage.js';
import { useImageWorkspace } from './features/workspace/useImageWorkspace.js';
import { OperationControls } from './operations/OperationControls.js';
import { STUDIO_OPERATIONS, type OperationId } from './operations/definitions.js';
import logoUrl from './assets/Red-pfx.svg';
import styles from './App.module.css';
import { studioReleaseLabel } from './release.js';

type StudioTheme = 'dark' | 'light';
type SettingsScope = 'all' | 'selected';
const THEME_KEY = 'pfx-image-studio.theme';

function getInitialTheme(): StudioTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage is optional.
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function App() {
  const workspace = useImageWorkspace();
  const { items, settings } = workspace.state;
  const [selectedId, setSelectedId] = useState<string>();
  const [operation, setOperation] = useState<OperationId>('convert');
  const [scope, setScope] = useState<SettingsScope>('all');
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState<StudioTheme>(getInitialTheme);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.studioTheme = theme;
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* optional */ }
  }, [theme]);

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectedResult = selected?.resultOperation === operation ? selected.result : undefined;
  const previewSelected = selected ? { ...selected, result: selectedResult } : undefined;
  const effectiveSettings = scope === 'selected'
    ? (selected?.overrideSettings ?? settings) : settings;
  const activeCount = items.filter((item) => item.status === 'converting').length;
  const completedCount = items.filter((item) => item.result && item.resultOperation === operation).length;
  const readyCount = items.filter((item) =>
    item.status !== 'converting' && (!item.result || item.resultOperation !== operation)).length;
  const busy = activeCount > 0;
  const currentOperation = STUDIO_OPERATIONS.find((entry) => entry.id === operation)!;

  function handleFiles(files: readonly File[]) {
    const outcome = workspace.addFiles(files);
    setNotice(outcome.rejected ? String(outcome.rejected) + ' unsupported image(s) skipped.' : '');
    return outcome;
  }

  function handlePicker(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function updateSettings(patch: Parameters<typeof workspace.updateSettings>[0]) {
    workspace.updateSettings(patch, scope === 'selected' ? selected?.id : undefined);
  }

  function clearAll() {
    if (busy || !items.length) return;
    if (window.confirm('Remove all images and results?')) {
      workspace.clearItems();
      setSelectedId(undefined);
      setNotice('');
    }
  }

  function processSelected() {
    if (selected && operation !== 'inspect') void workspace.convertItem(selected.id, operation);
  }

  return (
    <div className={styles.app} data-theme={theme}>
      <header className={styles.appHeader}>
        <a className={styles.brand} href="./" aria-label="PFx Image Studio home">
          <span className={styles.brandMark}><img src={logoUrl} alt="" /></span>
          <span className={styles.brandWords}><strong>PFx <span>Image Studio</span></strong><small>{studioReleaseLabel}</small></span>
        </a>
        <div className={styles.headerRight}>
          <span className={styles.localIndicator}><i /> LOCAL WORKSPACE</span>
          <button className={styles.themeToggle} type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☼' : '☾'}
          </button>
          <button className={styles.headerAdd} type="button" onClick={() => inputRef.current?.click()}>
            <span aria-hidden="true">＋</span> Add images
          </button>
          <input ref={inputRef} className={styles.srOnly} type="file" multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            aria-label="Choose images to add" onChange={handlePicker} />
        </div>
      </header>

      <nav className={styles.operationNav} aria-label="Image operations">
        <span className={styles.navLabel}>TOOLS</span>
        <div className={styles.operationTabs}>
          {STUDIO_OPERATIONS.map((entry) => (
            <button key={entry.id} type="button"
              className={operation === entry.id ? styles.operationTabActive : styles.operationTab}
              disabled={busy} aria-current={operation === entry.id ? 'page' : undefined}
              aria-pressed={operation === entry.id}
              onClick={() => setOperation(entry.id)}>
              <span className={styles.tabSymbol} aria-hidden="true">{entry.symbol}</span>
              {entry.label}
            </button>
          ))}
        </div>
        <span className={styles.navTail}>IMAGE / STUDIO</span>
      </nav>

      <OperationControls operation={operation} selected={selected} settings={effectiveSettings}
        scope={scope} itemCount={items.length} busy={busy} onScope={setScope} onSettings={updateSettings} />

      <main className={styles.workArea} aria-label="Image workspace">
        {notice && <div className={styles.globalNotice} role="status">{notice}</div>}
        <div className={[styles.workspaceGrid, items.length > 1 ? styles.withRail : ''].join(' ')}>
          {items.length > 1 && (
            <FileRail items={items} selectedId={selected?.id} onSelect={setSelectedId}
              onFiles={handleFiles} operation={operation} />
          )}
          <PreviewStage selected={previewSelected} onFiles={handleFiles} />
        </div>
      </main>

      <footer className={styles.actionDock} data-batch={items.length > 1} aria-label="Image actions">
        <div className={styles.actionMeta}>
          <div className={styles.statusCluster} aria-live="polite" role="status">
            <span className={busy ? styles.statusPulse : styles.statusDot} />
            <span className={styles.statusMain}>
              {busy ? (selected?.status === 'converting' ? Math.round(selected.progress * 100) + '% processing' : activeCount + ' processing') : operation === 'inspect' ? 'Inspect mode' :
                selected?.status === 'error' ? 'Processing failed' :
                completedCount ? completedCount + ' ready to export' : items.length ? 'Ready to process' : 'Waiting for images'}
            </span>
            <span className={styles.statusCount}>{items.length} {items.length === 1 ? 'image' : 'images'}</span>
          </div>
          <div className={styles.utilityActions} aria-label="Manage images">
            <button className={styles.quietButton} type="button" disabled={!selected || busy}
              onClick={() => { if (selected) workspace.removeItem(selected.id); }}>Remove</button>
            {items.length > 1 && (
              <button className={styles.quietButton} type="button" disabled={busy}
                onClick={clearAll}>Clear all</button>
            )}
          </div>
        </div>
        <div className={styles.actionGroup}>
          {operation === 'inspect' ? (
            <span className={styles.inspectHint}>Read-only inspection</span>
          ) : busy ? (
            <>
              <button className={styles.secondaryButton} type="button"
                onClick={() => { if (selected) workspace.cancelItem(selected.id); }}>Cancel image</button>
              <button className={styles.primaryButton} type="button" onClick={workspace.cancelAll}>Cancel all</button>
            </>
          ) : (
            <>
              <div className={styles.individualActions} aria-label="Selected image actions">
                <button className={styles.secondaryButton} type="button" disabled={!selectedResult}
                  onClick={() => { if (selected) workspace.downloadItem(selected.id); }}>Download</button>
                <button className={items.length > 1 ? styles.singleAction : styles.primaryButton}
                  type="button" disabled={!selected} onClick={processSelected}>
                  {currentOperation.action}<span aria-hidden="true">↗</span>
                </button>
              </div>
              {items.length > 1 && (
                <div className={styles.batchActions} aria-label="Actions for all images">
                  <span className={styles.batchLabel}>ALL IMAGES</span>
                  <button className={styles.batchConvert} type="button" disabled={!readyCount}
                    onClick={() => { void workspace.convertAll(operation); }}>
                    Process all <span aria-hidden="true">↗</span>
                  </button>
                  <button className={styles.batchDownload} type="button" disabled={!completedCount}
                    onClick={() => workspace.downloadAll(operation)}>
                    Download ZIP <span aria-hidden="true">↓</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
