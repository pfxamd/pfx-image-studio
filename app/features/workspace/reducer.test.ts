import { describe, expect, it } from 'vitest';
import { workspaceReducer } from './reducer.js';
import { initialWorkspaceState, type WorkspaceItem } from './types.js';

function makeItem(id = 'image-1'): WorkspaceItem {
  return {
    id, file: {} as File, previewUrl: 'blob:test',
    status: 'ready', stage: undefined, progress: 0,
    result: undefined, error: undefined,
  };
}

function completedItem(id: string): WorkspaceItem {
  return {
    ...makeItem(id), status: 'completed', progress: 1, stage: 'completed',
    result: {
      buffer: new ArrayBuffer(1),
      sourceFormat: 'png', targetFormat: 'webp',
      mimeType: 'image/webp', extension: 'webp',
      width: 1, height: 1, inputBytes: 10, outputBytes: 8,
    },
  };
}

describe('workspaceReducer', () => {
  it('tracks conversion progress and completion', () => {
    const withItem = workspaceReducer(initialWorkspaceState, {
      type: 'add', items: [makeItem()],
    });
    const started = workspaceReducer(withItem, { type: 'start', id: 'image-1' });
    const progressed = workspaceReducer(started, {
      type: 'progress', id: 'image-1', progress: 0.7, stage: 'encoding',
    });
    expect(progressed.items[0]).toMatchObject({
      status: 'converting', progress: 0.7, stage: 'encoding',
    });
  });

  it('invalidates all output on shared settings change', () => {
    const state = { ...initialWorkspaceState, items: [completedItem('a'), completedItem('b')] };
    const next = workspaceReducer(state, { type: 'settings', patch: { format: 'jpeg' } });
    expect(next.settings.format).toBe('jpeg');
    expect(next.items.every((item) => item.result === undefined && item.status === 'ready')).toBe(true);
  });

  it('keeps unrelated converted results when editing selected image settings', () => {
    const state = { ...initialWorkspaceState, items: [completedItem('a'), completedItem('b')] };
    const next = workspaceReducer(state, {
      type: 'settings-item', id: 'a', patch: { format: 'jpeg', quality: 76 },
    });
    expect(next.items[0]?.result).toBeUndefined();
    expect(next.items[0]?.overrideSettings?.format).toBe('jpeg');
    expect(next.items[0]?.overrideSettings?.quality).toBe(76);
    expect(next.items[1]?.result).toBe(state.items[1]?.result);
    expect(next.settings.format).toBe('webp');
  });

  it('keeps resizing disabled by default and invalidates outputs on resize changes', () => {
    expect(initialWorkspaceState.settings.resizeEnabled).toBe(false);
    expect(initialWorkspaceState.settings.resizeMaxWidth).toBe(1200);
    const state = { ...initialWorkspaceState, items: [completedItem('a')] };
    const modified = workspaceReducer(state, {
      type: 'settings', patch: { resizeEnabled: true, resizeMaxWidth: 800 },
    });
    expect(modified.items[0]?.result).toBeUndefined();
    expect(modified.items[0]?.status).toBe('ready');
    expect(modified.settings.resizeEnabled).toBe(true);
    expect(modified.settings.resizeMaxWidth).toBe(800);
  });

  it('supports resizing for selected files only', () => {
    const state = { ...initialWorkspaceState, items: [completedItem('a'), completedItem('b')] };
    const next = workspaceReducer(state, {
      type: 'settings-item', id: 'a',
      patch: { resizeEnabled: true, resizeMaxWidth: 640 },
    });
    expect(next.items[0]?.overrideSettings?.resizeEnabled).toBe(true);
    expect(next.items[0]?.overrideSettings?.resizeMaxWidth).toBe(640);
    expect(next.items[1]?.result).toBe(state.items[1]?.result);
    expect(next.settings.resizeEnabled).toBe(false);
  });

  it('clears per-item overrides when the global settings change', () => {
    const overridden = { ...makeItem(), overrideSettings: { ...initialWorkspaceState.settings, format: 'jpeg' as const } };
    const state = { ...initialWorkspaceState, items: [overridden] };
    const next = workspaceReducer(state, { type: 'settings', patch: { quality: 50 } });
    expect(next.items[0]?.overrideSettings).toBeUndefined();
  });
});
