'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PreparationDeadline } = require('../src/replace-deadline');

test('preparation budget is cumulative and excludes the paused search interval', () => {
  let now = 0;
  const abort = new AbortController(), deadline = new PreparationDeadline(abort, 100, () => now);
  try {
    now = 40;
    deadline.pause();
    assert.equal(deadline.remaining, 60);
    now = 1000;
    deadline.check();
    assert.equal(abort.signal.aborted, false);
    deadline.resume();
    now = 1059;
    deadline.check();
    assert.equal(abort.signal.aborted, false);
    now = 1060;
    deadline.check();
    assert.equal(abort.signal.aborted, true);
    assert.match(abort.signal.reason.message, /No edit was submitted/);
  } finally {
    deadline.stop();
  }
});

test('exhausted preparation budget aborts before a paused worker can start', () => {
  let now = 0;
  const abort = new AbortController(), deadline = new PreparationDeadline(abort, 100, () => now);
  try {
    now = 120;
    deadline.pause();
    assert.equal(abort.signal.aborted, true);
    deadline.resume();
    assert.equal(deadline.timer, undefined);
  } finally {
    deadline.stop();
  }
});
