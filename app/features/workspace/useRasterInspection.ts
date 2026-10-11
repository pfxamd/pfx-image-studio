import { useEffect, useState } from 'react';
import { inspectRasterFile, type RasterInspection } from '../../lib/rasterInspection.js';

export type InspectionState =
  | { readonly status: 'empty' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly info: RasterInspection }
  | { readonly status: 'unavailable' };

/** Inspect only the selected file. Never block or modify Image3 conversions. */
export function useRasterInspection(file: File | undefined): InspectionState {
  const [entry, setEntry] = useState<{
    readonly file: File;
    readonly state: InspectionState;
  }>();

  useEffect(() => {
    if (!file) return;
    let active = true;
    void inspectRasterFile(file).then(
      (info) => {
        if (active) setEntry({ file, state: { status: 'ready', info } });
      },
      () => {
        // Unsupported, malformed, large and undecodable files still use the
        // original converter's independent validation and error handling.
        if (active) setEntry({ file, state: { status: 'unavailable' } });
      },
    );
    return () => { active = false; };
  }, [file]);

  if (!file) return { status: 'empty' };
  if (entry?.file === file) return entry.state;
  return { status: 'loading' };
}
