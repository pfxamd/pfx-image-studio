import { test, expect } from '@playwright/test';
import type { ConversionResult, ImageFormat } from '../src/types/core.js';
import type { WorkerResponse } from '../src/workers/protocol.js';

test('raw RGBA resize feeds Image3 codecs without creating PNG intermediate', async ({ page }) => {
  await page.goto('/');

  // Resize is now a separate UI operation which preserves the input format.
  // Exercise the application worker directly to retain all three codec targets
  // without depending on the removed combined resize/conversion controls.
  const results = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 40;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ed2323'; ctx.fillRect(0, 0, 32, 40);
    ctx.fillStyle = 'rgba(1, 210, 25, .4)'; ctx.fillRect(32, 0, 32, 40);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG failed')), 'image/png');
    });

    async function convert(format: ImageFormat, maxWidth?: number) {
      const worker = new Worker('/app/workers/studio-conversion.worker.ts', { type: 'module' });
      try {
        const result = await new Promise<ConversionResult>((resolve, reject) => {
          worker.onerror = event => reject(new Error(event.message));
          worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            if (event.data.type === 'complete') resolve(event.data.result);
            if (event.data.type === 'error') reject(new Error(event.data.error.message));
          };
          worker.postMessage({
            type: 'convert', jobId: format, input: blob, name: 'sample.png', mimeType: 'image/png',
            options: { format, ...(maxWidth === undefined ? {} : { rasterMaxWidth: maxWidth }) },
          });
        });
        const bitmap = await createImageBitmap(new Blob([result.buffer], { type: result.mimeType }));
        const decoded = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return { format, width: result.width, height: result.height, name: result.outputName,
          bytes: Array.from(new Uint8Array(result.buffer).subarray(0, 12)), decoded };
      } finally {
        worker.terminate();
      }
    }

    const resized = [];
    for (const format of ['webp', 'png', 'jpeg'] as const) resized.push(await convert(format, 32));
    return { resized, original: await convert('jpeg') };
  });

  expect(results.resized).toHaveLength(3);
  for (const result of results.resized) {
    expect([result.width, result.height]).toEqual([32, 20]);
    expect(result.decoded).toEqual({ width: 32, height: 20 });
    expect(result.name).toBe('sample.' + (result.format === 'jpeg' ? 'jpg' : result.format));
    if (result.format === 'png') expect(result.bytes.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    if (result.format === 'jpeg') expect(result.bytes.slice(0, 2)).toEqual([255, 216]);
    if (result.format === 'webp') expect(String.fromCharCode(...result.bytes.slice(8, 12))).toBe('WEBP');
  }
  expect([results.original.width, results.original.height]).toEqual([64, 40]);
  expect(results.original.decoded).toEqual({ width: 64, height: 40 });
});
