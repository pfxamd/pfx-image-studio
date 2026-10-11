import { createImage3WorkerPool } from '../lib/createWorkerPool.js';
import type { Image3WorkerPool } from '../../src/index.js';
import { studioVersion } from '../release.js';
import { FixtureProvider, type FixtureMode } from './fixtureProvider.js';
import type { DiagnosticWorkerTiming, TimedConversionResult } from '../workers/diagnosticTiming.js';

type HeapPerformance = Performance & {
  memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
};
type NavigatorDevice = Navigator & { deviceMemory?: number };

type PhaseName = 'setup' | 'cold' | 'warm' | 'medium' | 'large' | 'stress' | 'batch';
interface CaseSpec {
  readonly phase: Exclude<PhaseName, 'setup' | 'cold'>;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly maxWidth: number | null;
  readonly repeats: number;
}

export interface FrameObservation {
  readonly animationFrames: number;
  readonly longestFrameGapMs: number | null;
  readonly gapsAbove50ms: number;
}

export type StageMedians = Partial<Record<keyof DiagnosticWorkerTiming, number>>;

function stageMedian(values: readonly DiagnosticWorkerTiming[]): StageMedians {
  const keys: (keyof DiagnosticWorkerTiming)[] = [
    'workerElapsedMs', 'inputReadInspectMs', 'bitmapDecodeMs',
    'pixelExtractionMs', 'resampleMs', 'codecDecodeMs', 'codecEncodeMs'
  ];
  const summary: Partial<Record<keyof DiagnosticWorkerTiming, number>> = {};
  for (const key of keys) {
    const times = values.flatMap(value => typeof value[key] === 'number' ? [value[key]!] : []);
    if (times.length > 0) summary[key] = round(median(times));
  }
  return summary;
}

function requireTiming(result: TimedConversionResult): DiagnosticWorkerTiming {
  if (!result.diagnosticTiming) throw new Error('Worker did not return stage timing data');
  return result.diagnosticTiming;
}

export interface DiagnosticCase {
  readonly label: string;
  readonly phase: PhaseName;
  readonly source: string;
  readonly target: string;
  readonly repetitions: number;
  readonly timingsMs: readonly number[];
  readonly stageMediansMs: StageMedians;
  /** Includes worker startup, transfer, Image3 preflight and scheduler; not pure main-thread CPU. */
  readonly outsideWorkerMedianMs: number;
  readonly totalMs: number;
  readonly medianMs: number;
  readonly p90Ms: number;
  readonly meanMs: number;
  readonly maxMs: number;
  readonly firstMs: number;
  readonly lastMs: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly outputFormat: 'webp';
  readonly estimatedPixelBufferMiB: number | null;
  readonly responsiveness: FrameObservation;
}

export interface PhoneDiagnosticReport {
  readonly schemaVersion: 3;
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
  readonly fixturePreparation: {
    readonly mode: FixtureMode;
    readonly elapsedMs: number;
    readonly responsiveness: FrameObservation;
  };
  readonly startup: {
    readonly workerPoolConstructionMs: number;
    readonly firstConversionMs: number;
    readonly warmedConversionMedianMs: number;
    readonly firstToWarmRatio: number;
    readonly explanation: string;
  };
  readonly responsiveness: FrameObservation;
  readonly cases: readonly DiagnosticCase[];
  readonly totalElapsedMs: number;
  readonly result: 'passed';
}

const WORKLOADS: readonly CaseSpec[] = [
  { phase: 'warm', label: 'Warm conversion', width: 1280, height: 800, maxWidth: null, repeats: 5 },
  { phase: 'medium', label: 'Medium downscale', width: 1600, height: 1000, maxWidth: 800, repeats: 5 },
  { phase: 'large', label: 'Large downscale', width: 2400, height: 1600, maxWidth: 1200, repeats: 5 },
  { phase: 'stress', label: 'Large-image stress', width: 3000, height: 2000, maxWidth: 1200, repeats: 5 },
  { phase: 'batch', label: '10-image sequential batch', width: 960, height: 640, maxWidth: 480, repeats: 10 }
];

export const DIAGNOSTIC_OPERATIONS = 1 + WORKLOADS.reduce((sum, entry) => sum + entry.repeats, 0);

const round = (value: number, digits = 1): number => Number(value.toFixed(digits));

function heapMiB(): number | null {
  const used = (performance as HeapPerformance).memory?.usedJSHeapSize;
  return typeof used === 'number' && Number.isFinite(used) ? round(used / 1048576) : null;
}

function browserLabel(): string {
  const agent = navigator.userAgent;
  if (/firefox/i.test(agent)) return 'Firefox';
  if (/edg\//i.test(agent)) return 'Edge';
  if (/chrome|crios/i.test(agent)) return 'Chromium-based';
  if (/safari/i.test(agent)) return 'Safari';
  return 'Other browser';
}

function median(numbers: readonly number[]): number {
  const ordered = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid]! : (ordered[mid - 1]! + ordered[mid]!) / 2;
}
function percentile(numbers: readonly number[], percentage: number): number {
  const ordered = [...numbers].sort((a, b) => a - b);
  return ordered[Math.ceil(percentage * ordered.length) - 1]!;
}
function checkStopped(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Stopped by user', 'AbortError');
  if (document.visibilityState !== 'visible') {
    throw new Error('Keep this browser tab in the foreground during the test.');
  }
}

type MutableFrames = {
  animationFrames: number;
  longestFrameGapMs: number;
  gapsAbove50ms: number;
};
const blank = (): MutableFrames => ({ animationFrames: 0, longestFrameGapMs: 0, gapsAbove50ms: 0 });
function snapshot(frames: MutableFrames): FrameObservation {
  return {
    animationFrames: frames.animationFrames,
    longestFrameGapMs: frames.animationFrames > 1 ? round(frames.longestFrameGapMs) : null,
    gapsAbove50ms: frames.gapsAbove50ms
  };
}

/** Frames are sampled on the main thread while the actual codecs run in workers. */
function frameMonitor(onMemory: (value: number) => void) {
  let active = true;
  let current: PhaseName | null = 'setup';
  let lastFrame: number | undefined;
  let count = 0;
  const total = blank();
  const perPhase = new Map<PhaseName, MutableFrames>();
  const tick = (now: number) => {
    if (!active) return;
    total.animationFrames++;
    if (current !== null) {
      let phase = perPhase.get(current);
      if (!phase) { phase = blank(); perPhase.set(current, phase); }
      phase.animationFrames++;
      if (lastFrame !== undefined) {
        const gap = now - lastFrame;
        total.longestFrameGapMs = Math.max(total.longestFrameGapMs, gap);
        phase.longestFrameGapMs = Math.max(phase.longestFrameGapMs, gap);
        if (gap > 50) { total.gapsAbove50ms++; phase.gapsAbove50ms++; }
      }
    }
    lastFrame = now;
    if (++count % 30 === 0) {
      const heap = heapMiB();
      if (heap !== null) onMemory(heap);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    phase(name: PhaseName | null) {
      current = name;
      lastFrame = undefined; // Do not misattribute idle gaps to a workload.
    },
    phaseResults(name: PhaseName): FrameObservation {
      return snapshot(perPhase.get(name) ?? blank());
    },
    total(): FrameObservation { return snapshot(total); },
    stop() { active = false; }
  };
}


function estimatedBuffers(spec: CaseSpec): number | null {
  if (spec.maxWidth === null) return null;
  const height = Math.round(spec.height * spec.maxWidth / spec.width);
  return round((
    spec.width * spec.height * 4 +
    Math.min(spec.maxWidth * spec.height, spec.width * height) * 16 +
    spec.maxWidth * height * 4
  ) / 1048576);
}

async function measureCase(
  pool: Image3WorkerPool,
  spec: CaseSpec,
  source: Blob,
  signal: AbortSignal,
  frames: ReturnType<typeof frameMonitor>,
  progress: (description: string) => void,
  onComplete: () => void,
  prepare: (width: number, height: number, variant?: number) => Promise<Blob>
): Promise<DiagnosticCase> {
  const times: number[] = [];
  const stages: DiagnosticWorkerTiming[] = [];
  const outsideWorker: number[] = [];
  let outputBytes = 0;
  let outputW = 0;
  let outputH = 0;
  frames.phase(spec.phase);
  for (let i = 0; i < spec.repeats; i++) {
    checkStopped(signal);
    progress(spec.label + ' · ' + (i + 1) + '/' + spec.repeats);
    const input = spec.phase === 'stress' && i > 0
      ? await prepare(spec.width, spec.height, i)
      : source;
    frames.phase(spec.phase);
    const start = performance.now();
    const output = await pool.convert(
      { data: input, name: 'diagnostic.png', mimeType: 'image/png' },
      {
        format: 'webp', quality: 82, diagnosticTiming: true,
        ...(spec.maxWidth === null ? {} : { rasterMaxWidth: spec.maxWidth })
      },
      { signal }
    );
    const bytes = new Uint8Array(output.buffer);
    if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') {
      throw new Error('Output format verification failed for ' + spec.label);
    }
    const expectedW = spec.maxWidth ?? spec.width;
    const expectedH = Math.round(spec.height * expectedW / spec.width);
    if (output.width !== expectedW || output.height !== expectedH) {
      throw new Error('Output dimensions mismatch for ' + spec.label);
    }
    const elapsed = performance.now() - start;
    const timing = requireTiming(output as TimedConversionResult);
    stages.push(timing);
    outsideWorker.push(Math.max(0, elapsed - timing.workerElapsedMs));
    times.push(elapsed);
    outputBytes = output.outputBytes;
    outputW = output.width;
    outputH = output.height;
    onComplete();
    checkStopped(signal);
  }
  const observation = frames.phaseResults(spec.phase);
  frames.phase(null);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    label: spec.label,
    phase: spec.phase,
    source: spec.width + 'x' + spec.height,
    target: outputW + 'x' + outputH,
    repetitions: spec.repeats,
    timingsMs: times.map(ms => round(ms)),
    stageMediansMs: stageMedian(stages),
    outsideWorkerMedianMs: round(median(outsideWorker)),
    totalMs: round(sum),
    medianMs: round(median(times)),
    p90Ms: round(percentile(times, 0.9)),
    meanMs: round(sum / times.length),
    maxMs: round(Math.max(...times)),
    firstMs: round(times[0]!),
    lastMs: round(times[times.length - 1]!),
    inputBytes: source.size,
    outputBytes,
    outputFormat: 'webp',
    estimatedPixelBufferMiB: estimatedBuffers(spec),
    responsiveness: observation
  };
}

/**
 * Measures cold-vs-warm elapsed conversion, per-case medians and main-thread
 * frame gaps. The first call includes worker startup and potentially lazy WASM
 * initialization; the engine cannot isolate exact WASM initialization time.
 * The large-image stress uses five distinct generated files. Synthetic images only; results are local and never uploaded.
 */
export async function runPhoneDiagnostics(
  signal: AbortSignal,
  onProgress: (completed: number, total: number, description: string) => void
): Promise<PhoneDiagnosticReport> {
  checkStopped(signal);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const beforeMiB = heapMiB();
  let maxObservedMiB = beforeMiB;
  const frames = frameMonitor(current => {
    maxObservedMiB = Math.max(maxObservedMiB ?? 0, current);
  });
  const cases: DiagnosticCase[] = [];
  const provider = new FixtureProvider();
  let preparationMs = 0;
  const prepare = async (width: number, height: number, variant = 0): Promise<Blob> => {
    frames.phase('setup');
    const begin = performance.now();
    try { return await provider.make(width, height, signal, variant); }
    finally { preparationMs += performance.now() - begin; frames.phase(null); }
  };
  let completed = 0;
  const progress = (label: string) => onProgress(completed, DIAGNOSTIC_OPERATIONS, label);
  const onComplete = () => {
    completed++;
    onProgress(completed, DIAGNOSTIC_OPERATIONS, 'Completed ' + completed + '/' + DIAGNOSTIC_OPERATIONS);
  };
  let pool: Image3WorkerPool | undefined;
  let hiddenDuringRun = false;
  const detectHidden = () => { if (document.visibilityState !== 'visible') hiddenDuringRun = true; };
  document.addEventListener('visibilitychange', detectHidden);
  try {
    progress('Preparing original conversion');
    const firstFixture = await prepare(1280, 800);
    checkStopped(signal);
    const constructionStart = performance.now();
    pool = createImage3WorkerPool();
    const constructionMs = round(performance.now() - constructionStart);

    const cold: CaseSpec = {
      phase: 'warm', label: 'First conversion (cold)',
      width: 1280, height: 800, maxWidth: null, repeats: 1
    };
    // Distinct phase from warmed repeats, while sharing exactly the same input.
    frames.phase('cold');
    progress('First conversion · worker startup and lazy codecs');
    const coldStart = performance.now();
    const output = await pool.convert(
      { data: firstFixture, name: 'diagnostic.png', mimeType: 'image/png' },
      { format: 'webp', quality: 82, diagnosticTiming: true }, { signal }
    );
    const firstConversionMs = performance.now() - coldStart;
    const coldTiming = requireTiming(output as TimedConversionResult);
    const bytes = new Uint8Array(output.buffer);
    if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP' ||
        output.width !== 1280 || output.height !== 800) {
      throw new Error('Initial conversion failed verification');
    }
    onComplete();
    checkStopped(signal);
    cases.push({
      label: cold.label, phase: 'cold', source: '1280x800', target: '1280x800',
      repetitions: 1, timingsMs: [round(firstConversionMs)],
      stageMediansMs: stageMedian([coldTiming]),
      outsideWorkerMedianMs: round(Math.max(0, firstConversionMs - coldTiming.workerElapsedMs)),
      totalMs: round(firstConversionMs), medianMs: round(firstConversionMs),
      p90Ms: round(firstConversionMs), meanMs: round(firstConversionMs),
      maxMs: round(firstConversionMs), firstMs: round(firstConversionMs),
      lastMs: round(firstConversionMs), inputBytes: firstFixture.size,
      outputBytes: output.outputBytes, outputFormat: 'webp',
      estimatedPixelBufferMiB: null, responsiveness: frames.phaseResults('cold')
    });
    frames.phase(null);

    for (const spec of WORKLOADS) {
      if (hiddenDuringRun) throw new Error('Test became hidden. Keep the browser in the foreground.');
      progress('Preparing ' + spec.label);
      const source = spec.phase === 'warm' ? firstFixture :
        await prepare(spec.width, spec.height);
      cases.push(await measureCase(pool, spec, source, signal, frames, progress, onComplete, prepare));
    }
    if (hiddenDuringRun) throw new Error('Test became hidden. Keep the browser in the foreground.');
    checkStopped(signal);
    const warm = cases.find(entry => entry.phase === 'warm')!;
    const afterMiB = heapMiB();
    if (afterMiB !== null) maxObservedMiB = Math.max(maxObservedMiB ?? 0, afterMiB);
    const deviceMemory = (navigator as NavigatorDevice).deviceMemory;
    return {
      schemaVersion: 3,
      product: 'PFx Image Studio',
      release: studioVersion,
      createdAt: startedAt,
      note: '31 actual worker conversions, observed stage times and independently generated synthetic fixtures. Outside-worker time includes queue, preflight and messages; it is not CPU time. No peak physical memory measurement or image upload.',
      platform: {
        browser: browserLabel(), screenCssPixels: screen.width + 'x' + screen.height,
        devicePixelRatio: round(devicePixelRatio, 2),
        logicalProcessors: navigator.hardwareConcurrency || null,
        reportedDeviceMemoryGiB: typeof deviceMemory === 'number' ? deviceMemory : null
      },
      memory: {
        kind: afterMiB === null ? 'unavailable' : 'js-heap-estimate-only',
        beforeMiB, afterMiB, maxObservedMiB,
        warning: 'JS heap is not total device memory or browser peak memory. Estimated pixel buffers exclude Canvas, decoder, codecs and caches.'
      },
      fixturePreparation: {
        mode: provider.mode, elapsedMs: round(preparationMs),
        responsiveness: frames.phaseResults('setup')
      },
      startup: {
        workerPoolConstructionMs: constructionMs,
        firstConversionMs: round(firstConversionMs),
        warmedConversionMedianMs: warm.medianMs,
        firstToWarmRatio: round(firstConversionMs / warm.medianMs, 2),
        explanation: 'Worker pool constructor is timed separately. The first conversion includes worker startup, codec lazy loading and conversion. Exact codec/WASM initialization cannot be isolated using this API.'
      },
      responsiveness: frames.total(),
      cases,
      totalElapsedMs: round(performance.now() - started),
      result: 'passed'
    };
  } finally {
    document.removeEventListener('visibilitychange', detectHidden);
    frames.stop();
    pool?.terminate();
    provider.close();
  }
}
