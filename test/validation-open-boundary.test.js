'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValidationOpenGate, PhysicalOpenGate, PHYSICAL_OPEN_DEFAULTS } = require('../src/validation-open-boundary');

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const count of [1, 2, 3]) {
  test(`${count} hung opens retain their slots while fast files use remaining capacity`, async () => {
    const holds = Array.from({ length: count }, deferred), calls = [];
    const gate = new ValidationOpenGate(key => {
      calls.push(key);
      return typeof key === 'number' ? holds[key].promise : Promise.resolve(key);
    });
    const pending = holds.map((_, index) => gate.open(index, { timeoutMs: 20 }).catch(error => error));
    await tick();
    assert.equal(await gate.open('fast', { timeoutMs: 100 }), 'fast');
    const timedOut = await Promise.all(pending);
    assert.ok(timedOut.every(error => error.code === 'GATE_TIMEOUT'));
    await tick();
    assert.equal(gate.active, count, 'a timed-out caller does not cancel its physical open');
    assert.equal(await gate.open('fast-again', { timeoutMs: 100 }), 'fast-again');
    for (const hold of holds) hold.resolve('late');
    await tick();
    assert.equal(gate.active, 0);
    assert.ok(calls.includes('fast-again'));
    gate.dispose();
  });
}

test('four hung opens retain capacity; waiting callers resume FIFO only after physical settlement', async () => {
  const holds = Array.from({ length: 4 }, deferred), calls = [];
  const gate = new ValidationOpenGate(key => {
    calls.push(key);
    return key < 4 ? holds[key].promise : Promise.resolve(key);
  });
  const initial = holds.map((_, index) => gate.open(index, { timeoutMs: 25 }).catch(error => error));
  await tick();
  assert.equal(gate.active, 4);
  const fifth = gate.open(4, { timeoutMs: 300 });
  const sixth = gate.open(5, { timeoutMs: 300 });
  const errors = await Promise.all(initial);
  assert.ok(errors.every(error => error.code === 'GATE_TIMEOUT'));
  assert.equal(gate.active, 4);
  assert.deepEqual(calls, [0, 1, 2, 3]);
  holds[1].resolve('late');
  assert.equal(await fifth, 4);
  assert.equal(await sixth, 5);
  assert.deepEqual(calls, [0, 1, 2, 3, 4, 5]);
  await tick();
  assert.equal(gate.active, 3);
  holds[0].resolve();
  holds[2].resolve();
  holds[3].resolve();
  await tick();
  assert.equal(gate.active, 0);
  gate.dispose();
});

test('with all slots hung a waiting caller times out; a later request can recover', async () => {
  const holds = Array.from({ length: 4 }, deferred), calls = [];
  const gate = new ValidationOpenGate(key => {
    calls.push(key);
    return key < 4 ? holds[key].promise : Promise.resolve(key);
  });
  const initial = holds.map((_, index) => gate.open(index, { timeoutMs: 20 }).catch(error => error));
  await tick();
  const waiting = gate.open(4, { timeoutMs: 30 }).catch(error => error);
  await Promise.all(initial);
  assert.equal((await waiting).code, 'GATE_TIMEOUT');
  assert.deepEqual(calls, [0, 1, 2, 3]);
  assert.equal(gate.active, 4);
  holds[0].resolve('late');
  await tick();
  assert.equal(await gate.open(5, { timeoutMs: 100 }), 5);
  for (const hold of holds.slice(1)) hold.resolve('late');
  await tick();
  assert.equal(gate.active, 0);
  gate.dispose();
});

test('waiting timeout, abort and queue cap do not start unbounded physical requests', async () => {
  const hold = deferred(), calls = [];
  const gate = new ValidationOpenGate(key => { calls.push(key); return hold.promise; }, { limit: 1, maxQueue: 2 });
  const first = gate.open('a', { timeoutMs: 200 }).catch(error => error);
  await tick();
  const abort = new AbortController();
  const second = gate.open('b', { signal: abort.signal, timeoutMs: 200 }).catch(error => error);
  const third = gate.open('c', { timeoutMs: 20 }).catch(error => error);
  const overflow = await gate.open('overflow', { timeoutMs: 100 }).catch(error => error);
  assert.equal(overflow.code, 'GATE_FULL');
  abort.abort();
  assert.equal((await second).code, 'GATE_ABORTED');
  assert.equal((await third).code, 'GATE_TIMEOUT');
  assert.equal(gate.waiting, 0);
  assert.equal(gate.active, 1);
  assert.deepEqual(calls, ['a']);
  hold.resolve();
  await first;
  await tick();
  assert.equal(gate.active, 0);
  assert.deepEqual(calls, ['a']);
  gate.dispose();
});

test('dispose rejects callers but retains actual opens until they settle', async () => {
  const hold = deferred(), calls = [];
  const gate = new ValidationOpenGate(key => { calls.push(key); return hold.promise; }, { limit: 1 });
  const first = gate.open('a', { timeoutMs: 300 }).catch(error => error);
  await tick();
  const second = gate.open('b', { timeoutMs: 300 }).catch(error => error);
  gate.dispose();
  assert.equal((await first).code, 'GATE_DISPOSED');
  assert.equal((await second).code, 'GATE_DISPOSED');
  assert.equal(gate.active, 1);
  assert.equal(gate.waiting, 0);
  hold.resolve();
  await tick();
  assert.equal(gate.active, 0);
  assert.deepEqual(calls, ['a']);
});

test('cancellation or disposal before a scheduled open prevents the physical call', async () => {
  for (const action of ['abort', 'dispose']) {
    const calls = [], abort = new AbortController();
    const gate = new ValidationOpenGate(key => { calls.push(key); });
    const pending = gate.open('x', { signal: abort.signal }).catch(error => error);
    if (action === 'abort') abort.abort(); else gate.dispose();
    assert.equal((await pending).code, action === 'abort' ? 'GATE_ABORTED' : 'GATE_DISPOSED');
    await tick();
    assert.deepEqual(calls, []);
    assert.equal(gate.active, 0);
    gate.dispose();
  }
});

test('abort after opening retains capacity; a late rejection is ignored safely', async () => {
  const hold = deferred(), gate = new ValidationOpenGate(() => hold.promise, { limit: 1 });
  const abort = new AbortController();
  const pending = gate.open('open', { signal: abort.signal, timeoutMs: 100 }).catch(error => error);
  await tick();
  abort.abort();
  assert.equal((await pending).code, 'GATE_ABORTED');
  assert.equal(gate.active, 1);
  hold.reject(new Error('late failure'));
  await tick();
  assert.equal(gate.active, 0);
  gate.dispose();
});

test('the reusable API validates limits and deadlines without silently removing its bounds', async () => {
  assert.equal(ValidationOpenGate, PhysicalOpenGate);
  assert.deepEqual(PHYSICAL_OPEN_DEFAULTS, { limit: 4, maxQueue: 512, timeoutMs: 10000 });
  for (const limit of [0, -1, 0.5, Infinity, NaN])
    assert.throws(() => new PhysicalOpenGate(() => {}, { limit }), RangeError);
  for (const maxQueue of [-1, 0.5, Infinity, NaN])
    assert.throws(() => new PhysicalOpenGate(() => {}, { maxQueue }), RangeError);
  let opens = 0;
  const gate = new PhysicalOpenGate(() => { opens++; });
  for (const timeoutMs of [Infinity, NaN, 2147483648])
    await assert.rejects(gate.open('invalid', { timeoutMs }), RangeError);
  for (const timeoutMs of [0, -10])
    await assert.rejects(gate.open('expired', { timeoutMs }), { code: 'GATE_TIMEOUT' });
  assert.equal(opens, 0);
  gate.dispose();
});

test('a zero-length FIFO refuses overflow but still permits an idle physical slot', async () => {
  const hold = deferred();
  const gate = new PhysicalOpenGate(() => hold.promise, { limit: 1, maxQueue: 0 });
  const first = gate.open('first');
  await tick();
  await assert.rejects(gate.open('overflow'), { code: 'GATE_FULL' });
  hold.resolve('first');
  assert.equal(await first, 'first');
  await tick();
  assert.equal(gate.active, 0);
  gate.dispose();
});

test('FIFO is shared fairly by sessions, skips canceled entries, and has no preferred new caller', async () => {
  const hold = deferred(), started = [], abort = new AbortController();
  const gate = new PhysicalOpenGate(key => {
    started.push(key);
    return key === 'A:first' ? hold.promise : key;
  }, { limit: 1, maxQueue: 3 });
  const first = gate.open('A:first');
  await tick();
  const canceled = gate.open('A:canceled', { signal: abort.signal }).catch(error => error);
  const second = gate.open('B:second');
  abort.abort();
  const third = gate.open('C:third');
  assert.equal((await canceled).code, 'GATE_ABORTED');
  hold.resolve('A:first');
  assert.deepEqual(await Promise.all([first, second, third]), ['A:first', 'B:second', 'C:third']);
  assert.deepEqual(started, ['A:first', 'B:second', 'C:third']);
  await tick();
  assert.equal(gate.active, 0);
  gate.dispose();
});

test('synchronous opener failure and non-Error rejection release real capacity without stranding the FIFO', async () => {
  const gate = new PhysicalOpenGate(key => {
    if (key === 'throw') throw new Error('sync failure');
    if (key === 'reject') return Promise.reject('async failure');
    return key;
  }, { limit: 1 });
  const first = gate.open('throw').catch(error => error);
  const second = gate.open('reject').catch(error => error);
  const third = gate.open('ok');
  assert.match((await first).message, /sync failure/);
  assert.match((await second).message, /async failure/);
  assert.equal(await third, 'ok');
  await tick();
  assert.equal(gate.active, 0);
  assert.equal(gate.waiting, 0);
  gate.dispose();
});

test('an overdue success cannot beat its timeout through promise microtask ordering', async () => {
  const hold = deferred(), gate = new PhysicalOpenGate(() => hold.promise);
  const pending = gate.open('late', { timeoutMs: 5 }).catch(error => error);
  await tick();
  // Deliberately block this synthetic test turn so the timer is overdue but has
  // not run yet. A resolved promise then gets the next microtask before timers.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
  hold.resolve('late');
  assert.equal((await pending).code, 'GATE_TIMEOUT');
  await tick();
  assert.equal(gate.active, 0);
  gate.dispose();
});

test('an overdue queued caller never starts a physical request before its delayed timer runs', async () => {
  const hold = deferred(), calls = [];
  const gate = new PhysicalOpenGate(key => { calls.push(key); return hold.promise; }, { limit: 1 });
  const first = gate.open('first');
  await tick();
  const pending = gate.open('expired', { timeoutMs: 5 }).catch(error => error);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
  hold.resolve('first');
  await first;
  assert.equal((await pending).code, 'GATE_TIMEOUT');
  await tick();
  assert.deepEqual(calls, ['first']);
  assert.equal(gate.active, 0);
  gate.dispose();
});
