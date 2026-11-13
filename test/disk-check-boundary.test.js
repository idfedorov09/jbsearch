'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PhysicalOpenGate } = require('../src/validation-open-boundary');
const { SearchController } = require('../src/controller');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

test('disk checks keep physical capacity through caller timeout and actual late close', async () => {
  const controller = Object.create(SearchController.prototype);
  controller.diskChecks = new PhysicalOpenGate(job => job(), { limit: 2, maxQueue: 2 });
  const releases = [], close = [];
  let started = 0;
  const operation = async () => {
    started++;
    await new Promise(resolve => releases.push(resolve));
    await new Promise(resolve => close.push(resolve));
  };
  const callers = Array.from({ length: 2 }, () => controller.runDiskCheck(operation, { timeoutMs: 5 }));
  await Promise.all(callers.map(promise => assert.rejects(promise, /Disk baseline.*GATE_TIMEOUT/)));
  assert.equal(started, 2);
  assert.equal(controller.diskChecks.active, 2);
  const queued = [controller.runDiskCheck(operation, { timeoutMs: 5 }), controller.runDiskCheck(operation, { timeoutMs: 5 })];
  await assert.rejects(() => controller.runDiskCheck(operation, { timeoutMs: 5 }), /GATE_FULL/);
  await Promise.all(queued.map(promise => assert.rejects(promise, /GATE_TIMEOUT/)));
  assert.equal(started, 2, 'timed-out physical jobs do not release slots');
  releases.forEach(resolve => resolve());
  await pause(1);
  assert.equal(controller.diskChecks.active, 2, 'late descriptor cleanup is part of the physical job');
  close.forEach(resolve => resolve());
  await pause(1);
  assert.equal(controller.diskChecks.active, 0);
  controller.diskChecks.dispose();
});

test('disk gate cancellation and disposal suppress queued calls without releasing active physical work', async () => {
  const controller = Object.create(SearchController.prototype);
  controller.diskChecks = new PhysicalOpenGate(job => job(), { limit: 1, maxQueue: 1 });
  let release, started = 0;
  const signal = new AbortController();
  const physical = controller.runDiskCheck(() => { started++; return new Promise(resolve => { release = resolve; }); },
    { signal: signal.signal, timeoutMs: 1000 });
  await pause(1);
  const queued = controller.runDiskCheck(() => assert.fail('disposed queued read cannot start'), { timeoutMs: 1000 });
  const cancelled = assert.rejects(physical, /GATE_ABORTED/);
  signal.abort(); await cancelled;
  const disposed = assert.rejects(queued, /GATE_DISPOSED/);
  controller.diskChecks.dispose(); await disposed;
  assert.equal(started, 1);
  assert.equal(controller.diskChecks.active, 1);
  release(); await pause(1);
  assert.equal(controller.diskChecks.active, 0);
});
