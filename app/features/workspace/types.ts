import type {
  ConversionOptions,
  ConversionResult,
  ConversionStage,
  ImageFormat,
} from '../../../src/index.js';
import { DEFAULT_MAX_WIDTH } from '../../lib/resizeSettings.js';

export type WorkspaceItemStatus =
  | 'ready'
  | 'converting'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface WorkspaceItem {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
  readonly status: WorkspaceItemStatus;
  readonly stage: ConversionStage | undefined;
  readonly progress: number;
  readonly result: ConversionResult | undefined;
  readonly overrideSettings?: WorkspaceSettings | undefined;
  readonly error: string | undefined;
}

export interface WorkspaceSettings {
  readonly format: ImageFormat;
  readonly quality: number;
  readonly pngCompressionLevel: 1 | 2 | 3 | 4 | 5 | 6;
  readonly webpLossless: boolean;
  readonly jpegBackground: readonly [number, number, number];
  readonly resizeEnabled: boolean;
  readonly resizeMaxWidth: number;
}

export interface WorkspaceState {
  readonly items: readonly WorkspaceItem[];
  readonly settings: WorkspaceSettings;
}

export type WorkspaceAction =
  | { readonly type: 'add'; readonly items: readonly WorkspaceItem[] }
  | { readonly type: 'remove'; readonly id: string }
  | { readonly type: 'settings-item'; readonly id: string; readonly patch: Partial<WorkspaceSettings> }
  | { readonly type: 'clear' }
  | {
      readonly type: 'settings';
      readonly patch: Partial<WorkspaceSettings>;
    }
  | { readonly type: 'start'; readonly id: string }
  | {
      readonly type: 'progress';
      readonly id: string;
      readonly progress: number;
      readonly stage: ConversionStage;
    }
  | {
      readonly type: 'success';
      readonly id: string;
      readonly result: ConversionResult;
    }
  | { readonly type: 'error'; readonly id: string; readonly error: string }
  | { readonly type: 'cancelled'; readonly id: string }
  | { readonly type: 'reset'; readonly id: string };

export const initialWorkspaceState: WorkspaceState = {
  items: [],
  settings: {
    format: 'webp',
    quality: 82,
    pngCompressionLevel: 2,
    webpLossless: false,
    jpegBackground: [255, 255, 255],
    resizeEnabled: false,
    resizeMaxWidth: DEFAULT_MAX_WIDTH,
  },
};

export function buildConversionOptions(
  settings: WorkspaceSettings,
): ConversionOptions {
  switch (settings.format) {
    case 'jpeg':
      return {
        format: 'jpeg',
        quality: settings.quality,
        background: settings.jpegBackground,
      };
    case 'png':
      return {
        format: 'png',
        compressionLevel: settings.pngCompressionLevel,
      };
    case 'webp':
      return {
        format: 'webp',
        quality: settings.quality,
        lossless: settings.webpLossless,
      };
  }
}
