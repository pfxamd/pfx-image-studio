import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import {
  Image3CoreError,
  type ConversionResult,
  type Image3WorkerPool,
} from '../../../src/index.js';
import { sourceFormat, type OperationId } from '../../operations/definitions.js';
import { createImage3WorkerPool } from '../../lib/createWorkerPool.js';
import { downloadResult, downloadResults } from '../../lib/download.js';
import { validateResizeWidth } from '../../lib/resizeSettings.js';
import { ResizePermitQueue } from '../../lib/resizePermitQueue.js';
import { partitionImageFiles } from './files.js';
import { workspaceReducer } from './reducer.js';
import {
  buildConversionOptions,
  initialWorkspaceState,
  type WorkspaceItem,
  type WorkspaceSettings,
} from './types.js';

export function useImageWorkspace() {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    initialWorkspaceState,
  );
  const poolRef = useRef<Image3WorkerPool | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const resizePermits = useRef(new ResizePermitQueue());
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const pool = createImage3WorkerPool();
    poolRef.current = pool;

    return () => {
      poolRef.current = null;

      for (const controller of controllers.current.values()) {
        controller.abort();
      }
      controllers.current.clear();

      for (const item of stateRef.current.items) {
        URL.revokeObjectURL(item.previewUrl);
      }

      pool.terminate();
    };
  }, []);

  const addFiles = useCallback((files: readonly File[]) => {
    const partition = partitionImageFiles(files);

    const items: WorkspaceItem[] = partition.accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'ready',
      stage: undefined,
      progress: 0,
      result: undefined,
      error: undefined,
    }));

    if (items.length > 0) {
      dispatch({ type: 'add', items });
    }

    return {
      accepted: items.length,
      rejected: partition.rejected.length,
    };
  }, []);

  const removeItem = useCallback((id: string) => {
    const item = stateRef.current.items.find((candidate) => candidate.id === id);
    if (!item) return;

    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    URL.revokeObjectURL(item.previewUrl);
    dispatch({ type: 'remove', id });
  }, []);

  const clearItems = useCallback(() => {
    for (const controller of controllers.current.values()) {
      controller.abort();
    }
    controllers.current.clear();

    for (const item of stateRef.current.items) {
      URL.revokeObjectURL(item.previewUrl);
    }

    dispatch({ type: 'clear' });
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<WorkspaceSettings>, id?: string) => {
      if (id) dispatch({ type: 'settings-item', id, patch });
      else dispatch({ type: 'settings', patch });
    },
    [],
  );

  const convertItem = useCallback(
    async (id: string, operation: OperationId = 'convert'): Promise<ConversionResult | undefined> => {
      const item = stateRef.current.items.find((candidate) => candidate.id === id);
      if (!item || item.status === 'converting' || controllers.current.has(id)) return undefined;

      const pool = poolRef.current;
      if (!pool) return undefined;

      const controller = new AbortController();
      controllers.current.set(id, controller);
      dispatch({ type: 'start', id });

      const itemSettings = item.overrideSettings ?? stateRef.current.settings;
      const resizing = operation === 'resize';
      const target = operation === 'convert' ? itemSettings.format : sourceFormat(item.file);
      const options = {
        ...buildConversionOptions({ ...itemSettings, format: target }),
        ...(resizing ? { rasterMaxWidth: itemSettings.resizeMaxWidth } : {}),
      };

      let releaseResize: (() => void) | undefined;
      try {
        if (resizing) {
          validateResizeWidth(itemSettings.resizeMaxWidth);
          // Large Canvas RGBA buffers are outside Image3's codec memory estimate.
          // Keep only one resizing job live; cancelled queued jobs exit promptly.
          releaseResize = await resizePermits.current.acquire(controller.signal);
        }
        let attempt = 0;

        while (attempt < 2) {
          attempt += 1;

          try {
            const result = await pool.convert(
              {
                data: item.file,
                name: item.file.name,
                ...(item.file.type ? { mimeType: item.file.type } : {}),
              },
              options,
              {
                signal: controller.signal,
                onProgress: (progress) => {
                  dispatch({
                    type: 'progress',
                    id,
                    progress: progress.ratio,
                    stage: progress.stage,
                  });
                },
              },
            );

            dispatch({ type: 'success', id, result, operation });
            return result;
          } catch (error) {
            if (
              attempt < 2 &&
              error instanceof Image3CoreError &&
              error.code === 'INTERNAL_ERROR' &&
              !controller.signal.aborted
            ) {
              continue;
            }

            throw error;
          }
        }
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof Image3CoreError && error.code === 'CANCELLED')
        ) {
          dispatch({ type: 'cancelled', id });
          return undefined;
        }

        dispatch({
          type: 'error',
          id,
          error: getErrorMessage(error),
        });
      } finally {
        releaseResize?.();
        controllers.current.delete(id);
      }

      return undefined;
    },
    [],
  );

  const convertAll = useCallback(async (operation: OperationId = 'convert') => {
    const ids = stateRef.current.items
      .filter((item) => item.status !== 'converting' && (item.result === undefined || item.resultOperation !== operation))
      .map((item) => item.id);

    await Promise.allSettled(ids.map((id) => convertItem(id, operation)));
  }, [convertItem]);

  const cancelItem = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const cancelAll = useCallback(() => {
    for (const controller of controllers.current.values()) {
      controller.abort();
    }
  }, []);

  const retryItem = useCallback(
    async (id: string, operation: OperationId = 'convert') => {
      dispatch({ type: 'reset', id });
      return convertItem(id, operation);
    },
    [convertItem],
  );

  const downloadItem = useCallback((id: string) => {
    const result = stateRef.current.items.find(
      (item) => item.id === id,
    )?.result;

    if (result) downloadResult(result);
  }, []);

  const downloadAll = useCallback((operation: OperationId = 'convert') => {
    const results = stateRef.current.items.flatMap((item) =>
      item.result && item.resultOperation === operation ? [item.result] : [],
    );

    downloadResults(results);
  }, []);

  return {
    state,
    addFiles,
    removeItem,
    clearItems,
    updateSettings,
    convertItem,
    convertAll,
    cancelItem,
    cancelAll,
    retryItem,
    downloadItem,
    downloadAll,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Image3CoreError) {
    switch (error.code) {
      case 'INVALID_FILE':
        return error.message.startsWith('Resize:') ? error.message : 'Invalid image file.';
      case 'UNSUPPORTED_FORMAT':
        return error.message.startsWith('Resize:') ? error.message : 'Unsupported image format.';
      case 'DECODE_FAILED':
        return error.message.startsWith('Resize:') ? error.message : 'The image could not be decoded.';
      case 'ENCODE_FAILED':
        return 'The image could not be encoded.';
      case 'OUT_OF_MEMORY':
        return error.message.startsWith('Resize:') ? error.message : 'Not enough memory to convert this image.';
      case 'CANCELLED':
        return 'Conversion cancelled.';
      case 'INTERNAL_ERROR':
        return 'Conversion failed unexpectedly.';
    }
  }

  return error instanceof Error ? error.message : 'Conversion failed.';
}
