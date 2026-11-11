'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SearchController } = require('../src/controller');
const { SearchEngine } = require('../src/search');

const oldResult = { id: 'old', uri: 'file:///old.js', source: 'snapshot', documentVersion: 1, resultRevision: 0 };
const newResult = { id: 'new', uri: 'file:///new.js', source: 'snapshot', documentVersion: 1, resultRevision: 0 };
const output = results => ({
  results, truncated: false, stats: { errors: [], skippedFiles: 0 }
});
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, engine = {}) {
  const controller = Object.create(SearchController.prototype);
  const previousAbort = new AbortController();
  const session = {
    id: 'query-reset', layout: 'modal', mode: 'replace', query: 'old',
    replacement: 'replacement', options: { mask: '*.js', maskEnabled: true },
    scope: { kind: 'workspace' }, results: [oldResult], selectedId: oldResult.id,
    generation: 7, previewRevision: 3, panels: new Set(), searching: false,
    previewRequestId: 'previous-client:1', scopeStale: true, needsRerun: true,
    partial: false, error: '', notice: '', diagnostics: '', patchAcks: new Map(),
    abort: previousAbort
  };
  const notifications = [];
  Object.assign(controller, {
    v: { window: { tabGroups: { all: [] } }, Uri: { parse: value => value } },
    engine, sessions: new Map([[session.id, session]]), disposed: false,
    configuration: () => ({ get: (key, fallback) => key === 'search.debounceMs' ? 60000 : fallback }),
    request: async current => ({ query: current.query }),
    notify: current => notifications.push({ generation: current.generation,
      results: current.results.slice(), selectedId: current.selectedId,
      searching: current.searching, error: current.error })
  });
  t.after(() => { clearTimeout(session.timer); session.abort?.abort(); });
  return { controller, session, notifications, previousAbort };
}

for (const [name, patch] of [
  ['query', { query: 'new' }],
  ['cleared query', { query: '' }],
  ['mask', { mask: '*.ts' }],
  ['mask toggle', { maskEnabled: false }],
  ['scope', { scope: { kind: 'openEditors' } }],
  ['regex option', { regex: true }],
  ['include filter', { include: 'src/**' }]
]) {
  test(`search-affecting ${name} immediately clears the previous modal generation`, async t => {
    const { controller, session, previousAbort, notifications } = fixture(t);
    await controller.message(session, { type: 'update', clientId: 'client', revision: 1, patch });
    assert.equal(previousAbort.signal.aborted, true);
    assert.equal(session.generation, 8);
    assert.deepEqual(session.results, []);
    assert.equal(session.selectedId, null);
    assert.equal(session.previewRevision, 4);
    assert.equal(session.previewRequestId, null);
    assert.equal(session.scopeStale, false);
    assert.equal(session.needsRerun, false);
    assert.equal(session.searching, Boolean(session.query));
    assert.equal(session.patchAcks.get('client'), 1);
    assert.deepEqual(notifications.at(-1).results, []);
  });
}

test('replacement-only input keeps the current search generation and selection', async t => {
  const { controller, session, previousAbort } = fixture(t);
  await controller.message(session, { type: 'update', clientId: 'client', revision: 1,
    patch: { replacement: 'different', preserveCase: true } });
  assert.equal(session.generation, 7);
  assert.equal(previousAbort.signal.aborted, false);
  assert.deepEqual(session.results, [oldResult]);
  assert.equal(session.selectedId, oldResult.id);
  assert.equal(session.timer, undefined);
});

test('a late superseded batch and completion cannot replace the new generation', async t => {
  const pending = [];
  const { controller, session } = fixture(t, {
    search: (request, callbacks) => new Promise((resolve, reject) =>
      pending.push({ request, callbacks, resolve, reject }))
  });
  controller.selectAutomatic = () => {};
  const oldSearch = controller.search(session);
  await tick();
  await controller.message(session, { type: 'update', clientId: 'client', revision: 1,
    patch: { query: 'new' } });
  assert.deepEqual(session.results, []);
  clearTimeout(session.timer);
  const newSearch = controller.search(session);
  await tick();
  assert.deepEqual(pending.map(item => item.request.query), ['old', 'new']);
  pending[1].callbacks.onBatch([newResult]);
  pending[0].callbacks.onBatch([oldResult]);
  pending[0].resolve(output([oldResult]));
  await oldSearch;
  assert.deepEqual(session.results, [newResult]);
  assert.equal(session.searching, true);
  pending[1].resolve(output([newResult]));
  await newSearch;
  assert.deepEqual(session.results, [newResult]);
  assert.equal(session.selectedId, newResult.id);
  assert.equal(session.searching, false);
});

test('a late failure from a superseded generation cannot replace current state', async t => {
  const pending = [];
  const { controller, session } = fixture(t, {
    search: (_request, callbacks) => new Promise((resolve, reject) => pending.push({ callbacks, resolve, reject }))
  });
  controller.selectAutomatic = () => {};
  const oldSearch = controller.search(session);
  await tick();
  await controller.message(session, { type: 'update', patch: { mask: '*.ts' } });
  clearTimeout(session.timer);
  const newSearch = controller.search(session);
  await tick();
  pending[1].callbacks.onBatch([newResult]);
  pending[0].reject(new Error('obsolete failure'));
  await oldSearch;
  assert.equal(session.error, '');
  assert.deepEqual(session.results, [newResult]);
  pending[1].resolve(output([newResult]));
  await newSearch;
  assert.equal(session.error, '');
});

test('a preview completed after a scope reset is not posted to the webview', async t => {
  let finishPreview;
  const posted = [];
  const { controller, session } = fixture(t);
  controller.v = { window: { tabGroups: { all: [] } }, Uri: { parse: value => value },
    workspace: { openTextDocument: async uri => ({ uri, version: 1 }) } };
  controller.preview = { render: () => new Promise(resolve => { finishPreview = resolve; }) };
  session.panels.add({ webview: { postMessage: value => posted.push(value) } });
  const rendering = controller.select(session, oldResult.id);
  await tick();
  assert.equal(typeof finishPreview, 'function');
  await controller.message(session, { type: 'update', patch: { scope: { kind: 'openEditors' } } });
  finishPreview({ name: 'old.js', lines: [] });
  await rendering;
  assert.deepEqual(posted, []);
  assert.equal(session.selectedId, null);
});

test('snapshot publishes preview and per-result revision bindings', t => {
  const { controller, session } = fixture(t);
  const snapshot = controller.snapshot(session);
  assert.equal(snapshot.previewRevision, 3);
  assert.equal(snapshot.previewRequestId, 'previous-client:1');
  assert.equal(snapshot.results[0].resultRevision, 0);
  session.results = [{ ...oldResult, resultRevision: 9 }];
  assert.equal(controller.snapshot(session).results[0].resultRevision, 9);
});

test('a current modal selection publishes its exact request, generation and revision', async t => {
  const posted = [];
  const { controller, session } = fixture(t);
  controller.v = { window: { tabGroups: { all: [] } }, Uri: { parse: value => value },
    workspace: { openTextDocument: async () => ({ version: 2 }) } };
  controller.preview = { render: async () => ({ name: 'current.js', lines: [] }) };
  session.panels.add({ webview: { postMessage: value => posted.push(value) } });
  await controller.message(session, { type: 'select', id: 'old', generation: 7,
    resultRevision: 0, previewRequestId: 'client:2' });
  assert.deepEqual(posted, [{ type: 'preview', preview: { name: 'current.js', lines: [], id: 'old',
    generation: 7, resultRevision: 0, previewRevision: 4, previewRequestId: 'client:2', preserveScroll: false } }]);
});

test('stale modal selection cannot adopt a same-ID row from a new generation or revision', async t => {
  const { controller, session } = fixture(t);
  const selected = [];
  controller.select = async (_session, id) => selected.push(id);
  for (const binding of [
    { generation: 6, resultRevision: 0, previewRequestId: 'client:1' },
    { generation: 7, resultRevision: 1, previewRequestId: 'client:1' },
    { generation: 7, resultRevision: 0 },
    { resultRevision: 0, previewRequestId: 'client:1' }
  ]) await controller.message(session, { type: 'select', id: 'old', ...binding });
  assert.deepEqual(selected, []);
  assert.equal(session.previewRequestId, 'previous-client:1');
  await controller.message(session, { type: 'select', id: 'old', generation: 7,
    resultRevision: 0, previewRequestId: 'client:2' });
  assert.deepEqual(selected, ['old']);
});

for (const failure of [false, true]) {
  test(`a late document open ${failure ? 'failure' : 'completion'} after reset cannot render or notify`, async t => {
    let resolveOpen, rejectOpen, renders = 0;
    const { controller, session, notifications } = fixture(t);
    controller.v = { window: { tabGroups: { all: [] } }, Uri: { parse: value => value }, workspace: {
      openTextDocument: () => new Promise((resolve, reject) => { resolveOpen = resolve; rejectOpen = reject; })
    } };
    controller.preview = { render: async () => { renders++; return {}; } };
    const selection = controller.select(session, 'old');
    await tick(); // the shared physical gate invokes its opener in a microtask
    controller.resetSearch(session);
    const before = notifications.length;
    if (failure) rejectOpen(new Error('obsolete open failure'));
    else resolveOpen({ version: 1 });
    await selection;
    assert.equal(renders, 0);
    assert.equal(notifications.length, before);
    assert.equal(session.notice, '');
  });
}

for (const change of ['row revision', 'document version']) for (const failure of [false, true]) {
  test(`a changed ${change} suppresses late same-ID preview ${failure ? 'failure' : 'delivery'}`, async t => {
    let finish, fail;
    const posted = [], document = { version: 1 };
    const { controller, session } = fixture(t);
    controller.v = { window: { tabGroups: { all: [] } }, Uri: { parse: value => value },
      workspace: { openTextDocument: async () => document } };
    controller.preview = { render: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }) };
    session.panels.add({ webview: { postMessage: value => posted.push(value) } });
    const selection = controller.select(session, 'old');
    await tick();
    if (change === 'row revision') session.results = [{ ...oldResult, resultRevision: 1 }];
    else document.version++;
    if (failure) fail(new Error('obsolete render failure'));
    else finish({ name: 'obsolete', lines: [] });
    await selection;
    assert.deepEqual(posted, []);
    assert.equal(session.notice, '');
  });
}

test('same-ID repeated selection and late render failures honor the newest request', async t => {
  const pending = [], posted = [];
  const { controller, session } = fixture(t);
  controller.v = { window: { tabGroups: { all: [] } }, Uri: { parse: value => value },
    workspace: { openTextDocument: async () => ({ version: 1 }) } };
  controller.preview = { render: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) };
  session.panels.add({ webview: { postMessage: value => posted.push(value) } });
  const first = controller.message(session, { type: 'select', id: 'old', generation: 7,
    resultRevision: 0, previewRequestId: 'client:1' });
  await tick();
  const second = controller.message(session, { type: 'select', id: 'old', generation: 7,
    resultRevision: 0, previewRequestId: 'client:2' });
  await tick();
  pending[1].resolve({ name: 'current', lines: [] });
  await second;
  pending[0].reject(new Error('late old failure'));
  await first;
  assert.equal(posted.length, 1);
  assert.equal(posted[0].preview.previewRequestId, 'client:2');
  assert.equal(posted[0].preview.previewRevision, 5);
  assert.equal(session.notice, '');
});

for (const [name, query, regex, error] of [
  ['invalid current regex', '[', true, /Invalid regular expression|Unterminated character class/],
  ['nonempty zero-result query', 'absent', false, /^$/]
]) {
  test(`${name} completes without restoring the previous result set`, async t => {
    const { controller, session } = fixture(t, new SearchEngine());
    controller.request = async current => ({ query: current.query, regex: current.options.regex,
      scope: { kind: 'openEditors' }, roots: [], documents: [] });
    await controller.message(session, { type: 'update', patch: { query, regex } });
    assert.deepEqual(session.results, []);
    clearTimeout(session.timer);
    await controller.search(session);
    assert.equal(session.query, query);
    assert.equal(session.searching, false);
    assert.deepEqual(session.results, []);
    assert.equal(session.selectedId, null);
    assert.match(session.error, error);
  });
}

test('fast parameter edits followed by Rerun reject every earlier request and late callback', async t => {
  const pending = [];
  const { controller, session } = fixture(t, {
    search: (request, callbacks) => new Promise((resolve, reject) => pending.push({ request, callbacks, resolve, reject }))
  });
  controller.selectAutomatic = () => {};
  controller.request = async current => ({ query: current.query, ...current.options, scope: { ...current.scope } });
  const searches = [controller.search(session)];
  await tick();
  for (const patch of [{ query: 'needle' }, { mask: '*.ts' }, { scope: { kind: 'openEditors' } }]) {
    await controller.message(session, { type: 'update', patch });
    clearTimeout(session.timer);
    searches.push(controller.search(session));
    await tick();
  }
  // Rerun is disabled while discovery is busy; finish the current request
  // before requesting a new generation, while older canceled callbacks remain late.
  pending.at(-1).resolve(output([newResult]));
  await searches.at(-1);
  await controller.message(session, { type: 'refresh' });
  clearTimeout(session.timer);
  searches.push(controller.search(session));
  await tick();
  assert.equal(session.generation, 11);
  assert.deepEqual(session.results, []);
  assert.deepEqual(pending.at(-1).request,
    { query: 'needle', mask: '*.ts', maskEnabled: true, scope: { kind: 'openEditors', name: '' } });
  pending.at(-1).callbacks.onBatch([newResult]);
  for (let i = 0; i < pending.length - 1; i++) {
    pending[i].callbacks.onBatch([oldResult]);
    if (i % 2) pending[i].reject(new Error('obsolete failure'));
    else pending[i].resolve(output([oldResult]));
  }
  pending.at(-1).resolve(output([newResult]));
  await Promise.all(searches);
  assert.deepEqual(session.results, [newResult]);
  assert.equal(session.selectedId, newResult.id);
  assert.equal(session.error, '');
  assert.equal(session.searching, false);
});


for (const failure of [false, true]) {
  test(`validation admission retires a late same-ID verified preview ${failure ? 'failure' : 'delivery'}`, async t => {
    let finish, fail;
    const posted = [], document = { version: 1 };
    const { controller, session } = fixture(t);
    controller.v.workspace = { openTextDocument: async () => document };
    controller.preview = { render: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }) };
    session.panels.add({ webview: { postMessage: value => posted.push(value) } });
    t.after(() => controller.cancelValidations(session));
    const selection = controller.select(session, 'old');
    await tick();
    controller.queueValidation(session, oldResult.uri, 60000);
    const deadline = session.validations.get(oldResult.uri).deadline;
    assert.equal(session.results[0].resultRevision, 1);
    assert.equal(session.results[0].pending, true);
    controller.queueValidation(session, oldResult.uri, 60000);
    assert.equal(session.results[0].resultRevision, 1, 'a hot pending echo is not another row revision');
    assert.equal(session.validations.get(oldResult.uri).deadline, deadline);
    if (failure) fail(new Error('obsolete verified preview failure'));
    else finish({ name: 'obsolete verified preview', lines: [] });
    await selection;
    assert.deepEqual(posted, []);
    assert.equal(session.notice, '');
    controller.preview.render = async () => ({ name: 'current pending preview', lines: [] });
    await controller.message(session, { type: 'select', id: 'old', generation: session.generation,
      resultRevision: 1, previewRequestId: 'client:pending' });
    assert.equal(posted.at(-1).preview.name, 'current pending preview');
    assert.equal(posted.at(-1).preview.resultRevision, 1);
  });
}
