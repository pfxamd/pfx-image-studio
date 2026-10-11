import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import type { ConversionResult } from '../../src/index.js';
import type { WorkspaceItem } from '../features/workspace/types.js';
import { DropZone } from './DropZone.js';
import styles from '../App.module.css';

type PreviewMode = 'original' | 'compare' | 'processed';

interface PreviewStageProps {
  readonly selected: WorkspaceItem | undefined;
  readonly onFiles: (files: readonly File[]) => { accepted: number; rejected: number };
}

function useOutputUrl(result: ConversionResult | undefined): string | undefined {
  const [entry, setEntry] = useState<{ result: ConversionResult; url: string }>();
  useEffect(() => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.buffer], { type: result.mimeType }));
    setEntry({ result, url });
    return () => URL.revokeObjectURL(url);
  }, [result]);
  return entry && entry.result === result ? entry.url : undefined;
}

export function PreviewStage({ selected, onFiles }: PreviewStageProps) {
  const result = selected?.result;
  const outputUrl = useOutputUrl(result);
  const [mode, setMode] = useState<PreviewMode>('original');
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sourceSize, setSourceSize] = useState<{ w: number; h: number }>();
  const [stageDragging, setStageDragging] = useState(false);
  const pointer = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    setMode(result ? 'compare' : 'original');
    setSplit(50);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSourceSize(undefined);
  }, [selected?.id, result]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (zoom <= 1 || event.target instanceof HTMLInputElement) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    setPan({ x: start.px + event.clientX - start.x, y: start.py + event.clientY - start.y });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current?.id === event.pointerId) pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onStageDragOver(event: DragEvent<HTMLElement>) {
    if (!selected || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!stageDragging) setStageDragging(true);
  }

  function onStageDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setStageDragging(false);
    }
  }

  function onStageDrop(event: DragEvent<HTMLElement>) {
    if (!selected || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setStageDragging(false);
    onFiles(Array.from(event.dataTransfer.files));
  }

  function changeZoom(next: number) {
    const clamped = Math.max(1, Math.min(3, Math.round(next * 4) / 4));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }

  const transform = 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoom + ')';
  const showProcessed = !!outputUrl && mode !== 'original';
  const comparing = showProcessed && mode === 'compare';

  return (
    <section className={styles.previewStage} aria-label="Image preview"
      onDragOver={onStageDragOver} onDragLeave={onStageDragLeave} onDrop={onStageDrop}>
      <div className={styles.previewHead}>
        <div>
          <span className={styles.eyebrow}>CANVAS / {selected ? 'ACTIVE IMAGE' : 'EMPTY WORKSPACE'}</span>
          <h1>{selected ? 'Preview' : 'Image workspace'}</h1>
        </div>
        {selected && <span className={styles.previewFilename} title={selected.file.name}>{selected.file.name}</span>}
      </div>

      {selected ? (
        <>
          <div className={styles.previewToolbar}>
            <div className={styles.previewTabs} role="group" aria-label="Preview display">
              <button type="button" className={mode === 'original' ? styles.tabActive : styles.tab}
                onClick={() => setMode('original')}>Original</button>
              <button type="button" className={mode === 'compare' ? styles.tabActive : styles.tab}
                disabled={!outputUrl} onClick={() => setMode('compare')}>Compare</button>
              <button type="button" className={mode === 'processed' ? styles.tabActive : styles.tab}
                disabled={!outputUrl} onClick={() => setMode('processed')}>Processed</button>
            </div>
            <div className={styles.zoomTools} role="group" aria-label="Preview zoom">
              <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => changeZoom(zoom - 0.25)}>−</button>
              <button type="button" className={styles.zoomDisplay} onClick={() => changeZoom(1)} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
              <button type="button" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => changeZoom(zoom + 0.25)}>+</button>
            </div>
          </div>
          <div className={styles.previewCanvas} onPointerDown={onPointerDown}
            onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp} style={{ touchAction: zoom > 1 ? 'none' : 'auto', cursor: zoom > 1 ? 'grab' : 'default' }}>
            <img className={styles.canvasImage} src={selected.previewUrl} alt={'Original: ' + selected.file.name}
              draggable={false} style={{ transform }}
              onLoad={(e) => setSourceSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
            {showProcessed && (
              <div className={styles.processedLayer} style={comparing ? { clipPath: 'inset(0 ' + (100 - split) + '% 0 0)' } : undefined}>
                <img className={styles.canvasImage} src={outputUrl} alt={'Processed: ' + selected.file.name}
                  draggable={false} style={{ transform }} />
              </div>
            )}
            {comparing && (
              <>
                <div className={styles.splitLine} aria-hidden="true" style={{ left: String(split) + '%' }}>
                  <span>↔</span>
                </div>
                <input className={styles.compareRange} type="range" min={0} max={100} value={split}
                  aria-label="Compare original and processed images"
                  onChange={(event) => setSplit(Number(event.target.value))} />
                <span className={styles.compareTagLeft}>Processed</span>
                <span className={styles.compareTagRight}>Original</span>
              </>
            )}
          </div>
          <div className={styles.previewFooter}>
            <span>{result ? String(result.width) + ' × ' + String(result.height) + ' px' :
              sourceSize ? String(sourceSize.w) + ' × ' + String(sourceSize.h) + ' px' : 'Original image'}</span>
            <span>{result ? result.extension.toUpperCase() + ' output ready' : 'Original · Unprocessed'}</span>
          </div>
        </>
      ) : (
        <div className={styles.emptyPreview}>
          <div className={styles.emptyIntro}>
            <span className={styles.emptyBadge}>JPG  ·  PNG  ·  WEBP</span>
            <h2>Bring your image.</h2>
            <p>Drop a file onto the canvas, or choose one to begin.</p>
          </div>
          <DropZone onFiles={onFiles} />
          
        </div>
      )}
      {stageDragging && <div className={styles.stageDropOverlay} role="status">Drop images to add</div>}
    </section>
  );
}
