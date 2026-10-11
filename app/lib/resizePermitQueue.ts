/**
 * Limit memory-intensive browser RGBA resizing to one in-flight job.
 * It is separate from frozen Image3 scheduling: ordinary conversions are
 * unaffected. Pending jobs can be removed immediately via AbortSignal.
 */
interface Waiter {
  readonly signal: AbortSignal;
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: Error) => void;
  readonly onAbort: () => void;
}

function cancellation(): DOMException {
  return new DOMException('Resize cancelled.', 'AbortError');
}

export class ResizePermitQueue {
  private occupied = false;
  private readonly waiters: Waiter[] = [];

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(cancellation());
    if (!this.occupied) {
      this.occupied = true;
      return Promise.resolve(this.makeRelease());
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiters.findIndex(entry => entry.onAbort === onAbort);
        if (index >= 0) this.waiters.splice(index, 1);
        signal.removeEventListener('abort', onAbort);
        reject(cancellation());
      };
      const waiter: Waiter = { signal, resolve, reject, onAbort };
      this.waiters.push(waiter);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }

  private makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      while (this.waiters.length > 0) {
        const next = this.waiters.shift()!;
        next.signal.removeEventListener('abort', next.onAbort);
        if (next.signal.aborted) {
          next.reject(cancellation());
          continue;
        }
        next.resolve(this.makeRelease());
        return;
      }
      this.occupied = false;
    };
  }
}
