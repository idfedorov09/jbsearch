'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { compileQuery, SearchQueryError } = require('./matcher');

function emptyStats() {
  return {
    filesScanned: 0,
    filesMatched: 0,
    matches: 0,
    skippedFiles: 0,
    skipped: { tooLarge: 0, binary: 0, encoding: 0, unreadable: 0 },
    errors: [],
    durationMs: 0,
    cancelled: false,
    timedOut: false
  };
}

/**
 * Local filesystem search. The UI/VS Code adapter supplies roots and snapshots;
 * this module has no dependency on vscode and never evaluates a regex on the
 * extension host. A new worker per search makes cancellation a hard boundary.
 */
class SearchEngine {
  constructor(options = {}) {
    this.rgPath = options.rgPath;
    this.batchSize = options.batchSize || 80;
    this.active = new Map();
  }

  async search(request, { onBatch = () => {}, signal, onProgress = () => {} } = {}) {
    if (!request.query || signal?.aborted) {
      return {
        results: [],
        truncated: false,
        stats: { ...emptyStats(), cancelled: Boolean(signal?.aborted) }
      };
    }
    compileQuery(request);
    let rgPath = this.rgPath;
    if (!rgPath && (request.scope?.kind !== 'openEditors' || request.roots?.length)) {
      // The universal package makes a single VSIX usable on every supported OS.
      try {
        rgPath = require('@vscode/ripgrep-universal').rgPath;
      } catch {
        rgPath = require('@vscode/ripgrep').rgPath;
      }
    }
    const normalized = {
      ...request,
      roots: request.roots || [],
      documents: request.documents || request.snapshots || [],
      maxResults: Math.min(50000, Math.max(1, request.maxResults || 2000)),
      maxFileSizeMiB: Math.min(128, Math.max(0.001, request.maxFileSizeMiB || 10)),
      timeoutMs: Math.min(300000, Math.max(50, request.timeoutMs || 20000))
    };
    const started = Date.now();
    const results = [];
    let stats = emptyStats();
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: { request: normalized, rgPath, batchSize: this.batchSize },
        resourceLimits: { maxOldGenerationSizeMb: 256 }
      });
      const children = new Set();
      let settled = false;
      let stopping = false;
      let stopTimer;
      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        clearTimeout(stopTimer);
        signal?.removeEventListener('abort', abort);
        this.active.delete(worker);
        for (const pid of children) {
          try {
            process.kill(pid);
          } catch {
            /* It already exited. */
          }
        }
        // The worker stops any child process before reporting completion. An
        // explicit terminate also protects against unexpected lingering handles.
        void worker.terminate();
        if (error) reject(error);
        else
          resolve({
            results,
            truncated: false,
            ...value,
            stats: { ...stats, ...value?.stats, durationMs: Date.now() - started }
          });
      };
      const stop = (reason) => {
        if (settled || stopping) return;
        stopping = true;
        stats.cancelled = reason === 'cancelled';
        stats.timedOut = reason === 'timeout';
        worker.postMessage({ type: 'cancel', reason });
        // A catastrophic regex can prevent the worker from receiving messages;
        // terminating it keeps the extension responsive and preserves batches.
        stopTimer = setTimeout(
          () => finish({ truncated: reason === 'timeout', reason, stats }),
          40
        );
      };
      const abort = () => stop('cancelled');
      this.active.set(worker, abort);
      const deadline = setTimeout(() => stop('timeout'), normalized.timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      worker.on('message', (message) => {
        if (settled) return;
        if (message.type === 'child') {
          if (message.alive) children.add(message.pid);
          else children.delete(message.pid);
        } else if (message.type === 'batch' && !stopping) {
          results.push(...message.results);
          stats = { ...stats, ...message.stats };
          try {
            onBatch(message.results, stats);
          } catch (error) {
            finish(undefined, error);
          }
        } else if (message.type === 'progress' && !stopping) {
          stats = { ...stats, ...message.stats };
          try {
            onProgress(stats);
          } catch (error) {
            finish(undefined, error);
          }
        } else if (message.type === 'done') {
          finish({
            truncated: message.truncated || stats.timedOut,
            reason: stopping ? (stats.timedOut ? 'timeout' : 'cancelled') : message.reason,
            stats: { ...message.stats, cancelled: stats.cancelled, timedOut: stats.timedOut }
          });
        } else if (message.type === 'error') {
          const error = new Error(message.message);
          error.code = message.code;
          finish(undefined, error);
        }
      });
      worker.on('error', (error) => finish(undefined, error));
      worker.on('exit', (code) => {
        if (!settled) finish(undefined, new Error(`Search worker exited unexpectedly (${code}).`));
      });
      if (signal?.aborted) abort();
    });
  }

  dispose() {
    for (const cancel of this.active.values()) cancel();
  }
}

module.exports = { SearchEngine, SearchQueryError, ...require('./matcher') };
