import { CodecRegistry, defaultCodecRegistry } from '../../src/codecs/registry.js';
import type { ImageCodec } from '../../src/codecs/codec.js';
import type { ConversionResult, ImageFormat } from '../../src/types/core.js';

export interface DiagnosticWorkerTiming {
  /** From worker message handler entry until just before response transfer. */
  readonly workerElapsedMs: number;
  readonly inputReadInspectMs?: number;
  /** Native browser image decode, as reported by Raster Core. */
  readonly bitmapDecodeMs?: number;
  /** Draw and getImageData extraction, as reported by Raster Core. */
  readonly pixelExtractionMs?: number;
  /** Actual Lanczos3 pixels-only filtering duration. */
  readonly resampleMs?: number;
  /** Original Image3 decoder, including lazy WASM imports if cold. */
  readonly codecDecodeMs?: number;
  /** Original Image3 encoder, including lazy WASM imports if cold. */
  readonly codecEncodeMs?: number;
}

export interface TimedConversionResult extends ConversionResult {
  readonly diagnosticTiming?: DiagnosticWorkerTiming;
}

/**
 * Diagnostic-only wrappers; original Image3 codec implementations and
 * non-diagnostic conversion paths are unchanged.
 */
export function timingRegistry(
  target: { codecDecodeMs?: number; codecEncodeMs?: number }
): CodecRegistry {
  const codecs: ImageCodec[] = (['jpeg', 'png', 'webp'] as const).map(
    (format: ImageFormat) => {
      const codec = defaultCodecRegistry.get(format);
      return {
        format: codec.format,
        capabilities: codec.capabilities,
        async decode(input) {
          const started = performance.now();
          try { return await codec.decode(input); }
          finally { target.codecDecodeMs = performance.now() - started; }
        },
        async encode(image, options) {
          const started = performance.now();
          try { return await codec.encode(image, options); }
          finally { target.codecEncodeMs = performance.now() - started; }
        }
      };
    }
  );
  return new CodecRegistry(codecs);
}
