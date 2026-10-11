/// <reference lib="webworker" />

import { createRasterCore, resizeToRgba, RasterError } from '@pfxamd/raster-core/browser';
import { defaultCodecRegistry } from '../../src/codecs/registry.js';
import { Image3CoreError, toCoreError } from '../../src/errors/core-error.js';
import { buildOutputName, outputDescriptor } from '../../src/output/output.js';
import { convertInline } from '../../src/pipeline/convert.js';
import type { ConversionResult } from '../../src/types/core.js';
import type { WorkerRequest, WorkerResponse } from '../../src/workers/protocol.js';
import { validateResizeWidth, type StudioResizeOptions } from '../lib/resizeSettings.js';
import { timingRegistry, type TimedConversionResult, type DiagnosticWorkerTiming } from './diagnosticTiming.js';

const scope = self as DedicatedWorkerGlobalScope;

// The frozen Image3 conversion pipeline is unchanged. The application worker
// now passes Raster Core's resized RGBA directly to the SAME registered codecs
// instead of allocating, encoding and decoding an intermediate PNG.
scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void runConversion(event.data);
});

async function runConversion(request: WorkerRequest): Promise<void> {
  const started = performance.now();
  const diagnostic = (request.options as typeof request.options & { diagnosticTiming?: boolean }).diagnosticTiming === true;
  const stages: Partial<DiagnosticWorkerTiming> = {};
  const finish = (result: ConversionResult): TimedConversionResult => diagnostic
    ? { ...result, diagnosticTiming: { ...stages, workerElapsedMs: performance.now() - started } }
    : result;
  try {
    const maxWidth = (request.options as typeof request.options & StudioResizeOptions).rasterMaxWidth;

    if (maxWidth !== undefined) {
      validateResizeWidth(maxWidth);
      post({ type: 'progress', jobId: request.jobId, progress: { stage: 'validating', ratio: 0.05 } });

      const inspectionStart = performance.now();
      const source = new Uint8Array(request.input instanceof Blob
        ? await request.input.arrayBuffer() : request.input);
      const original = await createRasterCore().inspect(source);
      if (diagnostic) stages.inputReadInspectMs = performance.now() - inspectionStart;

      if (original.width > maxWidth) {
        post({ type: 'progress', jobId: request.jobId, progress: { stage: 'processing', ratio: 0.2 } });
        // Resampling is bounded inside Raster Core and respects EXIF orientation.
        // ICC-to-sRGB conversion remains an explicit resize opt-in.
        const resized = await resizeToRgba(source, {
          resize: { width: maxWidth, kernel: 'lanczos3' }, colorProfile: 'srgb'
        }, undefined, diagnostic ? metrics => {
          stages.bitmapDecodeMs = metrics.bitmapDecodeMs;
          stages.pixelExtractionMs = metrics.pixelExtractionMs;
          stages.resampleMs = metrics.resampleMs;
        } : undefined);
        post({ type: 'progress', jobId: request.jobId, progress: { stage: 'encoding', ratio: 0.7 } });

        // Same codecs, quality, PNG compression and alpha flattening controls
        // as Image3. No intermediate PNG bytes exist in this code path.
        const encoderStart = performance.now();
        const encoded = await defaultCodecRegistry.get(request.options.format).encode(
          resized, request.options
        );
        if (diagnostic) stages.codecEncodeMs = performance.now() - encoderStart;
        const descriptor = outputDescriptor(request.options.format);
        const outputName = buildOutputName(request.name, request.options.format);
        const result: ConversionResult = {
          buffer: encoded,
          sourceFormat: original.format as ConversionResult['sourceFormat'],
          targetFormat: request.options.format,
          mimeType: descriptor.mimeType,
          extension: descriptor.extension,
          width: resized.width,
          height: resized.height,
          inputBytes: source.byteLength,
          outputBytes: encoded.byteLength,
          ...(outputName === undefined ? {} : { outputName }),
        };
        post({ type: 'progress', jobId: request.jobId, progress: { stage: 'completed', ratio: 1 } });
        post({ type: 'complete', jobId: request.jobId, result: finish(result) }, [result.buffer]);
        return;
      }
    }

    // Unchanged input, including disabled resizing and no-enlargement cases:
    // execute the exact pre-existing Image3 conversion pipeline.
    const result = await convertInline({
      input: {
        data: request.input,
        ...(request.name ? { name: request.name } : {}),
        ...(request.mimeType ? { mimeType: request.mimeType } : {}),
      },
      options: request.options,
      ...(diagnostic ? { registry: timingRegistry(stages) } : {}),
      onProgress: (progress) => {
        post({
          type: 'progress', jobId: request.jobId,
          progress: maxWidth === undefined ? progress : {
            stage: progress.stage,
            ratio: 0.2 + 0.8 * progress.ratio,
          },
        });
      },
    });
    post({ type: 'complete', jobId: request.jobId, result: finish(result) }, [result.buffer]);
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
