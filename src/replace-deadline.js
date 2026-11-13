'use strict';

const { performance } = require('node:perf_hooks');

// One cumulative budget for request and document preparation. The worker has a
// separate search deadline, so its running time must not consume this budget.
class PreparationDeadline {
  constructor(controller, milliseconds, clock = () => performance.now()) {
    this.controller = controller;
    this.remaining = milliseconds;
    this.clock = clock;
    this.started = undefined;
    this.timer = undefined;
    this.stopped = false;
    this.resume();
  }

  expire() {
    if (!this.controller.signal.aborted)
      this.controller.abort(new Error('Preparing the replacement timed out. No edit was submitted. Increase jbsearch.replace.prepareTimeoutMs or narrow the search scope.'));
  }

  check() {
    if (this.started !== undefined && this.clock() - this.started >= this.remaining) this.expire();
  }
  millisecondsLeft() {
    this.check();
    return Math.max(0, this.remaining - (this.started === undefined ? 0 : this.clock() - this.started));
  }

  pause() {
    if (this.started === undefined) return;
    const elapsed = Math.max(0, this.clock() - this.started);
    this.remaining = Math.max(0, this.remaining - elapsed);
    this.started = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.remaining === 0) this.expire();
  }

  resume() {
    if (this.stopped || this.started !== undefined || this.controller.signal.aborted) return;
    if (this.remaining <= 0) return this.expire();
    this.started = this.clock();
    this.timer = setTimeout(() => this.expire(), this.remaining);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.started = undefined;
  }
}

module.exports = { PreparationDeadline };
