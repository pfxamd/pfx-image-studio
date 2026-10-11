import { Image3WorkerPool } from '../../src/index.js';

export function createImage3WorkerPool(): Image3WorkerPool {
  return new Image3WorkerPool({
    workerFactory: () =>
      new Worker(
        new URL('../workers/studio-conversion.worker.ts', import.meta.url),
        { type: 'module' },
      ),
  });
}
