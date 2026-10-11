/// <reference lib="webworker" />

import { createRasterCore, RasterError } from '@pfxamd/raster-core/browser';
import { Image3CoreError, toCoreError } from '../../src/errors/core-error.js';
import { convertInline } from '../../src/pipeline/convert.js';
import type { ConversionResult } from '../../src/types/core.js';
import type { WorkerRequest, WorkerResponse } from '../../src/workers/protocol.js';
import { validateResizeWidth, type StudioResizeOptions } from '../lib/resizeSettings.js';

const scope = self as DedicatedWorkerGlobalScope;

// Image3's frozen conversion engine, memory scheduler and cancellation policy
// remain unchanged. This app-only worker adds optional preprocessing.
scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void runConversion(event.data);
});

async function runConversion(request: WorkerRequest): Promise<void> {
  try {
    const maxWidth = (request.options as typeof request.options & StudioResizeOptions).rasterMaxWidth;
    let input: Blob | ArrayBuffer = request.input;
    let originalBytes: number | undefined;
    let originalFormat: ConversionResult['sourceFormat'] | undefined;

    if (maxWidth !== undefined) {
      validateResizeWidth(maxWidth);
      post({ type: 'progress', jobId: request.jobId, progress: { stage: 'processing', ratio: 0.06 } });

      // Preprocessing runs inside the scheduled Image3 worker, so cancellation
      // retires this worker, not a separate unbounded canvas operation.
      const source = new Uint8Array(request.input instanceof Blob
        ? await request.input.arrayBuffer() : request.input);
      originalBytes = source.byteLength;
      const raster = createRasterCore();
      const info = await raster.inspect(source);
      originalFormat = info.format as ConversionResult['sourceFormat'];

      if (info.width > maxWidth) {
        // Explicit user opt-in: browser Canvas converts ICC-managed images to
        // sRGB; pixel/color profile identity with original is not promised.
        const resized = await raster.process(source, {
          resize: { width: maxWidth },
          format: 'png',
          colorProfile: 'srgb',
        });
        input = new Uint8Array(resized.data).buffer;
      }
      post({ type: 'progress', jobId: request.jobId, progress: { stage: 'processing', ratio: 0.32 } });
    }

    // The same frozen Image3 conversion code and target WASM codec are used
    // for regular and downscaled images. Never change user quality options.
    const converted = await convertInline({
      input: {
        data: input,
        ...(request.name ? { name: request.name } : {}),
        ...(input !== request.input
          ? { mimeType: 'image/png' } : request.mimeType ? { mimeType: request.mimeType } : {}),
      },
      options: request.options,
      onProgress: (progress) => {
        post({
          type: 'progress', jobId: request.jobId,
          progress: maxWidth === undefined ? progress : {
            stage: progress.stage,
            ratio: 0.32 + 0.68 * progress.ratio,
          },
        });
      },
    });

    // Report the original (not intermediate PNG) size and source format so
    // savings and provenance remain accurate when resizing is enabled.
    const result: ConversionResult = originalBytes === undefined
      ? converted
      : { ...converted, inputBytes: originalBytes, sourceFormat: originalFormat! };
    post({ type: 'complete', jobId: request.jobId, result }, [result.buffer]);
  } catch (error) {
    const coreError = error instanceof Image3CoreError
      ? error
      : error instanceof RasterError
        ? new Image3CoreError(
          error.code === 'PIXEL_LIMIT_EXCEEDED' || error.code === 'INPUT_TOO_LARGE' ||
          error.code === 'OUTPUT_TOO_LARGE' ? 'OUT_OF_MEMORY'
            : error.code === 'UNSUPPORTED_FORMAT' || error.code === 'UNSUPPORTED_ANIMATION'
              ? 'UNSUPPORTED_FORMAT' : 'DECODE_FAILED',
          'Resize: ' + error.message, error,
        )
        : error instanceof RangeError
          ? new Image3CoreError('INVALID_FILE', 'Resize: ' + error.message, error)
          : toCoreError(error, 'INTERNAL_ERROR', 'Worker conversion failed.');
    post({
      type: 'error', jobId: request.jobId,
      error: { code: coreError.code, message: coreError.message },
    });
  }
}

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}
