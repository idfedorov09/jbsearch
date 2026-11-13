'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SearchController } = require('../src/controller');
const { SearchEngine } = require('../src/search');

function clockFor(t) {
  let now = 0, sequence = 0;
  const pending = new Map(), all = new Map();
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    const id = ++sequence;
    const entry = { callback: () => callback(...args), at: now + Number(delay || 0) };
    pending.set(id, entry);
    all.set(id, entry);
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', id => { pending.delete(id); });
  return {
    get size() { return pending.size; },
    advance(milliseconds) {
      const deadline = now + milliseconds;
      for (;;) {
        const next = [...pending].filter(([, entry]) => entry.at <= deadline)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        now = next[1].at;
        pending.delete(next[0]);
        next[1].callback();
      }
      now = deadline;
    },
    // A queued timer callback can race cancellation; invoke it even if cleared.
    replay(id) { all.get(id)?.callback(); }
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}
const uri = {
  scheme: 'file', fsPath: '/workspace/a.js', path: '/workspace/a.js',
  toString: () => 'file:///workspace/a.js'
};
const row = id => ({ id, uri: uri.toString(), relativePath: 'a.js', rootName: 'workspace',
  offset: id.charCodeAt(0), length: 1, matchText: id,
  range: { start: { line: 0, character: id.charCodeAt(0) }, end: { line: 0, character: id.charCodeAt(0) + 1 } } });
function output(results, { skippedFiles = 0 } = {}) {
  return { results, truncated: false, stats: {
    errors: [], timedOut: false, cancelled: false, skippedFiles,
    excludedBinaryFiles: skippedFiles, blockingSkippedFiles: 0,
    skippedDetails: [], skippedDetailsOmitted: skippedFiles
  } };
}

function fixture(t, layout = 'modal') {
  const clock = clockFor(t), calls = [], notifications = [];
  const controller = Object.create(SearchController.prototype);
  const session = { id: 'session', layout, mode: 'find', query: 'needle', replacement: '',
    options: {}, scope: { kind: 'workspace' }, results: [], selectedId: null,
    generation: 1, lifetimeRevision: 0, previewRevision: 0, scopeEventRevision: 0,
    panels: new Set(), searching: true, partial: false, error: '', notice: '',
    diagnostics: '', diagnosticsSummary: '', searchInvalidations: new Map() };
  const panel = { webview: { postMessage(message) { notifications.push(message.state); } }, dispose() {} };
  if (layout === 'modal') session.panels.add(panel);
  const tree = { activeId: null, sessions: new Map(), update(state) { notifications.push(state); },
    show: async () => true, remove() {}, dispose() {} };
  Object.assign(controller, {
    v: { Uri: { parse: () => uri }, window: { tabGroups: { all: [] } },
      commands: { executeCommand: async () => {} } },
    engine: { search(request, callbacks) {
      const result = deferred();
      calls.push({ request, callbacks, ...result });
      return result.promise;
    }, dispose() {} },
    preview: { dispose() {} }, findTree: tree, sessions: new Map([[session.id, session]]),
    currentId: session.id, disposed: false,
    configuration: () => ({ get: (_key, fallback) => fallback }),
    request: async current => ({ query: current.query, scope: current.scope }),
    selectAutomatic: () => {}, snapshotLimit: () => 2 * 1024 * 1024,
    snapshot: current => ({ id: current.id, generation: current.generation,
      results: current.results.map(item => ({ ...item })), selectedId: current.selectedId,
      searching: current.searching, error: current.error, notice: current.notice,
      partial: current.partial, scopeStale: current.scopeStale,
      diagnostics: current.diagnostics, diagnosticsSummary: current.diagnosticsSummary })
  });
  t.after(() => { controller.cancelStreamingUpdate(session); session.abort?.abort(); });
  return { clock, calls, notifications, controller, session, panel, tree };
}

async function start(f) {
  const running = f.controller.search(f.session);
  await Promise.resolve();
  assert.ok(f.calls.length, 'the search reached the controlled engine');
  return { running, call: f.calls.at(-1) };
}

test('a real worker delivers every match when intermediate notifications are coalesced', async t => {
  const f = fixture(t), directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-stream-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'sample.txt'), 'needle\n'.repeat(201));
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  f.controller.engine = engine;
  f.controller.request = async () => ({ query: 'needle', roots: [{ path: directory, name: 'fixture' }],
    documents: [], scope: { kind: 'workspace' }, respectExcludes: true,
    maxResults: 1000, maxFileSizeMiB: 2, timeoutMs: 10000 });
  await f.controller.search(f.session);
  assert.equal(f.session.error, '');
  assert.equal(f.session.results.length, 201);
  assert.equal(new Set(f.session.results.map(item => item.id)).size, 201);
  assert.equal(f.notifications[0].results.length, 80);
  assert.equal(f.notifications.at(-1).results.length, 201);
  assert.equal(f.notifications.at(-1).searching, false);
  assert.equal(f.notifications.length, 2, 'completion publishes all results without waiting for the timer');
  assert.equal(f.clock.size, 0);
});

for (const layout of ['modal', 'findWindow']) {
  test(`${layout}: first batch is immediate and a non-sliding timer coalesces later batches`, async t => {
    const f = fixture(t, layout), { running, call } = await start(f);
    call.callbacks.onBatch([row('a')]);
    assert.deepEqual(f.notifications.map(value => value.results.map(item => item.id)), [['a']]);
    assert.equal(f.session.selectedId, 'a');
    call.callbacks.onBatch([row('b')]);
    assert.equal(f.clock.size, 1);
    f.clock.advance(49);
    call.callbacks.onBatch([row('c')]);
    assert.deepEqual(f.session.results.map(item => item.id), ['a', 'b', 'c']);
    assert.equal(f.clock.size, 1, 'new arrivals do not move the deadline');
    assert.equal(f.notifications.length, 1);
    f.clock.advance(1);
    assert.deepEqual(f.notifications.at(-1).results.map(item => item.id), ['a', 'b', 'c']);
    assert.equal(f.clock.size, 0);
    call.callbacks.onBatch([row('d')]);
    f.clock.advance(50);
    assert.deepEqual(f.notifications.at(-1).results.map(item => item.id), ['a', 'b', 'c', 'd']);
    call.resolve(output(['a', 'b', 'c', 'd'].map(row)));
    await running;
    assert.equal(f.notifications.at(-1).searching, false);
  });

  test(`${layout}: completion publishes final results and diagnostics before the pending deadline`, async t => {
    const f = fixture(t, layout), { running, call } = await start(f);
    call.callbacks.onBatch([row('a')]);
    call.callbacks.onBatch([row('b')]);
    const oldTimer = f.session.streamingUpdate.timer;
    call.resolve(output([row('a'), row('b')], { skippedFiles: 1 }));
    await running;
    assert.equal(f.notifications.length, 2);
    assert.equal(f.notifications.at(-1).searching, false);
    assert.deepEqual(f.notifications.at(-1).results.map(item => item.id), ['a', 'b']);
    assert.match(f.notifications.at(-1).diagnosticsSummary, /1 binary file/);
    assert.equal(f.clock.size, 0);
    f.clock.replay(oldTimer);
    f.clock.advance(50);
    assert.equal(f.notifications.length, 2, 'an obsolete timer cannot overwrite completion');
  });
}

test('reset is immediate and old completion cannot cancel a new generation timer', async t => {
  const f = fixture(t), first = await start(f);
  first.call.callbacks.onBatch([row('a')]);
  first.call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  f.controller.resetSearch(f.session);
  assert.equal(f.session.generation, 2);
  assert.deepEqual(f.notifications.at(-1).results, []);
  assert.equal(f.session.streamingUpdate, undefined);
  const second = await start(f);
  second.call.callbacks.onBatch([row('c')]);
  second.call.callbacks.onBatch([row('d')]);
  const newTimer = f.session.streamingUpdate;
  first.call.callbacks.onBatch([row('a')]);
  first.call.resolve(output([row('a'), row('b')]));
  await first.running;
  assert.equal(f.session.streamingUpdate, newTimer);
  f.clock.replay(oldTimer);
  f.clock.advance(50);
  assert.deepEqual(f.notifications.at(-1).results.map(item => item.id), ['c', 'd']);
  second.call.resolve(output([row('c'), row('d')]));
  await second.running;
});

test('aborting a search immediately cancels its timer and suppresses late worker replies', async t => {
  const f = fixture(t), { running, call } = await start(f);
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  f.session.abort.abort();
  assert.equal(f.session.streamingUpdate, undefined);
  assert.equal(f.clock.size, 0);
  call.callbacks.onBatch([row('c')]);
  call.resolve(output([row('a'), row('b'), row('c')]));
  await running;
  f.clock.replay(oldTimer);
  f.clock.advance(50);
  assert.equal(f.notifications.length, 1);
});

test('an error is notified immediately and the pending timer cannot restore rows', async t => {
  const f = fixture(t), { running, call } = await start(f);
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  call.reject(new Error('worker failed'));
  await running;
  assert.equal(f.notifications.at(-1).error, 'worker failed');
  assert.equal(f.notifications.at(-1).searching, false);
  assert.deepEqual(f.notifications.at(-1).results, []);
  const count = f.notifications.length;
  f.clock.replay(oldTimer);
  f.clock.advance(50);
  assert.equal(f.notifications.length, count);
});

test('a scheduled presentation failure returns to the search error boundary', async t => {
  const f = fixture(t), { running, call } = await start(f);
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const snapshot = f.controller.snapshot;
  let shouldFail = true;
  f.controller.snapshot = current => {
    if (shouldFail) { shouldFail = false; throw new Error('presentation failed'); }
    return snapshot(current);
  };
  assert.doesNotThrow(() => f.clock.advance(50));
  await running;
  assert.equal(f.notifications.at(-1).error, 'presentation failed');
  assert.equal(f.notifications.at(-1).searching, false);
  assert.deepEqual(f.notifications.at(-1).results, []);
  assert.equal(f.session.abort.signal.aborted, true, 'the failed search retires its worker');
  call.resolve(output([row('a'), row('b')]));
});

test('a source change immediately publishes invalid results and cancels the streaming-only update', async t => {
  const f = fixture(t), { running, call } = await start(f);
  f.controller.potentiallyInScope = () => true;
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  f.controller.documentChanged({ document: { uri }, contentChanges: [{ text: 'x' }] });
  assert.equal(f.notifications.length, 2);
  assert.equal(f.notifications.at(-1).scopeStale, true);
  assert.ok(f.notifications.at(-1).results.every(item => item.invalid && item.identityUnknown));
  f.clock.replay(oldTimer);
  assert.equal(f.notifications.length, 2);
  call.callbacks.onBatch([row('c')]);
  f.clock.advance(50);
  assert.ok(f.notifications.at(-1).results.every(item => item.invalid && item.identityUnknown));
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: 1 }), /Wait for the current search/);
  call.resolve(output([row('a'), row('b'), row('c')]));
  await running;
});

test('a pending file check is published immediately while a streaming update is waiting', async t => {
  const f = fixture(t), { running, call } = await start(f);
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  f.controller.queueValidation(f.session, uri.toString(), 150);
  assert.equal(f.notifications.length, 2);
  assert.ok(f.notifications.at(-1).results.every(item => item.pending));
  assert.equal(f.session.streamingUpdate, undefined);
  f.clock.replay(oldTimer);
  assert.equal(f.notifications.length, 2);
  f.controller.cancelValidations(f.session);
  call.resolve(output([row('a'), row('b')]));
  await running;
});

test('closing a saved search cancels and guards its pending delivery', async t => {
  const f = fixture(t, 'findWindow'), { running, call } = await start(f);
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  f.controller.closeFindSearch(f.session);
  assert.equal(f.session.streamingUpdate, undefined);
  assert.equal(f.controller.sessions.has(f.session.id), false);
  call.resolve(output([row('a'), row('b')]));
  await running;
  f.clock.replay(oldTimer);
  f.clock.advance(50);
  assert.equal(f.notifications.length, 1);
});

test('closing the last modal panel cancels pending delivery and cannot revive it', async t => {
  const f = fixture(t);
  f.session.panels.clear();
  f.controller.context = { extensionUri: {} };
  f.controller.v.Uri.joinPath = () => ({});
  f.controller.renderPanel = () => {};
  let onDispose;
  const panel = { webview: {
    postMessage(message) { f.notifications.push(message.state); }, onDidReceiveMessage() {}
  }, onDidDispose(callback) { onDispose = callback; }, onDidChangeViewState() {},
  dispose() { onDispose(); } };
  f.controller.resolveCustomEditor({ session: f.session, lifetime: f.session.lifetimeRevision }, panel);
  const { running, call } = await start(f);
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  panel.dispose();
  assert.equal(f.session.streamingUpdate, undefined);
  assert.equal(f.session.panels.size, 0);
  assert.equal(f.session.abort.signal.aborted, true);
  call.resolve(output([row('a'), row('b')]));
  await running;
  f.clock.replay(oldTimer);
  f.clock.advance(50);
  assert.equal(f.notifications.length, 1);
});

test('a replaced session with the same ID cannot receive an old callback', async t => {
  const f = fixture(t), { running, call } = await start(f);
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  f.controller.sessions.set(f.session.id, { ...f.session, results: [row('z')], panels: new Set([f.panel]) });
  f.clock.replay(oldTimer);
  call.callbacks.onBatch([row('c')]);
  call.resolve(output([row('a'), row('b'), row('c')]));
  await running;
  assert.equal(f.notifications.length, 1);
  assert.deepEqual(f.controller.sessions.get(f.session.id).results.map(item => item.id), ['z']);
});

test('extension disposal cancels pending delivery and rejects an already queued callback', async t => {
  const f = fixture(t), { running, call } = await start(f);
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  f.controller.dispose();
  assert.equal(f.session.streamingUpdate, undefined);
  call.resolve(output([row('a'), row('b')]));
  await running;
  f.clock.replay(oldTimer);
  assert.equal(f.notifications.length, 1);
});

test('transfer flushes the old pending rows and cannot deliver its timer after rollback', async t => {
  const f = fixture(t), { running, call } = await start(f);
  const reveal = deferred();
  f.tree.show = () => reveal.promise;
  call.callbacks.onBatch([row('a')]);
  call.callbacks.onBatch([row('b')]);
  const oldTimer = f.session.streamingUpdate.timer;
  const transfer = f.controller.transferFindWindow(f.session, false);
  assert.equal(f.session.streamingUpdate, undefined);
  assert.deepEqual(f.notifications[1].results.map(item => item.id), ['a', 'b']);
  const afterTransferStart = f.notifications.length;
  f.clock.replay(oldTimer);
  assert.equal(f.notifications.length, afterTransferStart);
  call.callbacks.onBatch([row('c')]);
  assert.equal(f.notifications.length, afterTransferStart + 1, 'a provisional transfer is not throttled');
  reveal.reject(new Error('reveal failed'));
  await assert.rejects(transfer, /reveal failed/);
  assert.equal(f.session.layout, 'modal');
  call.callbacks.onBatch([row('d')]);
  f.clock.advance(50);
  assert.deepEqual(f.notifications.at(-1).results.map(item => item.id), ['a', 'b', 'c', 'd']);
  call.resolve(output([row('a'), row('b'), row('c'), row('d')]));
  await running;
});
