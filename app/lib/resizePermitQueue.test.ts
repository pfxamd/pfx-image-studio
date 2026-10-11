import { describe, expect, it } from 'vitest';
import { ResizePermitQueue } from './resizePermitQueue.js';

describe('cancel-safe resize queue', () => {
  it('allows only one active resize and releases waiting tasks FIFO', async () => {
    const queue = new ResizePermitQueue();
    const a = new AbortController();
    const b = new AbortController();
    const c = new AbortController();
    const releaseA = await queue.acquire(a.signal);
    const acquired: string[] = [];
    const waitingB = queue.acquire(b.signal).then(release => {
      acquired.push('b');
      return release;
    });
    const waitingC = queue.acquire(c.signal).then(release => {
      acquired.push('c');
      return release;
    });
    await Promise.resolve();
    expect(acquired).toEqual([]);
    releaseA();
    const releaseB = await waitingB;
    expect(acquired).toEqual(['b']);
    releaseB();
    const releaseC = await waitingC;
    expect(acquired).toEqual(['b', 'c']);
    releaseC();
    const releaseNext = await queue.acquire(new AbortController().signal);
    releaseNext();
  });

  it('removes a cancelled waiting job without blocking later work', async () => {
    const queue = new ResizePermitQueue();
    const first = await queue.acquire(new AbortController().signal);
    const cancelled = new AbortController();
    const rejected = queue.acquire(cancelled.signal);
    const next = queue.acquire(new AbortController().signal);
    cancelled.abort();
    await expect(rejected).rejects.toMatchObject({ name: 'AbortError' });
    first();
    const release = await next;
    release();
  });

  it('rejects already-cancelled requests and makes release idempotent', async () => {
    const queue = new ResizePermitQueue();
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(queue.acquire(cancelled.signal)).rejects.toMatchObject({name:'AbortError'});
    const release = await queue.acquire(new AbortController().signal);
    release();
    release();
    const next = await queue.acquire(new AbortController().signal);
    next();
  });
});
