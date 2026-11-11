'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { SearchController } = require('../src/controller');
const { classifySkips, incompleteSearch, skipDiagnostics } = require('../src/search/diagnostics');
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
function session() {
  return {
    id: 's',
    panels: new Set(),
    results: [],
    options: {},
    scope: { kind: 'workspace' },
    generation: 1,
    query: 'old',
    selectedId: null,
    previewRevision: 0
  };
}
function stub(engine) {
  const controller = Object.create(SearchController.prototype);
  Object.assign(controller, {
    engine,
    sessions: new Map(),
    disposed: false,
    request: async (s) => ({ query: s.query }),
    configuration: () => ({ get: (_key, fallback) => fallback }),
    notify() {},
    select: async () => {}
  });
  return controller;
}

function modalFixture(setting = 'some') {
  const controller = stub({}),
    s = session(),
    calls = [];
  const parse = (value) => ({ path: new URL(value).pathname, toString: () => value });
  Object.assign(s, { uri: parse('jbsearch:/s.jbsearch'), mode: 'find' });
  controller.sessions.set(s.id, s);
  controller.currentId = s.id;
  controller.schedule = () => {};
  controller.v = {
    version: '1.143.1',
    Uri: { parse },
    workspace: { getConfiguration: () => ({ get: () => setting }) },
    window: {
      activeTextEditor: undefined,
      showInformationMessage: async () => undefined,
      showErrorMessage: (message) => assert.fail(message)
    },
    commands: {
      executeCommand: async (...args) => {
        calls.push(args);
      }
    }
  };
  return { controller, s, calls };
}

test('a new modal view resolves the same session before the old view is disposed', async () => {
  const { controller, s, calls } = modalFixture();
  const events = [];
  const old = {
    dispose() {
      events.push('dispose old');
      s.panels.delete(old);
    }
  };
  s.panels.add(old);
  const previousUri = s.uri;
  controller.v.commands.executeCommand = async (...args) => {
    calls.push(args);
    events.push('open new');
    assert.equal(controller.openCustomDocument(args[1]).session, s);
    s.panels.add({ webview: { postMessage() {} } });
  };
  await controller.show('replace');
  assert.deepEqual(events, ['open new', 'dispose old']);
  assert.notEqual(s.uri.toString(), previousUri.toString());
  assert.equal(s.query, 'old');
  assert.equal(s.mode, 'replace');
  assert.equal(controller.currentId, s.id);
  assert.equal(calls[0][0], '_workbench.openWith');
});

test('disabled modal editors keep the existing source view open', async () => {
  const { controller, s, calls } = modalFixture('off');
  let disposed = false;
  const previousUri = s.uri;
  s.panels.add({
    dispose() {
      disposed = true;
    }
  });
  await controller.show('replace');
  assert.equal(disposed, false);
  assert.equal(s.uri, previousUri);
  assert.equal(calls.length, 0);
});

test('concurrent shortcuts share one opening and retain the latest mode', async () => {
  const { controller, s } = modalFixture();
  let complete,
    calls = 0;
  controller.v.commands.executeCommand = () => {
    calls++;
    return new Promise((resolve) => (complete = resolve));
  };
  const find = controller.show('find');
  const replace = controller.show('replace');
  await pause();
  assert.equal(calls, 1);
  complete();
  await Promise.all([find, replace]);
  assert.equal(s.mode, 'replace');
});

test('a superseded search cannot publish its late results or overwrite a new query', async () => {
  let finish;
  const controller = stub({ search: () => new Promise((resolve) => (finish = resolve)) });
  const s = session();
  controller.sessions.set(s.id, s);
  const running = controller.search(s);
  await pause();
  s.generation++;
  s.query = 'new';
  s.results = [{ id: 'new' }];
  finish({ results: [{ id: 'old' }], truncated: false, stats: { errors: [], skippedFiles: 0 } });
  await running;
  assert.deepEqual(s.results, [{ id: 'new' }]);
});
test('replacement refuses partial results and a mismatched generation before opening files', async () => {
  const controller = stub({});
  const s = { ...session(), mode: 'replace', partial: true };
  await assert.rejects(() => controller.replace(s, true, { generation: 1 }), /complete/);
  s.partial = false;
  await assert.rejects(() => controller.replace(s, true, { generation: 0 }), /current search/);
});

test('search completeness fails closed for missing or inconsistent skip counts', () => {
  assert.equal(incompleteSearch({ truncated: false, stats: { skippedFiles: 0, errors: [] } }), false);
  assert.equal(incompleteSearch({ truncated: false, stats: { skippedFiles: 1, errors: [] } }), true);
  assert.equal(incompleteSearch({ truncated: false, stats: {
    skippedFiles: 1, excludedBinaryFiles: 1, blockingSkippedFiles: 1, errors: []
  } }), true);
  assert.equal(incompleteSearch({ truncated: false, stats: {
    skippedFiles: 0, excludedBinaryFiles: 1, blockingSkippedFiles: 0, errors: []
  } }), true);
  assert.equal(incompleteSearch({ truncated: false, stats: {
    skippedFiles: 1, excludedBinaryFiles: 1, blockingSkippedFiles: 0, errors: [],
    skippedDetails: [{ blocking: true, reason: 'encoding' }], skippedDetailsOmitted: 0
  } }), true, 'details contradicting aggregate counts must fail closed');
  assert.equal(classifySkips({ skippedFiles: 1, excludedBinaryFiles: 1, blockingSkippedFiles: 0 }).blocking, 0);
  assert.equal(incompleteSearch({ truncated: false, stats: {
    skippedFiles: 1, excludedBinaryFiles: 1, blockingSkippedFiles: 0, errors: [],
    skippedDetails: [{ path: '/workspace/image.png', reason: 'binary', blocking: false, format: 'PNG' }],
    skippedDetailsOmitted: 0
  } }), false);
  assert.match(skipDiagnostics({ skippedFiles: 1, excludedBinaryFiles: 1, blockingSkippedFiles: 0,
    skippedDetails: [{ path: '/workspace/image.png', reason: 'binary', blocking: false, format: 'PNG' }],
    skippedDetailsOmitted: 0 }), /image\.png — binary file excluded/);
});

test('search reports excluded archives separately and retains bounded, plain-text blocker details', async () => {
  const pathWithMarkup = '/workspace/<script>\narchive.docx';
  const stats = { skippedFiles: 2, excludedBinaryFiles: 1, blockingSkippedFiles: 1, errors: [],
    skippedDetails: [
      { path: pathWithMarkup, reason: 'binary', blocking: false, format: 'ZIP' },
      { path: '/workspace/legacy.txt', reason: 'encoding', blocking: true }
    ] };
  const controller = stub({ search: async () => ({ results: [{ id: 'match' }], truncated: false, stats }) });
  controller.configuration = () => ({ get: (_key, fallback) => fallback });
  const s = { ...session(), mode: 'replace', searching: true };
  controller.sessions.set(s.id, s);
  await controller.search(s);
  assert.equal(s.partial, true, 'a blocker must override even an inconsistent truncated flag');
  assert.match(s.diagnostics, /binary file excluded from text search/);
  assert.match(s.diagnostics, /contents are not searched or replaced/);
  assert.match(s.diagnostics, /legacy\.txt — unsupported encoding/);
  assert.ok(s.diagnostics.includes('<script>\\u000aarchive.docx'));
  assert.equal(controller.snapshot(s).diagnostics, s.diagnostics);
  controller.resetSearch(s);
  assert.equal(s.diagnostics, '', 'a new generation must discard old paths');

  const overflow = skipDiagnostics({ skippedFiles: 25, excludedBinaryFiles: 25, blockingSkippedFiles: 0,
    skippedDetailsOmitted: 5,
    skippedDetails: Array.from({ length: 20 }, (_, index) => ({ path: `path-${index}`, reason: 'binary', blocking: false, format: 'ZIP' })) });
  assert.match(overflow, /5 additional paths are not shown/);
  assert.doesNotMatch(overflow, /path-20/);
});
test('preview replies from a previously selected result are discarded', async () => {
  const delivered = [],
    pending = new Map();
  const controller = stub({});
  controller.select = SearchController.prototype.select;
  controller.v = {
    Uri: { parse: (value) => value },
    workspace: { openTextDocument: async (uri) => ({ uri }) }
  };
  controller.preview = {
    render: (_document, result) => new Promise((resolve) => pending.set(result.id, resolve))
  };
  const s = {
    ...session(),
    results: [
      { id: 'a', uri: 'one' },
      { id: 'b', uri: 'two' }
    ],
    panels: new Set([{ webview: { postMessage: (value) => delivered.push(value) } }])
  };
  controller.sessions.set(s.id, s);
  const first = controller.select(s, 'a');
  await pause();
  const second = controller.select(s, 'b');
  await pause();
  pending.get('b')({ name: 'second' });
  await second;
  pending.get('a')({ name: 'first' });
  await first;
  assert.deepEqual(
    delivered.map((item) => item.preview.id),
    ['b']
  );
});

test('input acknowledgements preserve client order and return host-normalized fields', async () => {
  const controller = stub({}),
    delivered = [],
    s = session();
  controller.configuration = () => ({ get: (_key, fallback) => fallback });
  controller.notify = (value) => delivered.push(controller.snapshot(value));
  controller.schedule = (value) => controller.notify(value);
  controller.sessions.set(s.id, s);
  await controller.message(s, {
    type: 'update',
    clientId: 'first',
    revision: 2,
    patch: { query: 'x'.repeat(20001) }
  });
  assert.equal(delivered.at(-1).query.length, 20000);
  assert.deepEqual(delivered.at(-1).patchAcks, { first: 2 });
  controller.sessions.set(s.id, s);
  await controller.message(s, {
    type: 'update',
    clientId: 'first',
    revision: 1,
    patch: { query: 'late stale input' }
  });
  assert.equal(s.query.length, 20000);
  controller.sessions.set(s.id, s);
  await controller.message(s, {
    type: 'update',
    clientId: 'second',
    revision: 1,
    patch: { replacement: 'second client' }
  });
  assert.equal(s.replacement, 'second client');
  assert.deepEqual(delivered.at(-1).patchAcks, { first: 2, second: 1 });
});

test('rejected input during replacement is acknowledged with unchanged host values', async () => {
  const controller = stub({}),
    delivered = [],
    s = { ...session(), replacing: true };
  controller.configuration = () => ({ get: (_key, fallback) => fallback });
  controller.notify = (value) => delivered.push(controller.snapshot(value));
  controller.schedule = () => assert.fail('a rejected patch must not schedule a search');
  controller.sessions.set(s.id, s);
  await controller.message(s, {
    type: 'update',
    clientId: 'client',
    revision: 1,
    patch: { query: 'rejected' }
  });
  assert.equal(s.query, 'old');
  assert.deepEqual(delivered.at(-1).patchAcks, { client: 1 });
  assert.equal(delivered.at(-1).replacing, true);
});

test('Open Editors tab changes mark the frozen scope stale without rerunning custom or text tabs', () => {
  let tabsChanged;
  const noopEvent = () => ({ dispose() {} });
  class TabInputText {}
  const vscode = {
    TabInputText,
    EventEmitter: class {
      constructor() { this.event = noopEvent; }
      fire() {}
      dispose() {}
    },
    commands: { registerCommand: noopEvent, executeCommand: async () => {} },
    window: {
      createTreeView: () => ({ onDidChangeSelection: noopEvent, dispose() {} }),
      registerCustomEditorProvider: noopEvent,
      onDidChangeActiveColorTheme: noopEvent,
      tabGroups: {
        onDidChangeTabs: (callback) => {
          tabsChanged = callback;
          return { dispose() {} };
        }
      }
    },
    workspace: {
      onDidChangeTextDocument: noopEvent,
      onDidChangeConfiguration: noopEvent,
      createFileSystemWatcher: () => ({
        onDidChange: noopEvent,
        onDidCreate: noopEvent,
        onDidDelete: noopEvent,
        dispose() {}
      })
    }
  };
  const controller = new SearchController(
    vscode,
    { subscriptions: [] },
    { dispose() {} },
    { dispose() {} }
  );
  const s = {
    ...session(),
    scope: { kind: 'openEditors' },
    panels: new Set([{}])
  };
  controller.sessions.set(s.id, s);
  controller.notify = () => {};
  let scheduled = 0;
  controller.schedule = () => scheduled++;
  tabsChanged({ opened: [{ input: new TabInputText() }], closed: [], changed: [] });
  tabsChanged({ opened: [], closed: [{ input: new TabInputText() }], changed: [] });
  assert.equal(scheduled, 0);
  assert.equal(s.scopeStale, true);
  tabsChanged({ opened: [{ input: {} }], closed: [], changed: [] });
  assert.equal(scheduled, 0);
  assert.equal(s.scopeStale, true);
  s.scope = { kind: 'workspace' };
  tabsChanged({ opened: [{ input: new TabInputText() }], closed: [], changed: [] });
  assert.equal(scheduled, 0);
  assert.equal(s.scopeStale, true);
  controller.dispose();
});

test('completed search refreshes preview highlights with matches from every batch', async () => {
  const first = { id: 'a', uri: 'same' },
    second = { id: 'b', uri: 'same' },
    previewSizes = [];
  const controller = stub({
    search: async (_request, { onBatch }) => {
      onBatch([first]);
      onBatch([second]);
      return {
        results: [first, second],
        truncated: false,
        stats: { errors: [], skippedFiles: 0 }
      };
    }
  });
  controller.select = async (s) => previewSizes.push(s.results.length);
  const s = session(); controller.sessions.set(s.id, s);
  await controller.search(s);
  assert.deepEqual(previewSizes, [1, 2]);
});

test('changing client settings does not restart workspace search or reset its selection', () => {
  const controller = stub({});
  const workspaceSession = { ...session(), panels: new Set([{}]), selectedId: 'selected' };
  const openSession = { ...session(), id: 'open', panels: new Set([{}]), scope: { kind: 'openEditors' } };
  const uri = (name, scheme = 'file') => ({ scheme, fsPath: name, toString: () => name });
  class TabInputText { constructor(value) { this.uri = value; } }
  const external = uri('/client/settings.json'), source = uri('/workspace/Example.bl'), untitled = uri('Untitled-1', 'untitled');
  controller.v = {
    TabInputText,
    window: { tabGroups: { all: [{ tabs: [{ input: new TabInputText(untitled) }] }] } },
    workspace: { getWorkspaceFolder: value => value === source ? {} : undefined }
  };
  controller.sessions.set(workspaceSession.id, workspaceSession);
  controller.sessions.set(openSession.id, openSession);
  const scheduled = [];
  controller.schedule = value => scheduled.push(value.id);
  controller.documentChanged({ document: { uri: external }, contentChanges: [{}] });
  assert.deepEqual(scheduled, []);
  assert.equal(workspaceSession.selectedId, 'selected');
  controller.documentChanged({ document: { uri: source }, contentChanges: [{}] });
  assert.deepEqual(scheduled, []);
  assert.equal(workspaceSession.scopeStale, true);
  controller.documentChanged({ document: { uri: untitled }, contentChanges: [{}] });
  assert.deepEqual(scheduled, []);
  assert.equal(openSession.scopeStale, true);
  controller.documentChanged({ document: { uri: source }, contentChanges: [] });
  assert.deepEqual(scheduled, []);
  assert.equal(openSession.scopeStale, true);
});

test('Open Editors marks snapshots stale after text tabs open or close, without restarting', () => {
  let tabsChanged;
  const noopEvent = () => ({ dispose() {} });
  class TabInputText { constructor(uri) { this.uri = uri; } }
  const tabUri = { scheme: 'file', fsPath: '/workspace/file.js', toString: () => 'file:///workspace/file.js' };
  const textTab = { input: new TabInputText(tabUri) };
  const vscode = {
    TabInputText,
    Uri: { parse: () => tabUri },
    EventEmitter: class {
      constructor() { this.event = noopEvent; }
      fire() {}
      dispose() {}
    },
    commands: { registerCommand: noopEvent, executeCommand: async () => {} },
    window: {
      createTreeView: () => ({ onDidChangeSelection: noopEvent, dispose() {} }),
      registerCustomEditorProvider: noopEvent,
      onDidChangeActiveColorTheme: noopEvent,
      tabGroups: {
        all: [{ tabs: [] }],
        onDidChangeTabs: (callback) => {
          tabsChanged = callback;
          return { dispose() {} };
        }
      }
    },
    workspace: {
      onDidChangeTextDocument: noopEvent,
      onDidChangeConfiguration: noopEvent,
      createFileSystemWatcher: () => ({
        onDidChange: noopEvent,
        onDidCreate: noopEvent,
        onDidDelete: noopEvent,
        dispose() {}
      })
    }
  };
  const controller = new SearchController(
    vscode,
    { subscriptions: [] },
    { dispose() {} },
    { dispose() {} }
  );
  const s = {
    ...session(),
    scope: { kind: 'openEditors' },
    observedOpenEditorUris: new Set(),
    panels: new Set([{}])
  };
  controller.sessions.set(s.id, s);
  let scheduled = 0;
  controller.schedule = () => scheduled++;
  controller.notify = () => {};
  vscode.window.tabGroups.all[0].tabs.push(textTab);
  tabsChanged({ opened: [textTab], closed: [], changed: [] });
  vscode.window.tabGroups.all[0].tabs = [];
  tabsChanged({ opened: [], closed: [textTab], changed: [] });
  assert.equal(scheduled, 0);
  assert.equal(s.scopeEventRevision, 2);
  assert.equal(s.scopeStale, true);
  tabsChanged({ opened: [{ input: {} }], closed: [], changed: [] });
  assert.equal(scheduled, 0);
  assert.equal(s.scopeEventRevision, 2);
  s.scope = { kind: 'workspace' };
  tabsChanged({ opened: [{ input: new TabInputText() }], closed: [], changed: [] });
  assert.equal(scheduled, 0);
  assert.equal(s.scopeEventRevision, 2);
  controller.dispose();
});

for (const end of ['cancel', 'dispose', 'detach', 'documentClose']) {
  test(`a late modal render cannot publish after ${end}`, async () => {
    const controller = stub({}), s = session(), delivered = [];
    controller.select = SearchController.prototype.select;
    controller.configuration = () => ({ get: (_key, fallback) => fallback });
    const document = { isClosed: false };
    controller.v = {
      Uri: { parse: value => value },
      workspace: { openTextDocument: async () => document }
    };
    let finishRender, announce;
    const started = new Promise(resolve => { announce = resolve; });
    controller.preview = { render: () => {
      announce();
      return new Promise(resolve => { finishRender = resolve; });
    } };
    s.results = [{ id: 'a', uri: 'one' }];
    s.panels.add({ webview: { postMessage: value => delivered.push(value) } });
    controller.sessions.set(s.id, s);
    const selecting = controller.select(s, 'a');
    await started;
    if (end === 'cancel') s.previewAbort.abort();
    if (end === 'dispose') controller.disposed = true;
    if (end === 'detach') controller.sessions.delete(s.id);
    if (end === 'documentClose') document.isClosed = true;
    finishRender({ name: 'late' });
    await selecting;
    assert.deepEqual(delivered, []);
    controller.documentOpenGate.dispose();
  });
}
