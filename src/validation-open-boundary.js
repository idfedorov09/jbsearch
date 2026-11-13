'use strict';

// The editor's openTextDocument promise does not accept cancellation. A
// timed-out caller stops waiting, but its physical slot stays occupied until
// that promise actually settles. This prevents repeated timeouts from spawning
// unbounded opens while allowing unrelated checks to use the remaining slots.
const PHYSICAL_OPEN_DEFAULTS = Object.freeze({ limit: 4, maxQueue: 512, timeoutMs: 10000 });

class PhysicalOpenGate {
  constructor(opener, { limit = PHYSICAL_OPEN_DEFAULTS.limit, maxQueue = PHYSICAL_OPEN_DEFAULTS.maxQueue } = {}) {
    if (typeof opener !== 'function') throw new TypeError('A document opener is required.');
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError('The physical opening limit must be a positive integer.');
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 0)
      throw new RangeError('The opening queue limit must be a non-negative integer.');
    this.opener = opener;
    this.limit = limit;
    this.maxQueue = maxQueue;
    this.queue = [];
    this.physical = new Set();
    this.disposed = false;
  }
  get active() { return this.physical.size; }
  get waiting() { return this.queue.length; }
  error(code, message) { return Object.assign(new Error(message), { code }); }
  open(uri, { signal, timeoutMs = PHYSICAL_OPEN_DEFAULTS.timeoutMs } = {}) {
    if (this.disposed)
      return Promise.reject(this.error('GATE_DISPOSED', 'Document opening was stopped.'));
    if (signal?.aborted)
      return Promise.reject(this.error('GATE_ABORTED', 'Document opening was cancelled.'));
    if (!Number.isFinite(timeoutMs) || timeoutMs > 2147483647)
      return Promise.reject(new RangeError('The document opening deadline must be finite and representable.'));
    if (timeoutMs <= 0)
      return Promise.reject(this.error('GATE_TIMEOUT', 'Opening the document timed out.'));
    if (this.physical.size >= this.limit && this.queue.length >= this.maxQueue)
      return Promise.reject(this.error('GATE_FULL', 'Too many documents are waiting to open.'));
    return new Promise((resolve, reject) => {
      const job = { uri, signal, resolve, reject, done: false, running: false,
        deadline: performance.now() + timeoutMs };
      job.abort = () => this.finish(job, this.error('GATE_ABORTED', 'Document opening was cancelled.'));
      // The budget includes time in the FIFO, not only time inside the host.
      job.timer = setTimeout(() => this.finish(job,
        this.error('GATE_TIMEOUT', 'Opening the document timed out. A host request may still be running.')), timeoutMs);
      signal?.addEventListener('abort', job.abort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }
  finish(job, error, value) {
    if (job.done) return;
    // Promise microtasks can run before an overdue timer after a busy host turn.
    // A late success still must not authorize work past the caller's deadline.
    if (!error && performance.now() >= job.deadline)
      error = this.error('GATE_TIMEOUT', 'Opening the document timed out.');
    job.done = true;
    clearTimeout(job.timer);
    job.signal?.removeEventListener('abort', job.abort);
    if (!job.running) this.queue = this.queue.filter(candidate => candidate !== job);
    const { resolve, reject } = job;
    // A permanently hung host promise keeps only its bounded physical job,
    // not the canceled caller's listener, resolver or URI.
    job.signal = job.abort = job.resolve = job.reject = job.uri = undefined;
    if (error) reject(error);
    else resolve(value);
  }
  pump() {
    while (!this.disposed && this.physical.size < this.limit && this.queue.length) {
      const job = this.queue.shift();
      if (job.done) continue;
      job.running = true;
      this.physical.add(job);
      Promise.resolve()
        .then(() => {
          if (!job.done && performance.now() >= job.deadline)
            this.finish(job, this.error('GATE_TIMEOUT', 'Opening the document timed out.'));
          return job.done || this.disposed ? undefined : this.opener(job.uri);
        })
        .then(
          value => this.finish(job, undefined, value),
          error => this.finish(job, error instanceof Error ? error : new Error(String(error || 'Could not open the file.')))
        )
        .finally(() => {
          this.physical.delete(job);
          this.pump();
        });
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const job of [...this.queue, ...this.physical])
      this.finish(job, this.error('GATE_DISPOSED', 'Document opening was stopped.'));
  }
}
// Keep the original export for existing validation callers. One owner must
// share one instance across initial search, validation, preview and preflight;
// wrapping an already gated open in another acquire can deadlock the budget.
module.exports = { PhysicalOpenGate, ValidationOpenGate: PhysicalOpenGate, PHYSICAL_OPEN_DEFAULTS };
