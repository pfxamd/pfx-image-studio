/** Optional downscaling policy. The Image3 codec controls are unchanged. */
export const DEFAULT_MAX_WIDTH = 1200;
export const MAX_ALLOWED_WIDTH = 8192;

export function validateResizeWidth(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ALLOWED_WIDTH) {
    throw new RangeError('Maximum width must be an integer between 1 and 8192 pixels.');
  }
}

/** Private extension carried through the existing worker-pool message. */
export interface StudioResizeOptions {
  readonly rasterMaxWidth?: number;
}
