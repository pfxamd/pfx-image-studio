import type { ImageFormat } from '../../src/index.js';

export type OperationId = 'convert' | 'optimize' | 'resize' | 'inspect';

export interface StudioOperation {
  readonly id: OperationId;
  readonly label: string;
  readonly detail: string;
  readonly symbol: string;
  readonly action: string | null;
}

export const STUDIO_OPERATIONS: readonly StudioOperation[] = [
  { id: 'convert', label: 'Convert', detail: 'Change file format', symbol: '↗', action: 'Convert image' },
  { id: 'optimize', label: 'Optimize', detail: 'Fine-tune file size', symbol: '◈', action: 'Optimize image' },
  { id: 'resize', label: 'Resize', detail: 'Set maximum width', symbol: '⤢', action: 'Resize image' },
  { id: 'inspect', label: 'Inspect', detail: 'Examine the original', symbol: '◎', action: null },
];

export function sourceFormat(file: File): ImageFormat {
  const mime = file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (mime === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (mime === 'image/webp' || ext === 'webp') return 'webp';
  return 'png';
}

export function operationSettings(operation: OperationId, format: ImageFormat, original: ImageFormat) {
  return {
    format: operation === 'convert' ? format : original,
    resize: operation === 'resize',
  };
}
