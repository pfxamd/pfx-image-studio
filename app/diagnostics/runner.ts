import { createImage3WorkerPool } from '../lib/createWorkerPool.js';
import type { Image3WorkerPool } from '../../src/index.js';
import { studioVersion } from '../release.js';

type HeapPerformance = Performance & {
  memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
};
type NavigatorDevice = Navigator & { deviceMemory?: number };

interface CaseSpec {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly maxWidth: number | null;
  readonly repeats: number;
}

export interface DiagnosticCase {
  readonly label: string;
  readonly source: string;
  readonly target: string;
  readonly repetitions: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly maxMs: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly outputFormat: 'webp';
  readonly estimatedPixelBufferMiB: number | null;
}

export interface PhoneDiagnosticReport {
  readonly schemaVersion: 1;
  readonly product: 'PFx Image Studio';
  readonly release: string;
  readonly createdAt: string;
  readonly note: string;
  readonly platform: {
    readonly browser: string;
    readonly screenCssPixels: string;
    readonly devicePixelRatio: number;
    readonly logicalProcessors: number | null;
    readonly reportedDeviceMemoryGiB: number | null;
  };
  readonly memory: {
    readonly kind: 'js-heap-estimate-only' | 'unavailable';
    readonly beforeMiB: number | null;
    readonly afterMiB: number | null;
    readonly maxObservedMiB: number | null;
    readonly warning: string;
  };
  readonly responsiveness: {
    readonly animationFrames: number;
    readonly longestFrameGapMs: number | null;
    readonly gapsAbove50ms: number;
  };
  readonly cases: readonly DiagnosticCase[];
  readonly totalElapsedMs: number;
  readonly result: 'passed';
}

const CASES: readonly CaseSpec[] = [
  { label: 'Original conversion', width: 1280, height: 800, maxWidth: null, repeats: 1 },
  { label: 'Medium downscale', width: 1600, height: 1000, maxWidth: 800, repeats: 1 },
  { label: 'Large downscale', width: 2400, height: 1600, maxWidth: 1200, repeats: 1 },
  { label: '10-image sequential batch', width: 960, height: 640, maxWidth: 480, repeats: 10 },
];

const round = (value: number, digits = 1): number =>
  Number(value.toFixed(digits));

function heapMiB(): number | null {
  const used = (performance as HeapPerformance).memory?.usedJSHeapSize;
  return typeof used === 'number' && Number.isFinite(used)
    ? round(used / 1048576) : null;
}

function browserLabel(): string {
  const agent = navigator.userAgent;
  if (/firefox/i.test(agent)) return 'Firefox';
  if (/edg\//i.test(agent)) return 'Edge';
  if (/chrome|crios/i.test(agent)) return 'Chromium-based';
  if (/safari/i.test(agent)) return 'Safari';
  return 'Other browser';
}

async function fixture(width: number, height: number, signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('The browser cannot create a 2D canvas.');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#254c92');
  gradient.addColorStop(0.5, '#b46a97');
  gradient.addColorStop(1, '#e9a848');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,.65)';
  ctx.lineWidth = 2;
  for (let x = 24; x < width; x += 31) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + 9, height - 20);
    ctx.stroke();
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) :
      reject(new Error('PNG fixture encoding failed')), 'image/png');
  });
  // Relinquish the large canvas immediately, before worker allocations begin.
  canvas.width = 1;
  canvas.height = 1;
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  return blob;
}

/** Run the actual Studio WorkerPool + Raster Core and Image3 WebP codec on device. */
export async function runPhoneDiagnostics(
  signal: AbortSignal,
  onProgress: (completed: number, total: number, description: string) => void
): Promise<PhoneDiagnosticReport> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const beforeMiB = heapMiB();
  let maxObservedMiB = beforeMiB;
  let frameCount = 0;
  let frameGapsOver50 = 0;
  let longestFrameGap = 0;
  let lastFrame: number | undefined;
  let watchingFrames = true;
  const frame = (now: number) => {
    if (!watchingFrames) return;
    frameCount++;
    if (lastFrame !== undefined) {
      const gap = now - lastFrame;
      longestFrameGap = Math.max(longestFrameGap, gap);
      if (gap > 50) frameGapsOver50++;
    }
    lastFrame = now;
    const currentHeap = heapMiB();
    if (currentHeap !== null) {
      maxObservedMiB = Math.max(maxObservedMiB ?? 0, currentHeap);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  let pool: Image3WorkerPool | undefined;
  const cases: DiagnosticCase[] = [];
  const total = CASES.reduce((sum, entry) => sum + entry.repeats, 0);
  let completed = 0;
  try {
    pool = createImage3WorkerPool();
    for (const spec of CASES) {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      onProgress(completed, total, 'Preparing ' + spec.label);
      const source = await fixture(spec.width, spec.height, signal);
      const times: number[] = [];
      let outputBytes = 0;
      let outputW = 0;
      let outputH = 0;
      for (let index = 0; index < spec.repeats; index++) {
        if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
        onProgress(completed, total, spec.label + ' · ' + (index + 1) + '/' + spec.repeats);
        const options = {
          format: 'webp' as const,
          quality: 82,
          ...(spec.maxWidth === null ? {} : { rasterMaxWidth: spec.maxWidth })
        };
        const caseStart = performance.now();
        const output = await pool.convert(
          { data: source, name: 'diagnostic.png', mimeType: 'image/png' },
          options,
          { signal }
        );
        const bytes = new Uint8Array(output.buffer);
        if (bytes.length < 16 ||
            String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') {
          throw new Error('Output format verification failed for ' + spec.label);
        }
        const expectedWidth = spec.maxWidth ?? spec.width;
        const expectedHeight = Math.round(spec.height * expectedWidth / spec.width);
        if (output.width !== expectedWidth || output.height !== expectedHeight) {
          throw new Error('Dimensions mismatch for ' + spec.label);
        }
        outputBytes = output.outputBytes;
        outputW = output.width;
        outputH = output.height;
        times.push(performance.now() - caseStart);
        completed++;
        onProgress(completed, total, spec.label);
      }

      const estimatedPixelBufferMiB = spec.maxWidth === null ? null
        : round((
          spec.width * spec.height * 4 +
          Math.min(outputW * spec.height, spec.width * outputH) * 16 +
          outputW * outputH * 4
        ) / 1048576);
      cases.push({
        label: spec.label,
        source: spec.width + 'x' + spec.height,
        target: outputW + 'x' + outputH,
        repetitions: spec.repeats,
        totalMs: round(times.reduce((sum, ms) => sum + ms, 0)),
        meanMs: round(times.reduce((sum, ms) => sum + ms, 0) / times.length),
        maxMs: round(Math.max(...times)),
        inputBytes: source.size,
        outputBytes,
        outputFormat: 'webp',
        estimatedPixelBufferMiB
      });
    }
    const afterMiB = heapMiB();
    const deviceMemory = (navigator as NavigatorDevice).deviceMemory;
    return {
      schemaVersion: 1,
      product: 'PFx Image Studio',
      release: studioVersion,
      createdAt: startedAt,
      note: 'Synthetic, local-only test using the real image processing workers. Does not upload images or measure native/browser peak RSS.',
      platform: {
        browser: browserLabel(),
        screenCssPixels: screen.width + 'x' + screen.height,
        devicePixelRatio: round(devicePixelRatio, 2),
        logicalProcessors: navigator.hardwareConcurrency || null,
        reportedDeviceMemoryGiB: typeof deviceMemory === 'number' ? deviceMemory : null
      },
      memory: {
        kind: afterMiB === null ? 'unavailable' : 'js-heap-estimate-only',
        beforeMiB, afterMiB, maxObservedMiB,
        warning: 'JS heap is not total device memory or browser peak memory. Estimated pixel buffer sizes exclude Canvas, decoder, codecs and caches.'
      },
      responsiveness: {
        animationFrames: frameCount,
        longestFrameGapMs: frameCount > 1 ? round(longestFrameGap) : null,
        gapsAbove50ms: frameGapsOver50
      },
      cases,
      totalElapsedMs: round(performance.now() - started),
      result: 'passed'
    };
  } finally {
    watchingFrames = false;
    pool?.terminate();
  }
}
