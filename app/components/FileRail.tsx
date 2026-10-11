import type { OperationId } from '../operations/definitions.js';
import type { WorkspaceItem } from '../features/workspace/types.js';
import { formatBytes } from '../lib/format.js';
import { DropZone } from './DropZone.js';
import styles from '../App.module.css';

interface FileRailProps {
  readonly items: readonly WorkspaceItem[];
  readonly operation: OperationId;
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onFiles: (files: readonly File[]) => { accepted: number; rejected: number };
}

function statusLabel(item: WorkspaceItem, operation: OperationId): string {
  if (item.status === 'converting') return String(Math.round(item.progress * 100)) + '%';
  if (item.result && item.resultOperation === operation) return 'Done';
  if (item.status === 'error') return 'Failed';
  if (item.status === 'cancelled') return 'Cancelled';
  return 'Ready';
}

export function FileRail({ items, selectedId, onSelect, onFiles, operation }: FileRailProps) {
  return (
    <aside className={styles.fileRail} aria-label="Image files">
      <div className={styles.railHeader}>
        <div className={styles.railHeading}>
          <h2>Images</h2>
          <span className={styles.fileCount}>{items.length}</span>
        </div>
      </div>
      {items.length > 0 ? (
        <>
          <div className={styles.railItems} role="list">
            {items.map((item, index) => (
              <div role="listitem" key={item.id}>
                <button
                  className={[styles.fileItem, item.id === selectedId ? styles.fileSelected : ''].join(' ')}
                  type="button"
                  aria-pressed={item.id === selectedId}
                  aria-label={'Select image ' + item.file.name}
                  onClick={() => onSelect(item.id)}
                >
                  <span className={styles.thumbFrame}>
                    <img src={item.previewUrl} alt="" draggable={false} />
                  </span>
                  <span className={styles.fileInfo}>
                    <span className={styles.fileTitle}>{item.file.name}</span>
                    <span className={styles.fileSub}>{formatBytes(item.file.size)} · {statusLabel(item, operation)}</span>
                    {item.status === 'converting' && (
                      <span className={styles.miniProgress} aria-hidden="true">
                        <span style={{ width: String(Math.round(item.progress * 100)) + '%' }} />
                      </span>
                    )}
                  </span>
                  <span className={styles.fileIndex} aria-hidden="true">{index + 1}</span>
                </button>
              </div>
            ))}
          </div>
          <div className={styles.railAdd}>
            <DropZone compact onFiles={onFiles} />
          </div>
        </>
      ) : (
        <div className={styles.railEmpty}>
          <span className={styles.emptyGlyph} aria-hidden="true">▧</span>
          <span>No images added</span>
          <small>Your files will appear here.</small>
        </div>
      )}
      
    </aside>
  );
}
