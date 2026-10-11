export type FixtureMode = 'offscreen-worker' | 'main-thread-fallback';

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Test stopped', 'AbortError');
}

async function fallbackCanvas(width: number, height: number, variant: number, signal: AbortSignal): Promise<Blob> {
  checkAbort(signal);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas unavailable');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#254c92');
  gradient.addColorStop(0.5, '#b46a97');
  gradient.addColorStop(1, '#e9a848');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,.65)';
  ctx.lineWidth = 2;
  for (let x = 24 + variant * 3; x < width; x += 31) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + 9, height - 20);
    ctx.stroke();
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG fixture encoding failed')), 'image/png');
  });
  canvas.width = canvas.height = 1;
  checkAbort(signal);
  return blob;
}

/** One serial fixture worker; retain an explicit fallback for browsers without OffscreenCanvas. */
export class FixtureProvider {
  private worker: Worker | undefined;
  private sequence = 0;
  mode: FixtureMode = 'offscreen-worker';
  constructor() {
    try {
      this.worker = new Worker(new URL('./fixture.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      this.mode = 'main-thread-fallback';
    }
  }
  async make(width: number, height: number, signal: AbortSignal, variant = 0): Promise<Blob> {
    checkAbort(signal);
    if (!this.worker) return fallbackCanvas(width, height, variant, signal);
    const worker = this.worker;
    const id = ++this.sequence;
    let unsupported = false;
    let result: Blob | undefined;
    try {
      result = await new Promise<Blob | undefined>((resolve, reject) => {
        const cleanup = () => {
          worker.removeEventListener('message', receive);
          worker.removeEventListener('error', fail);
          signal.removeEventListener('abort', abort);
        };
        const receive = (event: MessageEvent<{id:number;blob?:Blob;unsupported?:boolean}>) => {
          if (event.data.id !== id) return;
          cleanup();
          unsupported = !!event.data.unsupported;
          if (event.data.blob instanceof Blob) resolve(event.data.blob);
          else if (unsupported) resolve(undefined);
          else reject(new Error('Invalid fixture worker response'));
        };
        const fail = () => { cleanup(); unsupported = true; resolve(undefined); };
        const abort = () => {
          cleanup();
          this.close();
          reject(new DOMException('Test stopped', 'AbortError'));
        };
        worker.addEventListener('message', receive);
        worker.addEventListener('error', fail);
        signal.addEventListener('abort', abort, { once: true });
        worker.postMessage({ id, width, height, variant });
      });
    } finally {
      checkAbort(signal);
    }
    if (unsupported || !result) {
      this.close();
      this.mode = 'main-thread-fallback';
      return fallbackCanvas(width, height, variant, signal);
    }
    return result;
  }
  close(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }
}
