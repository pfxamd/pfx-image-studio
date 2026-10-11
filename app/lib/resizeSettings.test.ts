import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_WIDTH, MAX_ALLOWED_WIDTH, validateResizeWidth } from './resizeSettings.js';

describe('optional max-width resize policy', () => {
  it('uses a reasonable disabled-by-default width, not an automatic crop', () => {
    expect(DEFAULT_MAX_WIDTH).toBe(1200);
    expect(MAX_ALLOWED_WIDTH).toBe(8192);
    expect(() => validateResizeWidth(DEFAULT_MAX_WIDTH)).not.toThrow();
  });

  it('rejects empty, fractional, infinite and oversized widths', () => {
    for (const width of [0, -2, 2.5, NaN, Infinity, 8193]) {
      expect(() => validateResizeWidth(width)).toThrow(RangeError);
    }
    expect(() => validateResizeWidth(1)).not.toThrow();
    expect(() => validateResizeWidth(8192)).not.toThrow();
  });
});
