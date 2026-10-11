import { describe, expect, it, vi } from 'vitest';
import { inspectRasterFile, MAX_INSPECTION_BYTES } from './rasterInspection.js';

const inspect = vi.fn(async () => ({
  format: 'png' as const,
  width: 4,
  height: 3,
  hasAlpha: true,
  hasIccProfile: false,
  orientation: 1,
  bytes: 12,
}));
const createRasterCore = vi.fn(() => ({ inspect }));

vi.mock('@pfxamd/raster-core/browser', () => ({ createRasterCore }));

function image(size: number): File {
  return {
    size,
    arrayBuffer: vi.fn(async () => Uint8Array.of(137, 80, 78, 71).buffer),
  } as unknown as File;
}

describe('Raster Core integration', () => {
  it('reads source dimensions/alpha/ICC from the separate raster library', async () => {
    inspect.mockClear();
    const file = image(4);
    const info = await inspectRasterFile(file);
    expect(info).toEqual({
      format: 'png', width: 4, height: 3,
      hasAlpha: true, hasIccProfile: false, orientation: 1,
    });
    expect(createRasterCore).toHaveBeenCalled();
    expect(inspect).toHaveBeenCalledOnce();
    expect(file.arrayBuffer).toHaveBeenCalledOnce();
  });

  it('skips a huge source before copying it into memory', async () => {
    const file = image(MAX_INSPECTION_BYTES + 1);
    await expect(inspectRasterFile(file)).rejects.toThrow('large files');
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });
});
