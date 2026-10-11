import type { ImageInfo } from '@pfxamd/raster-core/browser';

/**
 * Raster Core is deliberately advisory in Image Studio v0.2:
 * its browser engine inspects source metadata without changing the existing
 * WASM-backed Image3 conversion pipeline.
 */
export type RasterInspection = Pick<
  ImageInfo, 'format' | 'width' | 'height' | 'hasAlpha' | 'hasIccProfile' | 'orientation'
>;

export const MAX_INSPECTION_BYTES = 16 * 1024 * 1024;

export async function inspectRasterFile(file: File): Promise<RasterInspection> {
  // A second full decode of large images is expensive on memory-limited devices.
  // Conversion remains available regardless of this advisory cap.
  if (file.size > MAX_INSPECTION_BYTES) {
    throw new Error('Source inspection skipped for large files.');
  }

  const { createRasterCore } = await import('@pfxamd/raster-core/browser');
  const core = createRasterCore();
  const source = new Uint8Array(await file.arrayBuffer());
  const { format, width, height, hasAlpha, hasIccProfile, orientation } =
    await core.inspect(source);
  return { format, width, height, hasAlpha, hasIccProfile, orientation };
}
