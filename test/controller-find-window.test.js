'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { contentHash } = require('../src/content-hash');
const { bindDocumentAuthority } = require('../src/source-authority');
const { requestFingerprint } = require('../src/replace-preflight');
const { SearchController } = require('../src/controller');
const { SearchEngine, iterateMatches } = require('../src/search');

const uriFor = (value) => ({
  scheme: value.split(':')[0], path: new URL(value).pathname,
  query: new URL(value).search.slice(1),
  fsPath: new URL(value).pathname, toString: () => value,
  with(changes) {
    const next = new URL(value);
    if (changes.path !== undefined) next.pathname = changes.path;
    if (changes.query !== undefined) next.search = changes.query;
    if (changes.fragment !== undefined) next.hash = changes.fragment;
    return uriFor(next.toString());
  }
});
const sourceUri = uriFor('file:///workspace/src/example.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
const output = (results) => ({ results, truncated: false, stats: {
  filesScanned: results.length ? 1 : 0, filesMatched: results.length ? 1 : 0,
  matches: results.length, skippedFiles: 0, excludedBinaryFiles: 0, blockingSkippedFiles: 0,
  skipped: { tooLarge: 0, binary: 0, encoding: 0, unreadable: 0 },
  skippedDetails: [], skippedDetailsOmitted: 0, errors: [], cancelled: false, timedOut: false
} });

function fixture(t, engine = new SearchEngine()) {
  const events = {}, commands = [], previews = [], nativeCommands = new Map();
  const listen = name => callback => {
    events[name] = callback;
    return { dispose() {} };
  };
  const document = {
    encoding: 'utf8',
    uri: sourceUri, fileName: sourceUri.fsPath, languageId: 'javascript', eol: 1,
    version: 1, text: 'cat! cat!', isDirty: false,
    getText() { return this.text; },
    positionAt(offset) {
      offset = Math.max(0, Math.min(offset, this.text.length));
      const lines = this.text.slice(0, offset).split('\n');
      return { line: lines.length - 1, character: lines.at(-1).length };
    },
    offsetAt(position) {
      const lines = this.text.split('\n');
      return lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character;
    }
  };
  class TabInputText { constructor(uri) { this.uri = uri; } }
  class Range {
    constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; }
  }
  class WorkspaceEdit {
    constructor() { this.entries = []; }
    replace(uri, range, replacement) { this.entries.push({ uri, range, replacement }); }
  }
  const config = { get: (_key, fallback) => fallback };
  const v = {
    EventEmitter: class {
      constructor() { this.listeners = []; this.event = callback => { this.listeners.push(callback); return { dispose() {} }; }; }
      fire(value) { for (const listener of this.listeners) listener(value); }
      dispose() {}
    },
    version: '1.144.1', TabInputText, Range, WorkspaceEdit, EndOfLine: { CRLF: 2 }, ViewColumn: { One: 1 },
    Uri: {
      parse: uriFor,
      joinPath: (base, ...parts) => base.with({ path: base.path.replace(/\/$/, '') + '/' + parts.join('/') })
    },
    window: {
      createTreeView: () => ({
        visible: true, selection: [],
        onDidChangeSelection: listen('treeSelection'),
        async reveal(node, options) { events.revealedNode = node; if (options?.select) this.selection = [node]; },
        dispose() {}
      }),
      registerCustomEditorProvider: () => ({ dispose() {} }),
      onDidChangeActiveColorTheme: listen('theme'),
      tabGroups: { all: [{ tabs: [{ input: new TabInputText(sourceUri) }] }], onDidChangeTabs: listen('tabs') },
      showErrorMessage: message => assert.fail(message)
    },
    workspace: {
      workspaceFolders: [],
      textDocuments: [document], getConfiguration: () => config,
      getWorkspaceFolder: () => ({}),
      openTextDocument: async () => document,
      onDidChangeTextDocument: listen('document'), onDidChangeConfiguration: listen('configuration'),
      onDidSaveTextDocument: listen('save'), onDidCloseTextDocument: listen('close'),
      onDidRenameFiles: listen('rename'),
      onDidChangeWorkspaceFolders: listen('folders'),
      createFileSystemWatcher: () => ({
        onDidChange: listen('fileChange'), onDidCreate: listen('fileCreate'), onDidDelete: listen('fileDelete'), dispose() {}
      }),
      async applyEdit(edit) {
        const changes = edit.entries.map(item => ({
          rangeOffset: document.offsetAt(item.range.start),
          rangeLength: document.offsetAt(item.range.end) - document.offsetAt(item.range.start), text: item.replacement
        }));
        change(changes);
        return true;
      }
    },
    commands: {
      registerCommand(id, callback) { nativeCommands.set(id, callback); return { dispose() {} }; },
      executeCommand: async (...args) => {
      commands.push(args);
      if (args[0] === 'jbsearch.results.focus') events.focus = 'results';
      if (args[0] === '_workbench.openWith' || args[0] === 'vscode.openWith') {
        const customDocument = controller.openCustomDocument(args[1]);
        panel(customDocument.session, args[0] === 'vscode.openWith' ? 1 : undefined);
      }
      if (args[0] === 'workbench.action.moveModalEditorToMain')
        for (const session of controller.sessions.values())
          for (const view of session.panels) view.viewColumn = 1;
    } }
  };
  const context = { subscriptions: [], extensionUri: uriFor('file:///extension') };
  const controller = new SearchController(v, context, engine, { dispose() {}, invalidate() {} });
  // These legacy controller/UI fixtures intentionally have no backing file.
  // Keep their buffer-only worker scope explicit; real disk/source authority is
  // tested without these overrides in controller-source-authority/rooted-scopes.
  const request = controller.request.bind(controller);
  controller.request = async (...args) => {
    const value = await request(...args);
    value.sourcePolicy = 'buffer-validation';
    for (const descriptor of value.documents) descriptor.text = document.getText();
    return value;
  };
  controller.prepareReplacementSource = async () => undefined;
  controller.renderPanel = (session, view) => { view.layout = session.layout; };
  controller.findPreview = {
    show: async (...args) => previews.push(['show', ...args]),
    update: (...args) => previews.push(['update', ...args]),
    clear: () => previews.push(['clear'])
  };
  t.after(() => controller.dispose());

  function panel(session, column = 1) {
    let disposed = false;
    const callbacks = {};
    for (const current of controller.sessions.values())
      for (const view of current.panels) view.active = false;
    const view = {
      active: true, visible: true, viewColumn: column, callbacks, messages: [],
      webview: { postMessage(message) { view.messages.push(message); }, onDidReceiveMessage: callback => { callbacks.message = callback; } },
      onDidDispose: callback => { callbacks.dispose = callback; },
      onDidChangeViewState: callback => { callbacks.active = callback; },
      reveal(nextColumn) { this.viewColumn = nextColumn; this.active = true; },
      dispose() { if (!disposed) { disposed = true; events.focus = 'editor'; callbacks.dispose(); } }
    };
    controller.resolveCustomEditor({ session }, view);
    return view;
  }
  function matches(query = 'cat', options = {}) {
    return [...iterateMatches(document.text, { query, ...options }, {
      uri: sourceUri.toString(), fsPath: sourceUri.fsPath, rootName: 'workspace',
      relativePath: 'src/example.js', label: 'example.js', source: 'snapshot',
      documentVersion: document.version,
      contentHash: createHash('sha256').update(document.text, 'utf16le').digest('hex')
    })];
  }
  function session(query = 'cat', options = {}, mode = 'find') {
    const result = controller.create(mode);
    Object.assign(result, { layout: 'findWindow', query, options: { ...result.options, ...options },
      scope: { kind: 'openEditors' }, results: matches(query, options) });
    // Synthetic rows stand for a completed buffer-only discovery. Native/backend
    // composition tests still exercise explicit approval admission below.
    result.searchRequestFingerprint = requestFingerprint({ query: result.query,
      sourcePolicy: 'buffer-validation', ...result.options, masksEnabled: result.options.maskEnabled,
      fileMask: result.options.mask, scope: result.scope, maxResults: 5000, maxFileSizeMiB: 2,
      timeoutMs: 10000, roots: [], documents: [{ uri: sourceUri.toString() }] });
    bindDocumentAuthority(result, document); // This fixture represents completed known buffer discovery.
    result.selectedId = result.results[0]?.id;
    controller.findTree.update(controller.snapshot(result), { activate: true });
    return result;
  }
  function change(changes, reason) {
    for (const item of [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset))
      document.text = document.text.slice(0, item.rangeOffset) + item.text + document.text.slice(item.rangeOffset + item.rangeLength);
    document.version++;
    document.isDirty = true;
    events.document({ document, contentChanges: changes, reason });
  }
  async function validate(session) {
    const entry = session.validations.get(sourceUri.toString());
    assert.ok(entry, 'an edited file must be queued for validation');
    clearTimeout(entry.timer);
    await controller.validateDocument(session, sourceUri.toString(), entry);
  }
  return { controller, document, session, matches, panel, change, validate, events, commands, previews, v, nativeCommands };
}

test('Find snapshot validates regex context in the worker, retains INVALID rows, and restores them on Undo', async t => {
  const f = fixture(t), s = f.session('cat(?=!)', { regex: true });
  const ids = s.results.map(result => result.id);
  f.change([{ rangeOffset: 3, rangeLength: 1, text: '?' }]);
  assert.ok(s.results.every(result => result.pending));
  await f.validate(s);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.deepEqual(s.results.map(result => result.invalid), [true, false]);
  f.change([{ rangeOffset: 3, rangeLength: 1, text: '!' }]);
  await f.validate(s);
  assert.ok(s.results.every(result => !result.pending && !result.invalid));
  f.change([{ rangeOffset: 0, rangeLength: 0, text: '\n' }, { rangeOffset: 9, rangeLength: 0, text: ' cat!' }]);
  await f.validate(s);
  assert.deepEqual(s.results.map(result => result.id), ids, 'new occurrences do not enter the frozen snapshot');
  assert.deepEqual(s.results.map(result => result.range.start.line), [1, 1]);
  f.controller.schedule(s, 0);
  clearTimeout(s.timer);
  await f.controller.search(s);
  assert.equal(s.error, '');
  assert.equal(s.results.length, 3, 'explicit rerun produces a fresh snapshot');
});

test('late validations cannot overwrite the current version of a Find snapshot', async t => {
  const pending = [];
  const f = fixture(t, { search: request => new Promise(resolve => pending.push({ request, resolve })), dispose() {} });
  const s = f.session();
  f.change([{ rangeOffset: 0, rangeLength: 1, text: 'b' }]);
  const first = f.validate(s);
  await pause();
  f.change([{ rangeOffset: 0, rangeLength: 1, text: 'c' }]);
  const second = f.validate(s);
  await pause();
  assert.equal(pending.length, 2);
  pending[1].resolve(output(f.matches()));
  await second;
  assert.ok(s.results.every(result => !result.invalid && !result.pending));
  pending[0].resolve(output([]));
  await first;
  assert.ok(s.results.every(result => !result.invalid && !result.pending));
});

test('incomplete validation leaves rows visibly unverified and refuses Replace All before opening files', async t => {
  const f = fixture(t, { search: async () => ({ ...output([]), truncated: true }), dispose() {} });
  const s = f.session('cat', {}, 'replace');
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'x' }]);
  await f.validate(s);
  assert.match(s.notice, /Could not validate/);
  assert.ok(s.results.every(result => result.invalid && !result.pending));
  assert.equal(s.needsRerun, true);
  f.v.workspace.openTextDocument = () => assert.fail('unsafe replace must not open any document');
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /INVALID|still being checked/);
});

test('a text snapshot becoming NUL-containing binary invalidates its saved matches', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  f.change([{ rangeOffset: f.document.text.length, rangeLength: 0, text: '\0' }]);
  await f.validate(s);
  assert.ok(s.results.every(result => result.invalid && !result.pending));
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /INVALID/);
});

test('deleting a file aborts validation and retains its INVALID rows at the same positions', async t => {
  let finish;
  const f = fixture(t, { search: () => new Promise(resolve => { finish = resolve; }), dispose() {} });
  const s = f.session(), ids = s.results.map(result => result.id);
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
  const checking = f.validate(s);
  await pause();
  f.events.fileDelete(sourceUri);
  finish(output(f.matches()));
  await checking;
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.invalid && result.unavailable && !result.pending));
});

test('document edits during initial enumeration keep its generation but mark completion partial without rerun', async t => {
  let finish, batch;
  const f = fixture(t, { search: (_request, callbacks) => {
    batch = callbacks.onBatch;
    return new Promise(resolve => { finish = resolve; });
  }, dispose() {} });
  const s = f.session();
  s.searching = true;
  s.results = [];
  const running = f.controller.search(s);
  await pause();
  const stale = f.matches();
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'new\n' }]);
  clearTimeout(s.timer);
  batch(stale);
  finish(output(stale));
  await running;
  assert.deepEqual(s.results.map(result => result.id), stale.map(result => result.id));
  assert.equal(s.searching, false);
  assert.equal(s.partial, true);
  assert.equal(s.needsRerun, true);
  assert.equal(s.timer, undefined, 'ordinary edits never schedule a full rerun');
});

test('finished Find snapshots ignore Open Editors tab churn and query setting changes', t => {
  const f = fixture(t), s = f.session(), ids = s.results.map(result => result.id);
  f.events.tabs({ opened: [{ input: new f.v.TabInputText(sourceUri) }], closed: [], changed: [] });
  f.events.configuration({ affectsConfiguration: section => section === 'jbsearch.scopes' });
  f.events.document({ document: f.document, contentChanges: [] });
  assert.equal(s.timer, undefined);
  assert.deepEqual(s.results.map(result => result.id), ids);
});

test('Find replacements use revalidated captures and remain as INVALID until rerun', async t => {
  const f = fixture(t), s = f.session('(cat)', { regex: true }, 'replace');
  s.replacement = '$1-dog';
  await f.controller.search(s);
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
  await f.validate(s);
  const ids = s.results.map(result => result.id);
  await f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  await f.validate(s);
  assert.equal(f.document.text, 'prefix cat-dog! cat-dog!');
  assert.equal(f.document.isDirty, true);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.invalid));
  await assert.rejects(() => f.controller.replace(s, false, { id: ids[0], generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /INVALID/);
});

test('Replace All refuses a new occurrence and preserves the old Find snapshot', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  s.replacement = 'dog';
  await f.controller.search(s);
  const ids = s.results.map(result => result.id);
  f.change([{ rangeOffset: f.document.text.length, rangeLength: 0, text: ' cat!' }]);
  await f.validate(s);
  assert.deepEqual(s.results.map(result => result.id), ids);
  const before = f.document.text;
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /results changed.*Rerun Search/);
  assert.equal(f.document.text, before);
  assert.deepEqual(s.results.map(result => result.id), ids);
});

test('Replace All detects changed regex captures even when match text and range are unchanged', async t => {
  const f = fixture(t);
  f.document.text = 'acat';
  const s = f.session('(?<=([ab]))cat', { regex: true }, 'replace');
  s.replacement = '$1';
  await f.controller.search(s);
  assert.equal(s.results[0].captures[0], 'a');
  // Simulate a missed event: the independent search must still find the change.
  f.document.text = 'bcat';
  f.document.version++;
  f.document.isDirty = true;
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /results changed.*Rerun Search/);
  assert.equal(f.document.text, 'bcat');
  assert.equal(s.results[0].captures[0], 'a');
});

test('replacement rejects missing or contradictory per-row provenance', async t => {
  for (const [kind, all, corrupt] of [
    ['singleMissingHash', false, match => { delete match.contentHash; }],
    ['allMissingSource', true, match => { delete match.source; }],
    ['allSecondHash', true, match => { match.contentHash = '0'.repeat(64); }],
    ['allMissingVersion', true, match => { delete match.documentVersion; }]
  ]) {
    await t.test(kind, async t => {
      const f = fixture(t), s = f.session('cat', {}, 'replace');
      await f.controller.search(s);
      const index = all ? 1 : 0;
      corrupt(s.results[index]);
      let applied = 0;
      f.v.workspace.applyEdit = async () => { applied++; return true; };
      await assert.rejects(() => f.controller.replace(s, all,
        { id: s.results[index].id, generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /provenance is incomplete|file changed/i);
      assert.equal(applied, 0);
    });
  }
});

test('single Replace refuses a different document identity or an unknown version', async t => {
  for (const kind of ['uri', 'version']) {
    await t.test(kind, async t => {
      const f = fixture(t), s = f.session('cat', {}, 'replace');
      await f.controller.search(s);
      const document = { ...f.document };
      if (kind === 'uri') document.uri = uriFor('file:///workspace/other.js');
      else document.version = undefined;
      f.v.workspace.openTextDocument = async () => document;
      let applied = 0;
      f.v.workspace.applyEdit = async () => { applied++; return true; };
      await assert.rejects(() => f.controller.replace(s, false,
        { id: s.results[0].id, generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /identified reliably/);
      assert.equal(applied, 0);
    });
  }
});

test('Replace All rejects incomplete, cancelled and malformed preflight output', async t => {
  for (const kind of ['limit', 'timeout', 'cancelled', 'error', 'malformed']) {
    await t.test(kind, async t => {
      const f = fixture(t), s = f.session('cat', {}, 'replace');
      await f.controller.search(s);
      const saved = s.results;
      const originalEngine = f.controller.engine;
      const stats = { ...output(saved).stats, cancelled: kind === 'cancelled', timedOut: kind === 'timeout',
        errors: kind === 'error' ? [{ message: 'cannot read' }] : [] };
      f.controller.engine = { search: async () => kind === 'malformed' ? { results: saved } :
        { results: saved, truncated: kind === 'limit', stats }, dispose: () => originalEngine.dispose() };
      let applied = 0;
      f.v.workspace.applyEdit = async () => { applied++; return true; };
      await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }),
        kind === 'timeout' ? /scope search timed out.*Rerun Search/ : /incomplete.*Rerun Search/);
      assert.equal(applied, 0);
      assert.equal(s.results, saved);
    });
  }
});

test('Replace All refuses incomplete or contradictory preflight statistics', async t => {
  const corruptions = {
    missingSkips: value => { delete value.stats.skippedFiles; },
    missingClassification: value => { delete value.stats.excludedBinaryFiles; },
    hiddenUnreadable: value => { value.stats.skipped.unreadable = 1; },
    incorrectMatches: value => { value.stats.matches++; },
    limitReason: value => { value.reason = 'limit'; }
  };
  for (const [kind, corrupt] of Object.entries(corruptions)) {
    await t.test(kind, async t => {
      const f = fixture(t), s = f.session('cat', {}, 'replace');
      await f.controller.search(s);
      const saved = s.results, broken = output(saved), originalEngine = f.controller.engine;
      corrupt(broken);
      f.controller.engine = { search: async () => broken, dispose: () => originalEngine.dispose() };
      let applied = 0;
      f.v.workspace.applyEdit = async () => { applied++; return true; };
      await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /incomplete.*Rerun Search/);
      assert.equal(applied, 0);
      assert.equal(s.results, saved);
    });
  }
});

test('preflight keeps the old snapshot visible and rejects a late response after a file event', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  const saved = s.results;
  const originalEngine = f.controller.engine;
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.controller.engine = {
    search: () => { entered(); return new Promise(resolve => { release = resolve; }); },
    dispose: () => originalEngine.dispose()
  };
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  const replacing = f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  await waiting;
  assert.equal(s.replacing, true);
  assert.match(s.notice, /Checking the current search scope/);
  assert.equal(s.results, saved);
  f.events.document({ document: f.document, contentChanges: [] });
  release(output(saved));
  await assert.rejects(replacing, /scope changed.*Rerun Search/);
  assert.equal(applied, 0);
  assert.equal(s.results, saved);
});

test('preflight observes the shared scope revision even when no result row changes', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  s.scopeEventRevision = 10;
  const saved = s.results, originalEngine = f.controller.engine;
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.controller.engine = {
    search: () => { entered(); return new Promise(resolve => { release = resolve; }); },
    dispose: () => originalEngine.dispose()
  };
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  const replacing = f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  await waiting;
  s.scopeEventRevision++;
  release(output(saved));
  await assert.rejects(replacing, /scope changed.*Rerun Search/);
  assert.equal(applied, 0);
  assert.equal(s.results, saved);
});

test('preflight detects an in-place result identity change before applying', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  const saved = s.results, originalEngine = f.controller.engine;
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const fresh = saved.map(match => ({ ...match, range: structuredClone(match.range) }));
  f.controller.engine = {
    search: () => { entered(); return new Promise(resolve => { release = resolve; }); },
    dispose: () => originalEngine.dispose()
  };
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  const replacing = f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  await waiting;
  s.results[0].identityUnknown = true;
  release(output(fresh));
  await assert.rejects(replacing, /(?:older search snapshot|results changed).*Rerun Search/);
  assert.equal(applied, 0);
});

test('preflight request acquisition obeys the deadline and preserves results', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  f.controller.configuration = () => ({ get: (key, fallback) => key === 'replace.prepareTimeoutMs' ? 150 : fallback });
  const saved = s.results;
  f.v.workspace.openTextDocument = () => new Promise(() => {});
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }),
    /timed out.*No edit was submitted.*replace\.prepareTimeoutMs/);
  assert.equal(applied, 0);
  assert.equal(s.results, saved);
});

test('late document opens after preflight timeout or disposal never reach applyEdit', async t => {
  for (const reason of ['timeout', 'dispose']) {
    await t.test(reason, async t => {
      const f = fixture(t), s = f.session('cat', {}, 'replace');
      await f.controller.search(s);
      f.controller.configuration = () => ({ get: (key, fallback) => key === 'replace.prepareTimeoutMs' ? 150 : fallback });
      let entered, release, applied = 0;
      const waiting = new Promise(resolve => { entered = resolve; });
      f.v.workspace.openTextDocument = () => { entered(); return new Promise(resolve => { release = resolve; }); };
      f.v.workspace.applyEdit = async () => { applied++; return true; };
      const replacing = f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
      await waiting;
      if (reason === 'dispose') f.controller.dispose();
      await assert.rejects(replacing, reason === 'dispose' ? /Extension stopped/ : /timed out/);
      assert.equal(s.replacing, false);
      release(f.document);
      await pause();
      assert.equal(applied, 0, 'a late successful open must not resume the replacement');
    });
  }
});

test('repeated timed-out document opens remain pending until resolved, without late edits', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  f.controller.configuration = () => ({ get: (key, fallback) => key === 'replace.prepareTimeoutMs' ? 100 : fallback });
  const pending = new Set();
  let applied = 0;
  f.v.workspace.openTextDocument = () => new Promise(resolve => {
    const entry = { finish() { pending.delete(entry); resolve(f.document); } };
    pending.add(entry);
  });
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  for (let attempt = 0; attempt < 3; attempt++) {
    await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /timed out/);
    assert.equal(s.replacing, false);
    assert.equal(pending.size, attempt + 1, 'timeout stops waiting, not the underlying call');
  }
  assert.equal(applied, 0);
  for (const entry of [...pending]) entry.finish();
  await pause();
  assert.equal(pending.size, 0);
  assert.equal(applied, 0, 'late resolution never resumes any abandoned replacement');
  f.v.workspace.openTextDocument = async () => f.document;
  await f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  assert.equal(applied, 1, 'a later independent operation can complete');
});

test('abort after WorkspaceEdit dispatch retains the lock until the actual outcome', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  let entered, release, applied = 0;
  const submitted = new Promise(resolve => { entered = resolve; });
  f.v.workspace.applyEdit = () => { applied++; entered(); return new Promise(resolve => { release = resolve; }); };
  const replacing = f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  await submitted;
  s.replacementAbort.abort(new Error('Cancellation after dispatch'));
  await pause();
  assert.equal(s.replacing, true);
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /Wait for the current search/);
  assert.equal(applied, 1);
  release(true);
  await replacing;
  assert.equal(s.replacing, false);
  assert.match(s.feedback, /Replaced/);
});

test('single Replace uses its preparation budget, not a shorter search deadline', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  f.controller.configuration = () => ({ get(key, fallback) {
    return key === 'search.timeoutMs' ? 100 : key === 'replace.prepareTimeoutMs' ? 1000 : fallback;
  } });
  f.v.workspace.openTextDocument = async () => { await new Promise(resolve => setTimeout(resolve, 160)); return f.document; };
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  await f.controller.replace(s, false, { id: s.results[0].id, generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  assert.equal(applied, 1);
});

test('untitled Open Editors matches retain provenance for Replace All', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  f.document.uri = uriFor('untitled:Untitled-1');
  f.document.fileName = 'Untitled-1';
  f.document.isDirty = true;
  f.v.window.tabGroups.all[0].tabs = [{ input: new f.v.TabInputText(f.document.uri) }];
  await f.controller.search(s);
  assert.ok(s.results.length);
  assert.ok(s.results.every(match => match.uri === 'untitled:Untitled-1' &&
    match.source === 'snapshot' && match.documentVersion === f.document.version));
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  await f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  assert.equal(applied, 1);
});

test('Replace All pauses preparation accounting while the independent worker searches', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  f.controller.configuration = () => ({ get(key, fallback) {
    return key === 'search.timeoutMs' ? 1000 : key === 'replace.prepareTimeoutMs' ? 150 : fallback;
  } });
  const original = f.controller.engine;
  let searches = 0, applied = 0;
  f.controller.engine = {
    async search() {
      if (++searches > 1) await new Promise(resolve => setTimeout(resolve, 300));
      return output(f.matches());
    },
    dispose: () => original.dispose()
  };
  await f.controller.search(s);
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  await f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  assert.equal(applied, 1, 'worker time is not charged against the shorter preparation budget');
});

test('Replace All bounds a nonresponsive worker by search.timeoutMs and discards its late result', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  f.controller.configuration = () => ({ get(key, fallback) {
    return key === 'search.timeoutMs' ? 100 : key === 'replace.prepareTimeoutMs' ? 1000 : fallback;
  } });
  const original = f.controller.engine;
  let searches = 0, release, entered, applied = 0;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.controller.engine = {
    search() {
      if (++searches === 1) return Promise.resolve(output(f.matches()));
      entered();
      return new Promise(resolve => { release = resolve; });
    },
    dispose: () => original.dispose()
  };
  await f.controller.search(s);
  const shown = s.results;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  const replacing = f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  await waiting;
  await assert.rejects(replacing, /scope search timed out.*No edit was submitted/);
  release(output(f.matches()));
  await pause();
  assert.equal(applied, 0);
  assert.equal(s.results, shown);
});

test('preflight rejects Open Editors membership changes without replacing the old list', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  const saved = s.results;
  f.v.window.tabGroups.all[0].tabs = [];
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /scope or filters changed.*Rerun Search/);
  assert.equal(s.results, saved);
  assert.equal(f.document.text, 'cat! cat!');
});

test('preflight rejects an open document encoding change without a version event', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  f.document.encoding = 'utf8';
  await f.controller.search(s);
  const shown = s.results;
  let opens = 0, applied = 0;
  f.v.workspace.openTextDocument = async () => {
    if (++opens === 2) f.document.encoding = 'utf16le';
    return f.document;
  };
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }),
    /open documents changed.*Rerun Search/);
  assert.equal(applied, 0);
  assert.equal(s.results, shown);
});

test('gear edits an isolated draft; Escape leaves the originating Find snapshot unchanged', async t => {
  const f = fixture(t), s = f.session('cat', { maskEnabled: true, mask: '*.js' });
  f.controller.schedule = () => {};
  const originalResults = s.results;
  await f.controller.message(s, { type: 'editSearch' });
  const draft = f.controller.sessions.get(f.controller.currentId);
  assert.equal(draft.targetWindowId, s.id);
  assert.equal(draft.query, s.query);
  assert.deepEqual(draft.options, s.options);
  assert.notEqual(draft.options, s.options);
  draft.query = 'cancelled';
  draft.options.mask = '*.bl';
  [...draft.panels][0].dispose();
  assert.equal(f.controller.currentId, s.id);
  assert.equal(f.controller.sessions.has(draft.id), false, 'cancelled drafts must release their results');
  assert.equal(s.draftId, undefined);
  assert.equal(s.query, 'cat');
  assert.equal(s.options.mask, '*.js');
  assert.equal(s.results, originalResults);
  await f.controller.message(s, { type: 'editSearch' });
  assert.equal(f.controller.sessions.get(f.controller.currentId).query, 'cat');
});

test('confirming the gear draft updates the same Find tab, including replacement and scope', async t => {
  const f = fixture(t), s = f.session();
  f.controller.schedule = () => {};
  const activeId = s.id;
  await f.controller.message(s, { type: 'editSearch' });
  const draft = f.controller.sessions.get(f.controller.currentId);
  Object.assign(draft, { query: 'cat!', mode: 'replace', replacement: 'dog',
    scope: { kind: 'custom', name: 'Sources' }, results: f.matches('cat!'),
    diagnostics: 'draft excluded archive' });
  await f.controller.message(draft, { type: 'openTab' });
  assert.equal(f.controller.currentId, s.id);
  assert.equal(s.query, 'cat!');
  assert.equal(s.mode, 'replace');
  assert.equal(s.replacement, 'dog');
  assert.deepEqual(s.scope, { kind: 'custom', name: 'Sources' });
  assert.equal(s.panels.size, 0);
  assert.equal(f.controller.findTree.activeId, activeId);
  assert.equal(draft.panels.size, 0);
  assert.equal(f.commands.filter(command => command[0] === 'vscode.openWith').length, 0);
  assert.equal(f.controller.findTree.state.query, 'cat!');
  assert.equal(f.controller.findTree.state.mode, 'replace');
  assert.equal(s.diagnostics, 'draft excluded archive');
  assert.equal(f.controller.findTree.state.diagnostics, 'draft excluded archive');
});

test('New Tab from a gear draft creates an independent Find snapshot', async t => {
  const f = fixture(t), s = f.session();
  f.controller.schedule = () => {};
  await f.controller.message(s, { type: 'editSearch' });
  const draft = f.controller.sessions.get(f.controller.currentId);
  draft.query = 'cat!';
  draft.results = f.matches('cat!');
  await f.controller.message(draft, { type: 'newTab' });
  const next = f.controller.sessions.get(f.controller.currentId);
  assert.notEqual(next.id, s.id);
  assert.equal(next.layout, 'findWindow');
  assert.equal(next.query, 'cat!');
  assert.equal(s.query, 'cat');
  next.options.mask = '*.bl';
  assert.equal(s.options.mask, '');
  assert.notEqual(next.results, s.results);
  assert.equal(s.panels.size, 0);
  assert.equal(next.panels.size, 0);
  assert.equal(f.controller.findTree.sessions.size, 2);
});

test('Find preview updates do not reopen the editor or move its caret after editing or changing theme', async t => {
  const f = fixture(t), s = f.session();
  await f.controller.message(s, { type: 'select', id: s.results[0].id, generation: s.generation, resultRevision: s.results[0].resultRevision || 0 });
  const shown = f.previews.filter(item => item[0] === 'show').length;
  f.change([{ rangeOffset: 0, rangeLength: 0, text: '\n' }]);
  f.events.theme();
  await f.validate(s);
  assert.equal(f.previews.filter(item => item[0] === 'show').length, shown);
  assert.ok(f.previews.some(item => item[0] === 'update'));
  await f.controller.message(s, { type: 'openResult', id: s.results[0].id });
  assert.equal(f.previews.filter(item => item[0] === 'show').at(-1).at(-1).preserveFocus, false);
});

test('closed Find tabs reject their pending validation without changing the retained rows', async t => {
  let finish;
  const f = fixture(t, { search: () => new Promise(resolve => { finish = resolve; }), dispose() {} });
  const s = f.session();
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'x' }]);
  const checking = f.validate(s);
  await pause();
  f.controller.closeFindSearch(s);
  const rows = s.results;
  finish(output([]));
  await checking;
  assert.equal(s.results, rows);
  assert.equal(s.validations.size, 0);
  assert.equal(f.controller.sessions.has(s.id), false);
});

test('closing the last Find panel releases the snapshot and never checks later file edits', async t => {
  let searches = 0;
  const f = fixture(t, { search: async () => { searches++; return output([]); }, dispose() {} });
  const s = f.session();
  f.controller.closeFindSearch(s);
  const rows = s.results;
  assert.equal(f.controller.sessions.has(s.id), false);
  assert.equal(f.controller.currentId, null);
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'x' }]);
  f.events.fileChange(sourceUri);
  f.controller.queueValidation(s, sourceUri.toString(), 0);
  await pause();
  assert.equal(searches, 0);
  assert.equal(s.results, rows);
  assert.equal(s.validations?.size || 0, 0);
});

test('completing a background Find never takes the shared source preview from the active search', async t => {
  const f = fixture(t, { search: async (_request, { onBatch }) => {
    const matches = f.matches();
    onBatch(matches);
    return output(matches);
  }, dispose() {} });
  const background = f.session(), active = f.session();
  background.results = [];
  background.selectedId = null;
  f.controller.currentId = active.id;
  f.controller.previewSessionId = active.id;
  await f.controller.search(background);
  assert.equal(background.results.length, 2);
  assert.equal(f.controller.previewSessionId, active.id);
  assert.equal(f.previews.filter(item => item[0] === 'show').length, 0);
  await f.controller.message(background, { type: 'select', id: background.selectedId, generation: background.generation, resultRevision: background.results[0].resultRevision || 0 });
  assert.equal(f.controller.currentId, background.id);
  assert.equal(f.controller.previewSessionId, background.id, 'explicit selection may take ownership');
});

test('legacy Find editor resources migrate to the native panel without opening a source', async t => {
  const f = fixture(t);
  const resource = uriFor('jbsearch:/legacy.jbsearch?view=findWindow');
  const document = f.controller.openCustomDocument(resource);
  let closed = false;
  await f.controller.resolveCustomEditor(document, { dispose() { closed = true; } });
  assert.equal(closed, true);
  assert.equal(document.session.layout, 'findWindow');
  assert.equal(f.controller.findTree.activeId, document.session.id);
  assert.equal(document.session.query, '', 'queries are not persisted on disk');
  assert.equal(f.previews.filter(item => item[0] === 'show').length, 0);
});

test('transfer disposes the modal, retains its snapshot and does not open or split an editor', async t => {
  const f = fixture(t), s = f.controller.create();
  s.query = 'cat';
  s.results = f.matches();
  s.diagnostics = 'excluded archive in original search';
  s.selectedId = s.results[0].id;
  const source = f.panel(s, undefined);
  await f.controller.openFindWindow(s, false);
  assert.equal(f.controller.sessions.get(s.id), s);
  assert.equal(s.query, 'cat');
  assert.equal(s.results.length, 2);
  assert.equal(s.panels.size, 0);
  assert.equal(f.controller.findTree.activeId, s.id);
  assert.equal(f.controller.findTree.state.diagnostics, s.diagnostics);
  assert.equal(f.events.focus, 'results', 'modal disposal must not steal the final tree focus');
  assert.equal(f.previews.filter(item => item[0] === 'show').length, 0);
  assert.equal(f.commands.filter(command => command[0] === 'vscode.openWith' || command[0].includes('newGroup')).length, 0);
});

test('a failed transfer keeps the modal usable and does not leak an independent Find session', async t => {
  const f = fixture(t), s = f.controller.create();
  const source = f.panel(s, undefined);
  const uri = s.uri;
  const execute = f.v.commands.executeCommand;
  f.v.commands.executeCommand = async (...args) => {
    if (args[0] === 'jbsearch.results.focus') throw new Error('Open failed');
    return execute(...args);
  };
  await assert.rejects(() => f.controller.openFindWindow(s, false), /Open failed/);
  assert.equal(s.layout, 'modal');
  assert.equal(s.uri, uri);
  assert.deepEqual([...s.panels], [source]);
  const sessions = f.controller.sessions.size;
  await assert.rejects(() => f.controller.openFindWindow(s, true), /Open failed/);
  assert.equal(f.controller.sessions.size, sessions);
  assert.equal(f.controller.currentId, s.id);
  assert.equal(s.transferring, undefined);
});

test('rollback resumes pending validation of the saved search being edited', async t => {
  const f = fixture(t), target = f.session('cat', {}, 'replace');
  target.diagnostics = 'original archive details';
  f.change([{ rangeOffset: 0, rangeLength: 1, text: 'b' }]);
  await f.controller.message(target, { type: 'editSearch' });
  const draft = f.controller.sessions.get(f.controller.currentId);
  draft.diagnostics = 'new draft archive details';
  const execute = f.v.commands.executeCommand;
  f.v.commands.executeCommand = async (...args) => {
    if (args[0] === 'jbsearch.results.focus') throw new Error('Open failed');
    return execute(...args);
  };
  await assert.rejects(() => f.controller.openFindWindow(draft, false), /Open failed/);
  assert.ok(target.results.every(result => result.pending));
  assert.equal(target.diagnostics, 'original archive details');
  assert.equal(draft.diagnostics, 'new draft archive details');
  assert.equal(target.validations.size, 1, 'rollback must resume the cancelled checks');
  await f.validate(target);
  assert.deepEqual(target.results.map(result => Boolean(result.invalid)), [true, false]);
  assert.ok(target.results.every(result => !result.pending));
});

test('a last-panel close during reveal cancels transfer without resurrecting its closed draft', async t => {
  const f = fixture(t), target = f.session();
  await f.controller.message(target, { type: 'editSearch' });
  const draft = f.controller.sessions.get(f.controller.currentId);
  draft.results = f.matches();
  const execute = f.v.commands.executeCommand;
  f.v.commands.executeCommand = async (...args) => {
    if (args[0] === 'jbsearch.results.focus')
      for (const panel of [...draft.panels]) panel.dispose();
    return execute(...args);
  };
  await assert.rejects(() => f.controller.openFindWindow(draft, false), /changed or was closed/);
  assert.equal(f.controller.sessions.has(draft.id), false);
  assert.equal(draft.panels.size, 0, 'a closed owner cannot be recreated by rollback');
  assert.equal(f.controller.findTree.sessions.has(draft.id), false);
  assert.equal(f.controller.findTree.activeId, target.id);
  assert.equal(target.query, 'cat');
});

test('native selection opens a central source only on user action, including occurrence navigation', async t => {
  const f = fixture(t), s = f.session();
  await f.controller.findTree.show(s.id);
  assert.equal(f.previews.filter(item => item[0] === 'show').length, 0);
  await f.nativeCommands.get('jbsearch.results.select')(f.controller.findTree.sessions.get(s.id).tree.byResultId.get(s.results[0].id).action);
  let call = f.previews.filter(item => item[0] === 'show').at(-1);
  assert.equal(call[1].id, s.results[0].id);
  assert.equal(call.at(-1).preserveFocus, true);
  await f.nativeCommands.get('jbsearch.results.next')();
  assert.equal(s.selectedId, s.results[1].id);
  await f.nativeCommands.get('jbsearch.results.openResult')();
  call = f.previews.filter(item => item[0] === 'show').at(-1);
  assert.equal(call[1].id, s.results[1].id);
  assert.equal(call.at(-1).preserveFocus, false);
});

test('hiding native Find keeps validation alive; Close Search releases only the chosen snapshot', async t => {
  const f = fixture(t), first = f.session(), second = f.session('cat!');
  f.controller.findTree.view.visible = false;
  f.change([{ rangeOffset: 0, rangeLength: 1, text: 'b' }]);
  await f.validate(first);
  await f.validate(second);
  assert.ok(first.results[0].invalid);
  assert.equal(f.controller.sessions.has(first.id), true);
  await f.controller.findTree.selectSession(first.id);
  await f.nativeCommands.get('jbsearch.results.closeSearch')();
  assert.equal(f.controller.sessions.has(first.id), false);
  assert.equal(f.controller.sessions.has(second.id), true);
  assert.equal(f.controller.findTree.activeId, second.id);
  assert.equal(f.controller.currentId, second.id);
});

test('switching saved searches clears stale source highlights without moving an editor', async t => {
  const f = fixture(t), first = f.session(), second = f.session('cat!');
  await f.controller.findTree.selectSession(first.id);
  await f.controller.findTree.select(first.id, first.selectedId);
  const shown = f.previews.filter(item => item[0] === 'show').length;
  await f.controller.findTree.selectSession(second.id);
  assert.equal(f.controller.currentId, second.id);
  assert.equal(f.controller.previewSessionId, undefined);
  assert.equal(f.previews.at(-1)[0], 'clear');
  assert.equal(f.previews.filter(item => item[0] === 'show').length, shown);
});

test('toolbar commands target the active search while native selection still references the previous search', async t => {
  const f = fixture(t), first = f.session(), second = f.session('cat!');
  await f.controller.findTree.selectSession(first.id);
  f.controller.findTree.view.selection = [f.controller.findTree.sessions.get(first.id).tree.byResultId.get(first.selectedId)];
  await f.controller.findTree.selectSession(second.id);
  await f.nativeCommands.get('jbsearch.results.openResult')();
  assert.equal(f.previews.filter(item => item[0] === 'show').length, 0, 'stale native selection must not reopen the previous search');
  await f.nativeCommands.get('jbsearch.results.closeSearch')();
  assert.equal(f.controller.sessions.has(first.id), true);
  assert.equal(f.controller.sessions.has(second.id), false);
  assert.equal(f.controller.findTree.activeId, first.id);
});

test('rooted snapshot identity follows transferred results and survives a failed draft transfer', async t => {
  const f = fixture(t), target = f.session('cat', {}, 'replace');
  const binding = { scopeName: 'API', rootName: 'API Alias', uri: 'file:///workspace/api' };
  const prior = { scopeName: 'Web', rootName: 'Web', uri: 'file:///workspace/web' };
  target.scope = { kind: 'custom', name: 'Web' };
  target.namedScopeBinding = prior;
  f.controller.schedule = () => {};
  await f.controller.message(target, { type: 'editSearch' });
  let draft = f.controller.sessions.get(f.controller.currentId);
  draft.scope = { kind: 'custom', name: 'API' };
  draft.namedScopeBinding = binding;
  draft.results = f.matches();
  const show = f.controller.findTree.show;
  f.controller.findTree.show = async () => { throw new Error('show failed'); };
  await assert.rejects(() => f.controller.openFindWindow(draft, false), /show failed/);
  assert.deepEqual(target.namedScopeBinding, prior, 'rollback restores the old results binding');
  f.controller.findTree.show = show;
  await f.controller.openFindWindow(draft, false);
  assert.deepEqual(target.namedScopeBinding, binding);
  assert.notEqual(target.namedScopeBinding, binding, 'transferred identity is independent');
  assert.deepEqual(target.scope, { kind: 'custom', name: 'API' });
  await f.controller.message(target, { type: 'editSearch' });
  draft = f.controller.sessions.get(f.controller.currentId);
  draft.scope = { kind: 'custom', name: 'API' };
  draft.namedScopeBinding = binding;
  draft.results = f.matches();
  await f.controller.openFindWindow(draft, true);
  const independent = f.controller.sessions.get(f.controller.currentId);
  assert.deepEqual(independent.namedScopeBinding, binding);
  assert.notEqual(independent.namedScopeBinding, target.namedScopeBinding);
  assert.deepEqual(target.namedScopeBinding, binding);
});

test('rooted configuration and workspace events retain snapshots and mark initial enumeration partial', async t => {
  const f = fixture(t);
  const s = f.session();
  s.scope = { kind: 'custom', name: 'API' };
  const savedRows = s.results;
  f.events.configuration({ affectsConfiguration: section => section === 'jbsearch.scopes' });
  f.events.folders({ added: [], removed: [] });
  assert.equal(s.results, savedRows, 'completed snapshots remain frozen');
  assert.equal(s.timer, undefined);
  for (const trigger of [
    () => f.events.configuration({ affectsConfiguration: section => section === 'jbsearch.scopes' }),
    () => f.events.folders({ added: [], removed: [] })
  ]) {
    let finish, batch;
    f.controller.request = async () => ({ query: s.query,
      namedScopeBinding: { scopeName: 'API', rootName: 'API', uri: 'file:///workspace/api' } });
    f.controller.engine = { search: (_request, callbacks) => {
      batch = callbacks.onBatch;
      return new Promise(resolve => { finish = resolve; });
    }, dispose() {} };
    s.searching = true;
    s.results = [];
    const searching = f.controller.search(s);
    await pause();
    const oldGeneration = s.generation;
    trigger();
    clearTimeout(s.timer);
    assert.equal(s.generation, oldGeneration, 'ordinary scope events do not rerun');
    const stale = f.matches();
    batch(stale);
    finish(output(stale));
    await searching;
    assert.deepEqual(s.results.map(result => result.id), stale.map(result => result.id));
    assert.equal(s.partial, true, 'initial scope race is not a complete current scope proof');
  }
});

test('a missing native binding opens a real frozen review without searching or applying', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  s.replacement = 'dog';
  await f.controller.search(s);
  const sourceRows = s.results, binding = f.controller.snapshot(s).actionBinding;
  let applied = 0, searched = 0;
  const search = f.controller.engine.search.bind(f.controller.engine);
  f.controller.engine.search = (...args) => { searched++; return search(...args); };
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  assert.equal(await f.nativeCommands.get('jbsearch.results.replaceAll')(), true);
  const review = f.controller.sessions.get(s.reviewId);
  assert.ok(review?.reviewOnly);
  assert.equal(searched, 0);
  assert.equal(applied, 0);
  assert.equal(s.results, sourceRows);
  assert.equal(f.controller.snapshot(review).actionBinding, binding);
  assert.notEqual(review.id, s.id);
  assert.equal(review.targetWindowId, undefined, 'not Edit Search draft');
  await f.controller.message(review, { type: 'update', patch: { query: 'new', replacement: 'bad' } });
  await f.controller.message(review, { type: 'refresh' });
  await f.controller.select(review, review.results[0].id);
  assert.equal(review.query, 'cat');
  assert.equal(review.replacement, 'dog');
  assert.equal(searched, 0, 'review cannot launch discovery or query revalidation');
  assert.equal(f.previews.length, 0, 'frozen review does not render live editor text');
  await f.controller.message(review, { type: 'replaceAll', generation: review.generation, actionBinding: binding });
  assert.equal(searched, 1, 'only explicit approval runs full preflight');
  assert.equal(applied, 1);
  assert.equal(f.controller.sessions.has(review.id), false);
});

test('stale modal action after reset and changed replacement template dispatch no edit and no review', async t => {
  for (const change of ['reset', 'template']) await t.test(change, async t => {
    const f = fixture(t), s = f.session('cat', {}, 'replace');
    await f.controller.search(s);
    const old = f.controller.snapshot(s).actionBinding, generation = s.generation;
    if (change === 'reset') f.controller.resetSearch(s);
    else { s.replacement = 'changed'; f.controller.notify(s); }
    let applied = 0;
    f.v.workspace.applyEdit = async () => { applied++; return true; };
    await assert.rejects(() => f.controller.replace(s, true, { generation, actionBinding: old }),
      /Wait for the current search|older search snapshot/);
    assert.equal(applied, 0);
    assert.equal(s.reviewId, undefined);
  });
});

test('a frozen review cannot adopt source changes, resets or a newer review token', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  await f.controller.replace(s, true, { generation: s.generation });
  const old = f.controller.sessions.get(s.reviewId), oldBinding = old.reviewApproval.binding;
  s.replacement = 'changed'; f.controller.notify(s);
  const current = f.controller.snapshot(s).actionBinding;
  assert.equal(old.replacement, '');
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  await assert.rejects(() => f.controller.message(old, { type: 'replaceAll', actionBinding: oldBinding }), /older search snapshot/);
  await assert.rejects(() => f.controller.message(old, { type: 'replaceAll', actionBinding: current }), /reviewed replacement snapshot changed/);
  await f.controller.replace(s, true, { generation: s.generation });
  assert.equal(f.controller.sessions.has(old.id), false, 'only one retained review per source');
  assert.equal(applied, 0);
  f.controller.closeFindSearch(s);
  assert.equal([...f.controller.sessions.values()].filter(session => session.reviewOnly).length, 0);
});

test('closing a frozen review cancels preparation without freeing physical open capacity early', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  await f.controller.replace(s, true, { generation: s.generation });
  const review = f.controller.sessions.get(s.reviewId);
  let release, entered, applied = 0;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.v.workspace.openTextDocument = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  const replacing = f.controller.message(review, { type: 'replaceAll', actionBinding: review.reviewApproval.binding });
  await waiting;
  for (const panel of [...review.panels]) panel.dispose();
  await assert.rejects(replacing, /review was closed/);
  assert.equal(applied, 0);
  assert.equal(f.controller.documentOpenGate.active, 1);
  release(f.document); await pause();
  assert.equal(f.controller.documentOpenGate.active, 0);
  assert.equal(applied, 0);
});

test('Single valid A remains usable with INVALID/pending B and partial snapshots while All is blocked', async t => {
  for (const state of ['invalid', 'pending', 'partial']) await t.test(state, async t => {
    const f = fixture(t), s = f.session('cat', {}, 'replace');
    await f.controller.search(s);
    if (state === 'partial') s.partial = true;
    else s.results[1] = { ...s.results[1], uri: 'file:///workspace/other.js', [state]: true };
    const binding = f.controller.snapshot(s).actionBinding;
    let applied = 0;
    f.v.workspace.applyEdit = async () => { applied++; return true; };
    await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: binding }), /complete results|INVALID/);
    assert.equal(applied, 0);
    await f.controller.replace(s, false, { id: s.results[0].id, generation: s.generation, actionBinding: binding });
    assert.equal(applied, 1);
  });
});

test('scopeStale before action is decided by full equality; zero-content events during preflight stop dispatch', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  const binding = f.controller.snapshot(s).actionBinding;
  f.events.document({ document: f.document, contentChanges: [] });
  assert.equal(s.scopeStale, true);
  assert.equal(f.controller.snapshot(s).actionBinding, binding);
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  await f.controller.replace(s, true, { generation: s.generation, actionBinding: binding });
  assert.equal(applied, 1, 'unchanged complete scope does not require a pointless rerun');
  await f.validate(s);
  const original = f.controller.engine.search.bind(f.controller.engine);
  f.controller.engine.search = async (...args) => {
    const out = await original(...args);
    f.events.document({ document: f.document, contentChanges: [] });
    return out;
  };
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /scope changed|older search snapshot/);
  assert.equal(applied, 1);
});

test('preflight compares every approved occurrence, not just a selected or visible subset', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  const approved = f.controller.snapshot(s).actionBinding, saved = s.results;
  const original = f.controller.engine;
  f.controller.engine = { search: async () => output(saved.slice(0, 1)), dispose: () => original.dispose() };
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: approved }), /results changed/);
  assert.equal(applied, 0);
  assert.equal(s.results, saved);
});

test('events immediately before dispatch prevent an edit; events after dispatch do not unlock it', async t => {
  for (const when of ['before', 'after']) await t.test(when, async t => {
    const f = fixture(t), s = f.session('cat', {}, 'replace');
    await f.controller.search(s);
    let applied = 0, release, entered;
    const dispatch = new Promise(resolve => { entered = resolve; });
    if (when === 'before') {
      f.v.WorkspaceEdit = class {
        replace() { f.events.document({ document: f.document, contentChanges: [] }); }
      };
      f.v.workspace.applyEdit = async () => { applied++; return true; };
      await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /scope changed/);
      assert.equal(applied, 0);
    } else {
      f.v.workspace.applyEdit = () => {
        applied++; entered(); return new Promise(resolve => { release = resolve; });
      };
      const replacing = f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
      await dispatch;
      f.events.document({ document: f.document, contentChanges: [] });
      assert.equal(s.replacing, true);
      await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /Wait for the current search/);
      release(false);
      await assert.rejects(replacing, /No success was assumed/);
      assert.equal(applied, 1, 'a dispatched operation is not reported as zero dispatched edits');
      assert.equal(s.replacing, false);
    }
  });
});

test('repeated timed-out preparations keep a hard physical-open cap across independent attempts', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  f.controller.configuration = () => ({ get: (key, fallback) => key === 'replace.prepareTimeoutMs' ? 100 : fallback });
  const releases = [];
  let started = 0, applied = 0;
  f.v.workspace.openTextDocument = () => { started++; return new Promise(resolve => releases.push(resolve)); };
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  for (let attempt = 0; attempt < 7; attempt++) {
    await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding }), /timed out/);
    assert.ok(f.controller.documentOpenGate.active <= 4);
    assert.equal(f.controller.documentOpenGate.waiting, 0, 'timed-out queued callers are removed');
  }
  assert.equal(started, 4, 'a timeout cannot release the unresolved physical request');
  for (const release of releases) release(f.document);
  await pause();
  assert.equal(applied, 0);
  assert.equal(f.controller.documentOpenGate.active, 0);
});

test('native expired context arguments never fall back to the current selection or action token', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace'), messages = [];
  f.controller.findTree.onAction = (sessionId, message) => messages.push({ sessionId, ...message });
  const original = f.controller.findTree.sessions.get(s.id).tree.byResultId.get(s.results[0].id);
  f.controller.findTree.view.selection = [original];
  s.results = s.results.map((row, index) => index ? row : {
    ...row, resultRevision: 1,
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } }
  });
  f.controller.notify(s);
  for (const type of ['replace', 'replaceAll', 'openResult']) {
    assert.equal(await f.nativeCommands.get(`jbsearch.results.${type}`)(original), false);
    assert.equal(await f.nativeCommands.get(`jbsearch.results.${type}`)(undefined), false);
  }
  assert.equal(await f.nativeCommands.get('jbsearch.results.select')(original.action), false);
  assert.equal(await f.nativeCommands.get('jbsearch.results.openResult')(), false,
    'keyboard activation also rejects a stale native selection object');
  assert.deepEqual(messages, []);
  assert.equal(f.previews.filter(item => item[0] === 'show').length, 0);
  assert.equal(await f.nativeCommands.get('jbsearch.results.replace')(), true);
  assert.equal(messages.at(-1).type, 'replace');
  assert.equal(Object.hasOwn(messages.at(-1), 'actionBinding'), false,
    'an unbound toolbar replacement delegates to the backend frozen-review protocol');
});

test('explicit native Single and All commands forward only the immutable row binding; toolbar All remains unbound', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace'), messages = [];
  const actionBinding = { sessionId: s.id, generation: s.generation,
    requestFingerprint: 'request', resultRevision: 1, scopeEventRevision: 0,
    snapshotToken: 'full-snapshot' };
  f.controller.findTree.onAction = (sessionId, message) => messages.push({ sessionId, ...message });
  f.controller.findTree.update({ ...f.controller.snapshot(s), actionBinding });
  const node = f.controller.findTree.sessions.get(s.id).tree.byResultId.get(s.results[0].id);
  for (const type of ['replace', 'replaceAll']) {
    assert.equal(await f.nativeCommands.get(`jbsearch.results.${type}`)(node), true);
    assert.equal(messages.at(-1).actionBinding, node.action.actionBinding);
    assert.equal(messages.at(-1).type, type);
  }
  assert.equal(await f.nativeCommands.get('jbsearch.results.replaceAll')(), true);
  assert.equal(Object.hasOwn(messages.at(-1), 'actionBinding'), false);
  assert.equal(await f.nativeCommands.get('jbsearch.results.replaceAll')(undefined), false,
    'expired context All must not downgrade into an unbound toolbar review');
  assert.equal(messages.length, 3);
});


test('actual bound native context Replace All reaches preflight without opening a review', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  s.replacement = 'dog';
  await f.controller.search(s);
  const node = f.controller.findTree.sessions.get(s.id).tree.byResultId.get(s.results[0].id);
  let applied = 0;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  assert.equal(await f.nativeCommands.get('jbsearch.results.replaceAll')(node), true);
  assert.equal(applied, 1);
  assert.equal(s.reviewId, undefined, 'reliably bound normal path adds no confirmation');
});

test('delayed native commands cannot borrow a newer replacement plan or revived saved-search handle', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  const entry = f.controller.findTree.sessions.get(s.id), node = entry.tree.byResultId.get(s.results[0].id);
  const old = node.action.actionBinding;
  let applied = 0, release, enter;
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  const entered = new Promise(resolve => { enter = resolve; });
  const select = f.controller.findTree.selectSession.bind(f.controller.findTree);
  f.controller.findTree.selectSession = async (...args) => { enter(); await new Promise(resolve => { release = resolve; }); return select(...args); };
  const delayed = f.nativeCommands.get('jbsearch.results.replaceAll')(node);
  await entered;
  s.replacement = 'new plan'; f.controller.notify(s);
  release();
  assert.equal(await delayed, false);
  f.controller.findTree.selectSession = select;
  const newNode = f.controller.findTree.sessions.get(s.id).tree.byResultId.get(s.results[0].id);
  assert.notEqual(newNode.nativeId, node.nativeId, 'native handle, not only object, is revision-bound');
  assert.equal(await f.nativeCommands.get('jbsearch.results.replace')(node), false);
  assert.equal(await f.nativeCommands.get('jbsearch.results.select')(node.action), false);
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation, actionBinding: old }), /older search snapshot/);
  const other = f.session('cat!');
  await f.controller.findTree.selectSession(s.id);
  assert.equal(await f.nativeCommands.get('jbsearch.results.replaceAll')(newNode), false, 'saved-search ABA renews native handles');
  assert.equal(applied, 0);
  assert.equal(s.reviewId, undefined);
  assert.notEqual(other.id, s.id);
});

test('modal-to-native ownership transfer and a new saved copy cannot reuse the modal approval', async t => {
  for (const newTab of [false, true]) await t.test(String(newTab), async t => {
    const f = fixture(t), s = f.session('cat', {}, 'replace');
    s.layout = 'modal'; f.panel(s);
    await f.controller.search(s);
    const old = f.controller.snapshot(s).actionBinding;
    const target = await f.controller.transferFindWindow(s, newTab);
    const current = f.controller.snapshot(target).actionBinding;
    assert.notEqual(current.snapshotToken, old.snapshotToken);
    assert.equal(current.sessionId, target.id);
    let applied = 0;
    f.v.workspace.applyEdit = async () => { applied++; return true; };
    await assert.rejects(() => f.controller.replace(target, true, {
      generation: target.generation, actionBinding: old
    }), /older search snapshot/);
    assert.equal(applied, 0);
  });
});

test('source close while a frozen review is opening cannot create a searching fallback draft', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  await f.controller.search(s);
  let enter, release, reviewUri;
  const entered = new Promise(resolve => { enter = resolve; });
  const execute = f.v.commands.executeCommand;
  f.v.commands.executeCommand = async (...args) => {
    if (args[0] === '_workbench.openWith') {
      reviewUri = args[1]; enter(); await new Promise(resolve => { release = resolve; });
    }
    return execute(...args);
  };
  const opening = f.controller.replace(s, true, { generation: s.generation });
  await entered;
  const reviewId = s.reviewId;
  f.controller.closeFindSearch(s);
  release();
  await assert.rejects(opening, /review was closed before it opened/);
  assert.equal(f.controller.sessions.has(s.id), false);
  assert.equal(f.controller.sessions.has(reviewId), false);
  assert.throws(() => f.controller.openCustomDocument(reviewUri), /review was closed/);
  assert.equal([...f.controller.sessions.values()].filter(item => item.reviewOnly || item.targetWindowId).length, 0);
});

test('document edits while building a snapshot invalidate late batches without restarting the search', async t => {
  let finish, batch;
  const f = fixture(t, { search: (_request, callbacks) => {
    batch = callbacks.onBatch;
    return new Promise(resolve => { finish = resolve; });
  }, dispose() {} });
  const s = f.session();
  s.searching = true;
  s.results = [];
  const running = f.controller.search(s);
  await pause();
  const generation = s.generation;
  const stale = f.matches();
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'new\n' }]);
  batch(stale);
  finish(output(stale));
  await running;
  assert.equal(s.generation, generation);
  assert.equal(s.searching, false);
  assert.equal(s.partial, true);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
});


test('unrelated deletes do not notify a completed Find tree', t => {
  const f = fixture(t), s = f.session();
  const changes = [];
  f.controller.findTree.onDidChangeTreeData(value => changes.push(value));
  const results = s.results, generation = s.generation;
  f.events.fileDelete(uriFor('file:///elsewhere/unused.txt'));
  assert.equal(s.results, results);
  assert.equal(s.generation, generation);
  assert.equal(s.scopeEventRevision, 0);
  assert.deepEqual(changes, []);
});


test('duplicate watcher events do not notify the tree again without a visible state change', t => {
  const f = fixture(t), s = f.session();
  let changes = 0;
  f.controller.findTree.onDidChangeTreeData(() => { changes++; });
  f.document.version++; // External/unobserved history, not an unchanged bound-buffer watcher.
  f.events.fileChange(sourceUri);
  assert.equal(changes, 1);
  assert.ok(s.results.every(result => result.pending && result.invalid && result.identityUnknown && !result.unavailable));
  f.events.fileChange(sourceUri);
  assert.equal(changes, 1);
  assert.equal(s.scopeEventRevision, 2, 'duplicates still invalidate a concurrent replacement token');
  f.events.fileDelete(sourceUri);
  assert.equal(changes, 2);
  f.events.fileDelete(sourceUri);
  assert.equal(changes, 2);
});


test('modal source events retain the snapshot, mark affected rows, and never insert new matches', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  s.layout = 'modal';
  f.panel(s);
  const ids = s.results.map(result => result.id), generation = s.generation;
  f.document.version++; // External/unobserved history, not an unchanged bound-buffer watcher.
  f.events.fileChange(sourceUri);
  assert.equal(s.generation, generation);
  assert.equal(s.scopeStale, true);
  assert.ok(s.results.every(result => result.pending && result.identityUnknown));
  await f.validate(s);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
  await assert.rejects(() => f.controller.replace(s, false, { id: ids[0], generation, actionBinding: f.controller.snapshot(s).actionBinding }), /INVALID/);
});


test('a document edit without a continuous prior version never validates old identity by offset alone', async t => {
  for (const missingVersion of [true, false]) {
    const f = fixture(t), s = f.session();
    if (missingVersion) s.results = s.results.map(result => ({ ...result, documentVersion: undefined }));
    else f.document.version++;
    f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
    await f.validate(s);
    assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
  }
});


test('a directory deletion invalidates saved descendants and recreating a file does not restore identity', async t => {
  const f = fixture(t), s = f.session();
  f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
  s.scope = { kind: 'workspace' };
  const ids = s.results.map(result => result.id), generation = s.generation;
  f.events.fileDelete(uriFor('file:///workspace/src'));
  assert.equal(s.generation, generation);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.invalid && result.unavailable));
  f.events.fileCreate(sourceUri);
  await f.validate(s);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
});


test('a workbench folder rename invalidates descendants without adding the new path', t => {
  const f = fixture(t), s = f.session();
  f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
  s.scope = { kind: 'workspace' };
  const ids = s.results.map(result => result.id), generation = s.generation;
  f.events.rename({ files: [{ oldUri: uriFor('file:///workspace/src'), newUri: uriFor('file:///workspace/new') }] });
  assert.equal(s.generation, generation);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.invalid && result.unavailable));
});


test('directory scope ignores outside events but observes ancestor ignore rules', t => {
  const f = fixture(t), s = f.session();
  f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
  s.scope = { kind: 'directory', directory: '/workspace/src' };
  const generation = s.generation;
  f.events.fileChange(uriFor('file:///workspace/other/file.js'));
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
  f.events.fileChange(uriFor('file:///workspace/.gitignore'));
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.scopeStale, true);
  assert.equal(s.generation, generation);
});


test('delivered git info exclude events affect a nested scope despite excludes', t => {
  const f = fixture(t), s = f.session();
  s.scope = { kind: 'directory', directory: '/workspace/src' };
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: { '**/.git': true } }];
  f.events.fileChange(uriFor('file:///workspace/.git/info/exclude'));
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.scopeStale, true);
});


test('document mask and nested-root exclusions use the search root policy', t => {
  const f = fixture(t), s = f.session();
  s.scope = { kind: 'workspace' };
  s.options = { ...s.options, maskEnabled: true, mask: '*.js', respectExcludes: true };
  s.searchRoots = [
    { path: '/workspace', name: 'parent', exclude: {} },
    { path: '/workspace/nested', name: 'child', exclude: { '**/ignored.js': true } }
  ];
  const change = uri => f.events.document({ document: { uri }, contentChanges: [{ text: 'x' }] });
  change(uriFor('file:///workspace/nested/ignored.js'));
  change(uriFor('file:///workspace/nested/readme.md'));
  assert.equal(s.scopeEventRevision, 0);
  change(uriFor('file:///workspace/nested/.gitignore'));
  assert.equal(s.scopeEventRevision, 1, 'ignore files can affect other files despite the mask');
});


test('a definitely excluded subtree is ignored but a conditional sibling remains relevant', t => {
  const f = fixture(t), s = f.session();
  s.scope = { kind: 'workspace' };
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: { '**/generated/**': true } }];
  f.events.fileDelete(uriFor('file:///workspace/generated/noise.js'));
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
  s.options = { ...s.options, maskEnabled: true, mask: '*.js' };
  s.searchRoots[0].exclude = { '**/*.js': { when: '$(basename).ts' } };
  f.events.fileCreate(uriFor('file:///workspace/example.ts'));
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.scopeStale, true);
});


test('repeated in-flight events are bounded and never restart or validate stale batches', async t => {
  let finish, batch, calls = 0;
  const f = fixture(t, { search: (_request, callbacks) => {
    calls++;
    batch = callbacks.onBatch;
    return new Promise(resolve => { finish = resolve; });
  }, dispose() {} });
  const s = f.session();
  f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
  s.scope = { kind: 'workspace' };
  s.searching = true;
  s.results = [];
  const generation = s.generation, stale = f.matches();
  const running = f.controller.search(s);
  await pause();
  batch(stale);
  assert.ok(s.results.every(result => !result.invalid));
  for (let i = 0; i < 530; i++) f.events.fileCreate(uriFor(`file:///workspace/file${i}.js`));
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
  finish(output(stale));
  await running;
  assert.equal(calls, 1);
  assert.equal(s.generation, generation);
  assert.equal(s.searchInvalidations.size, 512);
  assert.equal(s.partial, true);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
});


test('configuration changes mark already-published in-flight results unverified immediately', async t => {
  let finish, batch;
  const f = fixture(t, { search: (_request, callbacks) => {
    batch = callbacks.onBatch;
    return new Promise(resolve => { finish = resolve; });
  }, dispose() {} });
  const s = f.session(), stale = f.matches();
  s.searching = true;
  s.results = [];
  const running = f.controller.search(s);
  await pause();
  batch(stale);
  assert.ok(s.results.every(result => !result.invalid));
  f.events.configuration({ affectsConfiguration: section => section === 'search' });
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
  finish(output(stale));
  await running;
  assert.equal(s.partial, true);
  assert.ok(s.results.every(result => result.invalid));
});

for (const signal of ['ignore change', 'ignore document save', 'conditional sibling create', 'conditional sibling save']) {
  test(`initial search invalidates all rows affected by membership policy: ${signal}`, async t => {
    let finish, batch;
    const f = fixture(t, { search: (_request, callbacks) => {
      batch = callbacks.onBatch;
      return new Promise(resolve => { finish = resolve; });
    }, dispose() {} });
    const s = f.session(), matches = f.matches(), generation = s.generation;
    f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
    f.v.workspace.getConfiguration = section => ({ get: (key, fallback) =>
      section === 'search' && key === 'exclude'
        ? { '**/*.js': { when: '$(basename).ts' } } : fallback });
    s.scope = { kind: 'workspace' };
    s.options = { ...s.options, maskEnabled: true, mask: '*.js' };
    s.searchRoots = [{ path: '/workspace', name: 'workspace',
      exclude: { '**/*.js': { when: '$(basename).ts' } } }];
    s.searching = true;
    s.results = [];
    const running = f.controller.search(s);
    await pause();
    batch(matches);
    if (signal === 'ignore change') f.events.fileChange(uriFor('file:///workspace/.gitignore'));
    else if (signal === 'ignore document save') f.events.save({ uri: uriFor('file:///workspace/.gitignore') });
    else if (signal === 'conditional sibling save') f.events.save({ uri: uriFor('file:///workspace/src/example.ts') });
    else f.events.fileCreate(uriFor('file:///workspace/src/example.ts'));
    assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
    finish(output(matches));
    await running;
    assert.equal(s.generation, generation);
    assert.equal(s.partial, true);
    assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
  });
}

for (const event of ['ignore', 'git-info-exclude', 'conditional-sibling']) {
  test(`${event} invalidates the whole in-flight snapshot, including previously published rows`, async t => {
    let finish, batch;
    const f = fixture(t, { search: (_request, callbacks) => {
      batch = callbacks.onBatch;
      return new Promise(resolve => { finish = resolve; });
    }, dispose() {} });
    const s = f.session(), matches = f.matches();
    f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
    s.scope = { kind: 'directory', directory: '/workspace/src' };
    s.searching = true;
    s.results = [];
    const running = f.controller.search(s);
    await pause();
    batch(matches);
    assert.ok(s.results.every(result => !result.invalid));
    if (event === 'ignore') f.events.fileChange(uriFor('file:///workspace/.gitignore'));
    else if (event === 'git-info-exclude') f.events.fileChange(uriFor('file:///workspace/.git/info/exclude'));
    else f.events.fileCreate(uriFor('file:///workspace/src/example.ts'));
    assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
    finish(output(matches));
    await running;
    assert.equal(s.partial, true);
    assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
  });
}


test('scope revision changes during replacement, including events for files without results', t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
  s.scope = { kind: 'workspace' };
  s.replacing = true;
  f.events.document({ document: f.document, contentChanges: [] });
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.scopeStale, true);
  assert.equal(s.results.length, 2);
});


test('a relevant metadata-only document event advances the scope revision during replacement', t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  const results = s.results, generation = s.generation;
  s.replacing = true;
  f.events.document({ document: { ...f.document, encoding: 'utf16le' }, contentChanges: [] });
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.scopeStale, true);
  assert.equal(s.generation, generation);
  assert.equal(s.results, results, 'a metadata event is not an edit delta');
  assert.equal(s.validations?.size || 0, 0);
  f.events.document({ document: { ...f.document, encoding: 'utf8' }, contentChanges: [] });
  assert.equal(s.scopeEventRevision, 2, 'subsequent metadata events still conflict with a preflight');
});

for (const lifecycle of ['save', 'close']) {
  test(`${lifecycle} of an in-scope zero-match document advances the revision while replacing`, t => {
    const f = fixture(t), s = f.session('cat', {}, 'replace');
    f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
    s.scope = { kind: 'workspace' };
    s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: {} }];
    s.replacing = true;
    const results = s.results, generation = s.generation;
    // A save or close notification need not still carry isDirty=true.
    f.events[lifecycle]({ uri: uriFor('file:///workspace/zero-match.js'), isDirty: false });
    assert.equal(s.scopeEventRevision, 1);
    assert.equal(s.scopeStale, true);
    assert.equal(s.generation, generation);
    assert.equal(s.results, results);
    f.events[lifecycle]({ uri: uriFor('file:///elsewhere/outside.js'), isDirty: true });
    assert.equal(s.scopeEventRevision, 1, 'an unrelated lifecycle event must not conflict');
  });
}

for (const all of [false, true]) {
  for (const lifecycle of ['save', 'close']) {
    test(`${lifecycle} of a zero-match document aborts ${all ? 'Replace All' : 'Replace'} before dispatch`, async t => {
      const f = fixture(t), s = f.session('cat', {}, 'replace');
      f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
      s.scope = { kind: 'workspace' };
      s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: {} }];
      f.controller.engine.search = async () => output(s.results);
      s.searchRequestFingerprint = requestFingerprint(await f.controller.request(s));
      let finishOpen, applied = 0;
      f.v.workspace.openTextDocument = () => new Promise(resolve => { finishOpen = resolve; });
      f.v.workspace.applyEdit = async () => { applied++; return true; };
      const replacing = f.controller.replace(s, all, { id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation });
      await pause();
      f.events[lifecycle]({ uri: uriFor('file:///workspace/zero-match.js'), isDirty: false });
      finishOpen(f.document);
      await assert.rejects(replacing, /scope changed|older search snapshot/);
      assert.equal(applied, 0);
      assert.equal(s.replacing, false);
    });
  }
}


test('an event after edit dispatch does not claim that a successful edit was canceled', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  let finishEdit;
  f.v.workspace.applyEdit = () => new Promise(resolve => { finishEdit = resolve; });
  const replacing = f.controller.replace(s, false, { id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation });
  await pause();
  assert.equal(s.replacing, true);
  f.events.document({ document: f.document, contentChanges: [] });
  finishEdit(true);
  await replacing;
  assert.equal(s.replacing, false);
  assert.match(s.feedback, /^Replaced 1 matches/);
  assert.equal(s.scopeStale, true);
});


test('closing a version-bound document invalidates its saved rows without reopening it', t => {
  const f = fixture(t), s = f.session();
  const ids = s.results.map(result => result.id), generation = s.generation;
  let opens = 0;
  f.v.workspace.openTextDocument = async () => { opens++; return f.document; };
  f.events.close(f.document);
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.generation, generation);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
  assert.equal(opens, 0);
});


test('closing a document aborts its in-flight check even before version binding', async t => {
  let finish;
  const f = fixture(t, { search: () => new Promise(resolve => { finish = resolve; }), dispose() {} });
  const s = f.session();
  s.results = s.results.map(result => ({ ...result, documentVersion: undefined }));
  f.controller.queueValidation(s, sourceUri.toString(), 0);
  const checking = f.validate(s);
  await pause();
  f.events.close(f.document);
  finish(output(f.matches()));
  await checking;
  assert.equal(s.validations.size, 0);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
});


test('closing an Open Editors member during request preparation invalidates its late rows', async t => {
  let finishOpen;
  const f = fixture(t, { search: async () => output(f.matches()), dispose() {} });
  const s = f.session(), generation = s.generation;
  f.v.workspace.openTextDocument = () => new Promise(resolve => { finishOpen = resolve; });
  s.searching = true;
  s.results = [];
  const running = f.controller.search(s);
  await pause();
  f.v.window.tabGroups.all[0].tabs = [];
  f.events.close(f.document);
  finishOpen(f.document);
  await running;
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.generation, generation);
  assert.equal(s.partial, true);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
});


test('metadata-only events outside Open Editors do not stale a snapshot', t => {
  const f = fixture(t), s = f.session();
  const results = s.results;
  f.events.document({ document: { uri: uriFor('untitled:other') }, contentChanges: [] });
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
  assert.equal(s.results, results);
});


test('Save and Close advance revision for an in-scope zero-match document even when clean', t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  s.scope = { kind: 'workspace' };
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: {} }];
  const noMatches = { uri: uriFor('file:///workspace/no-matches.js'), isDirty: false, isClosed: true };
  const outside = { uri: uriFor('file:///outside/file.js'), isDirty: false };
  const results = s.results, generation = s.generation;
  s.replacing = true;
  f.events.save(noMatches);
  f.events.close(noMatches);
  f.events.save(outside);
  f.events.close(outside);
  assert.equal(s.scopeEventRevision, 2);
  assert.equal(s.scopeStale, true);
  assert.equal(s.generation, generation);
  assert.equal(s.results, results);
});

for (const all of [false, true]) {
  for (const signal of ['save', 'close', 'metadata']) {
    test(`${all ? 'Replace All' : 'Replace'} rejects a ${signal} event before edit dispatch`, async t => {
      const f = fixture(t), s = f.session('cat', {}, 'replace');
      s.scope = { kind: 'workspace' };
      s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: {} }];
      f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
      f.controller.engine.search = async () => output(s.results);
      s.searchRequestFingerprint = requestFingerprint(await f.controller.request(s));
      let finishOpen, applied = false;
      f.v.workspace.openTextDocument = () => new Promise(resolve => { finishOpen = resolve; });
      f.v.workspace.applyEdit = async () => { applied = true; return true; };
      const replacing = f.controller.replace(s, all, { id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation });
      await tick();
      const noMatches = { uri: uriFor('file:///workspace/no-matches.js'), isDirty: false, isClosed: true };
      if (signal === 'metadata') f.events.document({ document: noMatches, contentChanges: [] });
      else f.events[signal](noMatches);
      finishOpen(f.document);
      await assert.rejects(() => replacing, /scope changed|older search snapshot/);
      assert.equal(applied, false);
      assert.equal(s.replacing, false);
      assert.equal(s.scopeEventRevision, 1);
    });
  }
}


test('a source event after edit dispatch does not falsely report that nothing was replaced', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  const apply = f.v.workspace.applyEdit;
  let applied = false;
  f.v.workspace.applyEdit = async edit => {
    const result = await apply(edit);
    applied = result;
    f.events.save(f.document);
    return result;
  };
  await f.controller.replace(s, false, { id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation });
  assert.equal(applied, true);
  assert.match(s.feedback, /Replaced 1 matches/);
  assert.ok(s.scopeEventRevision >= 1);
});


test('Close retains captured Open Editors membership for a zero-match untitled document', t => {
  const f = fixture(t), s = f.session();
  const untitled = uriFor('untitled:Untitled-1');
  s.openEditorUris = [untitled];
  s.results = [];
  f.events.close({ uri: untitled, isDirty: false, isClosed: true });
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.scopeStale, true);
});


test('Open Editors observes a delivered ignore save and a saved conditional sibling', t => {
  const f = fixture(t), s = f.session();
  s.searchRoots = [{ path: '/workspace', name: 'workspace',
    exclude: { '**/*.js': { when: '$(basename).ts' } } }];
  f.events.save({ uri: uriFor('file:///workspace/.gitignore') });
  f.events.save({ uri: uriFor('file:///workspace/src/example.ts') });
  f.events.save({ uri: uriFor('file:///elsewhere/irrelevant.ts') });
  assert.equal(s.scopeEventRevision, 2);
  assert.equal(s.scopeStale, true);
});


test('Open Editors ignores an unrelated same-folder file without conditional excludes', t => {
  const f = fixture(t), s = f.session();
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: {} }];
  let changes = 0;
  f.controller.findTree.onDidChangeTreeData(() => { changes++; });
  const other = uriFor('file:///workspace/src/unrelated.txt');
  f.events.fileChange(other);
  f.events.fileCreate(other);
  f.events.fileDelete(other);
  f.events.save({ uri: other });
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
  assert.equal(changes, 0);
});


test('Open Editors ignores document and file events for a masked-out editor', t => {
  const f = fixture(t), s = f.session();
  s.options = { ...s.options, maskEnabled: true, mask: '*.js', respectExcludes: true };
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: {} }];
  const other = uriFor('file:///workspace/src/readme.md');
  f.v.window.tabGroups.all[0].tabs.push({ input: new f.v.TabInputText(other) });
  f.events.document({ document: { uri: other }, contentChanges: [{ text: 'change' }] });
  f.events.save({ uri: other });
  f.events.close({ uri: other });
  f.events.fileChange(other);
  f.events.fileCreate(other);
  f.events.fileDelete(other);
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
});


test('Open Editors ignores duplicate and masked tab membership changes', t => {
  const f = fixture(t), s = f.session();
  s.options = { ...s.options, maskEnabled: true, mask: '*.js' };
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: {} }];
  s.observedOpenEditorUris = new Set([sourceUri.toString()]);
  const tabs = f.v.window.tabGroups.all[0].tabs;
  let changes = 0;
  f.controller.findTree.onDidChangeTreeData(() => { changes++; });
  const duplicate = { input: new f.v.TabInputText(sourceUri) };
  const masked = { input: new f.v.TabInputText(uriFor('file:///workspace/readme.md')) };
  tabs.push(duplicate);
  f.events.tabs({ opened: [duplicate], closed: [], changed: [] });
  tabs.pop();
  f.events.tabs({ opened: [], closed: [duplicate], changed: [] });
  tabs.push(masked);
  f.events.tabs({ opened: [masked], closed: [], changed: [] });
  tabs.pop();
  f.events.tabs({ opened: [], closed: [masked], changed: [] });
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
  assert.equal(changes, 0, 'irrelevant membership never notifies the native root');
  const included = { input: new f.v.TabInputText(uriFor('file:///workspace/other.js')) };
  tabs.push(included);
  f.events.tabs({ opened: [included], closed: [], changed: [] });
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.scopeStale, true);
});


test('Open Editors ignores definitely excluded membership without notifying the native root', t => {
  const f = fixture(t), s = f.session();
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: { '**/generated/**': true } }];
  s.observedOpenEditorUris = new Set([sourceUri.toString()]);
  const tabs = f.v.window.tabGroups.all[0].tabs;
  const excluded = { input: new f.v.TabInputText(uriFor('file:///workspace/generated/other.js')) };
  let changes = 0;
  f.controller.findTree.onDidChangeTreeData(() => { changes++; });
  tabs.push(excluded);
  f.events.tabs({ opened: [excluded], closed: [], changed: [] });
  tabs.pop();
  f.events.tabs({ opened: [], closed: [excluded], changed: [] });
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
  assert.equal(changes, 0);
});


test('an initial Open Editors request retains membership while document opening is pending', async t => {
  let opened, finish;
  const f = fixture(t, { search: () => new Promise(resolve => { finish = resolve; }), dispose() {} });
  f.v.workspace.openTextDocument = () => new Promise(resolve => { opened = resolve; });
  const s = f.session(), matches = f.matches(), generation = s.generation;
  s.searching = true;
  s.results = [];
  const running = f.controller.search(s);
  await Promise.resolve();
  f.v.window.tabGroups.all[0].tabs = [];
  f.events.close({ uri: sourceUri, isDirty: false, isClosed: true });
  assert.equal(s.scopeEventRevision, 1);
  opened(f.document);
  await pause();
  finish(output(matches));
  await running;
  assert.equal(s.generation, generation);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
});


test('Save and Close outside masks and exclusions do not stale unrelated workspace files', t => {
  const f = fixture(t), s = f.session();
  s.scope = { kind: 'workspace' };
  s.options = { ...s.options, maskEnabled: true, mask: '*.js', respectExcludes: true };
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: { '**/generated/**': true } }];
  for (const uri of [uriFor('file:///workspace/readme.md'), uriFor('file:///workspace/generated/a.js')]) {
    f.events.save({ uri, isDirty: false });
    f.events.close({ uri, isDirty: false, isClosed: true });
  }
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
});


test('disabled exclusions do not make a masked-out sibling save relevant', t => {
  const f = fixture(t), s = f.session();
  s.scope = { kind: 'workspace' };
  s.options = { ...s.options, maskEnabled: true, mask: '*.js', respectExcludes: false };
  s.searchRoots = [{ path: '/workspace', name: 'workspace',
    exclude: { '**/*.js': { when: '$(basename).ts' } } }];
  f.events.save({ uri: uriFor('file:///workspace/src/example.ts'), isDirty: false });
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(s.scopeStale, false);
});


test('Close invalidates version-bound rows and cancels checks without reopening the document', t => {
  const f = fixture(t), s = f.session();
  const ids = s.results.map(result => result.id), generation = s.generation;
  f.controller.queueValidation(s, sourceUri.toString(), 1000);
  const entry = s.validations.get(sourceUri.toString());
  s.results = s.results.map(result => ({ ...result, identityUnknown: true, invalid: true }));
  f.v.workspace.openTextDocument = () => assert.fail('close must not reopen a document');
  f.events.close({ uri: sourceUri, isDirty: false, isClosed: true });
  assert.equal(entry.abort.signal.aborted, true);
  assert.equal(s.validations.size, 0);
  assert.equal(s.generation, generation);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.identityUnknown && result.invalid && !result.pending));
});


test('a metadata-only event while searching invalidates affected late results conservatively', async t => {
  let finish, batch;
  const f = fixture(t, { search: (_request, callbacks) => {
    batch = callbacks.onBatch;
    return new Promise(resolve => { finish = resolve; });
  }, dispose() {} });
  const s = f.session(), matches = f.matches(), generation = s.generation;
  s.searching = true;
  s.results = [];
  const running = f.controller.search(s);
  await pause();
  f.events.document({ document: { ...f.document, encoding: 'utf16le' }, contentChanges: [] });
  batch(matches);
  finish(output(matches));
  await running;
  assert.equal(s.generation, generation);
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.partial, true);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
});


test('independent saved sessions receive only their own scoped event revisions', t => {
  const f = fixture(t), first = f.session(), second = f.session();
  f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
  second.scope = { kind: 'directory', directory: '/workspace/other' };
  second.results = [];
  f.events.fileChange(sourceUri);
  assert.equal(first.scopeEventRevision, 1);
  assert.equal(second.scopeEventRevision, 0);
  f.events.fileCreate(uriFor('file:///workspace/other/new.js'));
  assert.equal(first.scopeEventRevision, 1);
  assert.equal(second.scopeEventRevision, 1);
});


test('a newly added workspace root contributes events to the revision for preflight', t => {
  const f = fixture(t), s = f.session();
  s.scope = { kind: 'workspace' };
  s.searchRoots = [{ path: '/workspace', name: 'old', exclude: {} }];
  f.v.workspace.workspaceFolders = [
    { name: 'old', uri: uriFor('file:///workspace') },
    { name: 'new', uri: uriFor('file:///new-root') }
  ];
  f.events.folders({ added: [], removed: [] });
  assert.equal(s.scopeEventRevision, 1);
  f.events.fileChange(uriFor('file:///new-root/new.js'));
  assert.equal(s.scopeEventRevision, 2);
});


test('a renamed custom scope root contributes events from both old and current roots', t => {
  const f = fixture(t), s = f.session();
  s.scope = { kind: 'custom', name: 'API' };
  s.effectiveScope = { kind: 'folder', rootPath: '/workspace/old' };
  s.searchRoots = [{ path: '/workspace/old', name: 'old', exclude: {} }];
  f.v.workspace.workspaceFolders = [{ name: 'new', uri: uriFor('file:///workspace/new') }];
  f.controller.resolveNamedScope = () => ({ scope: { kind: 'folder', rootPath: '/workspace/new' } });
  f.events.configuration({ affectsConfiguration: section => section === 'jbsearch.scopes' });
  f.events.fileCreate(uriFor('file:///workspace/new/new.js'));
  f.events.fileCreate(uriFor('file:///workspace/old/old.js'));
  assert.equal(s.scopeEventRevision, 3);
});


test('unrelated settings and tab presentation changes do not stale a snapshot', t => {
  const f = fixture(t), s = f.session();
  s.observedOpenEditorUris = new Set([sourceUri.toString()]);
  let changes = 0;
  f.controller.findTree.onDidChangeTreeData(() => { changes++; });
  f.events.configuration({ affectsConfiguration: section => section === 'jbsearch.keybindings.overrideFindInFiles' });
  f.events.tabs({ opened: [], closed: [], changed: [{ input: new f.v.TabInputText(sourceUri) }] });
  assert.equal(s.scopeStale, false);
  assert.equal(s.scopeEventRevision, 0);
  assert.equal(changes, 0);
});


test('changing named-scope options refreshes the modal menu without clearing an ordinary snapshot', t => {
  const f = fixture(t), s = f.session();
  s.layout = 'modal';
  s.scope = { kind: 'workspace' };
  f.panel(s);
  f.v.workspace.getConfiguration = () => ({ get: (name, fallback) =>
    name === 'scopes' ? [{ name: 'New Scope' }] : fallback });
  const states = [];
  f.controller.notify = session => states.push(f.controller.snapshot(session));
  const ids = s.results.map(result => result.id), generation = s.generation;
  f.events.configuration({ affectsConfiguration: section => section === 'jbsearch.scopes' });
  assert.deepEqual(states.at(-1).customScopes, ['New Scope']);
  assert.equal(s.scopeStale, false);
  assert.equal(s.generation, generation);
  assert.deepEqual(s.results.map(result => result.id), ids);
});


test('editing the modal query still clears the old generation immediately', async t => {
  const f = fixture(t), s = f.session();
  s.layout = 'modal';
  f.panel(s);
  const generation = s.generation;
  await f.controller.message(s, { type: 'update', patch: { query: 'new query' } });
  assert.equal(s.generation, generation + 1);
  assert.deepEqual(s.results, []);
  assert.equal(s.selectedId, null);
  assert.equal(s.searching, true);
});


test('validation workers are globally bounded and queued files are not starved', async t => {
  const running = [], started = [];
  const f = fixture(t, { search: request => {
    started.push(request.documents[0].uri);
    return new Promise(resolve => running.push(resolve));
  }, dispose() {} });
  const s = f.session();
  const template = s.results[0];
  s.results = Array.from({ length: 8 }, (_, index) => ({
    ...template, id: `row-${index}`, uri: `file:///workspace/file${index}.js`
  }));
  for (const result of s.results) f.controller.queueValidation(s, result.uri, 0);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(started.length, 4);
  assert.equal(f.controller.activeValidations, 4);
  for (const finish of running.splice(0)) finish(output([]));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(started.length, 8);
  assert.equal(f.controller.activeValidations, 4);
  for (const finish of running.splice(0)) finish(output([]));
  await pause();
  assert.equal(f.controller.activeValidations, 0);
});


test('repeated checks respect a maximum debounce wait', async t => {
  let started = 0;
  const f = fixture(t, { search: async () => { started++; return output([]); }, dispose() {} });
  const s = f.session();
  f.controller.queueValidation(s, sourceUri.toString(), 250);
  s.validations.get(sourceUri.toString()).firstQueued = Date.now() - 1100;
  f.controller.queueValidation(s, sourceUri.toString(), 250);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(started, 1);
});


test('a timed-out validation open remains INVALID when its physical request resolves late', async t => {
  let finishOpen, announce, workerCalls = 0;
  const started = new Promise(resolve => { announce = resolve; });
  const f = fixture(t, { search: async () => { workerCalls++; return output([]); }, dispose() {} });
  const s = f.session(), ids = s.results.map(result => result.id);
  f.controller.configuration = () => ({ get: (key, fallback) =>
    key === 'search.timeoutMs' ? 100 : fallback });
  f.v.workspace.openTextDocument = () => new Promise(resolve => { finishOpen = resolve; announce(); });
  f.controller.queueValidation(s, sourceUri.toString(), 0);
  await started;
  await new Promise(resolve => setTimeout(resolve, 140));
  assert.equal(s.validations.size, 0);
  assert.equal(f.controller.validationOpenGate.active, 1, 'timeout does not cancel the actual open');
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.invalid && !result.pending && result.identityUnknown));
  assert.equal(s.needsRerun, true);
  assert.match(s.notice, /timed out/);
  finishOpen(f.document);
  await pause();
  assert.equal(f.controller.validationOpenGate.active, 0);
  assert.equal(workerCalls, 0, 'a late document must not start a validation worker');
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown));
});


test('closing a modal cancels its waiter but retains the physical slot until open settles', async t => {
  let finishOpen, announce, workerCalls = 0;
  const started = new Promise(resolve => { announce = resolve; });
  const f = fixture(t, { search: async () => { workerCalls++; return output([]); }, dispose() {} });
  const s = f.session();
  s.layout = 'modal';
  const panel = f.panel(s);
  f.v.workspace.openTextDocument = () => new Promise(resolve => { finishOpen = resolve; announce(); });
  f.controller.queueValidation(s, sourceUri.toString(), 0);
  await started;
  panel.dispose();
  assert.equal(s.validations.size, 0);
  assert.equal(f.controller.validationOpenGate.active, 1);
  finishOpen(f.document);
  await pause();
  assert.equal(f.controller.validationOpenGate.active, 0);
  assert.equal(workerCalls, 0);
});


test('validation admission bounds the total backlog across sessions, including debounce timers', t => {
  const f = fixture(t), sessions = [f.session(), f.session(), f.session()];
  // This test concerns controller admission, not native tree performance.
  f.controller.notify = () => {};
  const template = sessions[0].results[0];
  for (const [index, s] of sessions.entries()) {
    s.results = Array.from({ length: 200 }, (_, item) => ({
      ...template, id: `${index}:${item}`, uri: `file:///workspace/${index}/${item}.js`
    }));
    for (const result of s.results) f.controller.queueValidation(s, result.uri, 1000);
  }
  assert.equal(f.controller.validationEntries.size, 512);
  assert.equal(sessions.reduce((sum, s) => sum + s.validations.size, 0), 512);
  assert.equal(f.controller.validationQueue.length, 0, 'debouncing also consumes bounded admission');
  assert.equal(sessions[2].validations.size, 112);
  assert.ok(sessions[2].results.slice(112).every(result => result.invalid && !result.pending));
  assert.equal(sessions[2].needsRerun, true);
  const uri = sessions[0].results[0].uri;
  const previous = sessions[0].validations.get(uri);
  f.controller.queueValidation(sessions[0], uri, 1000);
  assert.equal(previous.abort.signal.aborted, true);
  assert.equal(f.controller.validationEntries.size, 512, 'deduplication does not consume another slot');
  assert.equal(sessions[0].validations.get(uri).firstQueued, previous.firstQueued);
  f.controller.cancelValidations(sessions[0]);
  assert.equal(f.controller.validationEntries.size, 312);
  f.controller.queueValidation(sessions[2], sessions[2].results[199].uri, 1000);
  assert.equal(f.controller.validationEntries.size, 313);
  assert.equal(sessions[1].validations.size, 200, 'no session state was merged or canceled');
});


test('controller validation FIFO is shared across sessions and hot requeues go behind older files', async t => {
  const running = [], started = [];
  const f = fixture(t, { search: request => {
    const hold = deferred();
    started.push(request.documents[0].uri);
    running.push(hold);
    return hold.promise;
  }, dispose() {} });
  const sessions = [f.session(), f.session(), f.session()];
  const uris = [];
  for (const [index, s] of sessions.entries()) {
    s.results = s.results.map((result, item) => ({ ...result, uri: `file:///workspace/${index}/${item}.js` }));
    for (const result of s.results) {
      uris.push(result.uri);
      f.controller.queueValidation(s, result.uri, 0);
    }
  }
  await pause();
  assert.deepEqual(started, uris.slice(0, 4));
  f.controller.queueValidation(sessions[0], uris[0], 0);
  await pause();
  running[0].resolve(output([]));
  await tick();
  assert.deepEqual(started, uris.slice(0, 5));
  running[1].resolve(output([]));
  await tick();
  assert.deepEqual(started, uris);
  running[2].resolve(output([]));
  await tick();
  assert.deepEqual(started, [...uris, uris[0]], 'the hot file cannot overtake another session');
  for (const hold of running) hold.resolve(output([]));
  await tick();
  assert.equal(f.controller.activeValidations, 0);
  assert.equal(f.controller.validationEntries.size, 0);
});


test('validation deadlines include the controller FIFO and abort late workers without restoring rows', async t => {
  const running = [];
  const f = fixture(t, { search: () => {
    const hold = deferred(); running.push(hold); return hold.promise;
  }, dispose() {} });
  f.controller.configuration = () => ({ get: (key, fallback) => key === 'search.timeoutMs' ? 100 : fallback });
  const sessions = Array.from({ length: 6 }, () => f.session());
  for (const s of sessions) f.controller.queueValidation(s, sourceUri.toString(), 0);
  await pause();
  assert.equal(running.length, 4);
  assert.equal(f.controller.validationQueue.length, 2);
  await new Promise(resolve => setTimeout(resolve, 140));
  assert.equal(f.controller.validationQueue.length, 0);
  assert.equal(f.controller.validationEntries.size, 4,
    'even canceled running mock workers count until their promises actually settle');
  assert.ok(sessions.every(s => s.validations.size === 0 && s.needsRerun));
  assert.ok(sessions.every(s => s.results.every(result => result.invalid && !result.pending)));
  for (const hold of running) hold.resolve(output(f.matches()));
  await tick();
  assert.equal(running.length, 4, 'expired FIFO entries must never start a worker');
  assert.equal(f.controller.activeValidations, 0);
  assert.equal(f.controller.validationEntries.size, 0);
  assert.ok(sessions.every(s => s.results.every(result => result.invalid && result.identityUnknown)));
});


test('Close aborts a physical opening before version binding; its late success cannot start a worker', async t => {
  const hold = deferred();
  let workers = 0;
  const f = fixture(t, { search: async () => { workers++; return output(f.matches()); }, dispose() {} });
  const s = f.session();
  s.results = s.results.map(result => ({ ...result, documentVersion: undefined, trackedDocumentVersion: undefined }));
  f.v.workspace.openTextDocument = () => hold.promise;
  f.controller.queueValidation(s, sourceUri.toString(), 0);
  await pause();
  const entry = s.validations.get(sourceUri.toString());
  assert.equal(f.controller.documentOpenGate.active, 1);
  f.events.close(f.document);
  await tick();
  assert.equal(entry.abort.signal.aborted, true);
  assert.equal(s.validations.size, 0);
  assert.equal(f.controller.validationEntries.size, 0);
  assert.equal(f.controller.documentOpenGate.active, 1);
  hold.resolve(f.document);
  await tick();
  assert.equal(workers, 0);
  assert.equal(f.controller.documentOpenGate.active, 0);
  assert.ok(s.results.every(result => result.invalid && result.identityUnknown && !result.pending));
});

for (const action of ['closeSearch', 'reset', 'dispose']) {
  test(`${action} cancels validation callers; physical late rejection cannot revive a snapshot`, async t => {
    const hold = deferred();
    let workers = 0;
    const f = fixture(t, { search: async () => { workers++; return output([]); }, dispose() {} });
    const s = f.session();
    f.v.workspace.openTextDocument = () => hold.promise;
    f.controller.queueValidation(s, sourceUri.toString(), 0);
    await pause();
    if (action === 'closeSearch') f.controller.closeFindSearch(s);
    else if (action === 'reset') f.controller.resetSearch(s);
    else f.controller.dispose();
    const rows = s.results;
    await tick();
    assert.equal(f.controller.documentOpenGate.active, 1);
    assert.equal(f.controller.validationEntries.size, 0);
    hold.reject(new Error('late host failure'));
    await tick();
    assert.equal(f.controller.documentOpenGate.active, 0);
    assert.equal(workers, 0);
    assert.equal(s.results, rows);
  });
}


test('one physical cap covers initial search, validation, preview and replacement preparation', async t => {
  const holds = Array.from({ length: 4 }, deferred), started = [];
  let workers = 0, applied = 0;
  const f = fixture(t, { search: async () => { workers++; return output([]); }, dispose() {} });
  f.controller.configuration = () => ({ get: (key, fallback) => ['search.timeoutMs', 'replace.prepareTimeoutMs'].includes(key) ? 100 : fallback });
  f.v.workspace.openTextDocument = uri => {
    started.push(uri.toString());
    return holds[started.length - 1].promise;
  };
  f.v.workspace.applyEdit = async () => { applied++; return true; };
  const occupied = holds.map((_, index) => f.controller.openDocument(uriFor(`file:///hung/${index}`))
    .catch(error => error));
  await tick();
  const initial = f.session(), validating = f.session(), replacing = f.session('cat', {}, 'replace');
  initial.results = [];
  initial.searching = true;
  const initialSearch = f.controller.search(initial);
  f.controller.queueValidation(validating, sourceUri.toString(), 0);
  const replace = assert.rejects(f.controller.replace(replacing, false,
    { id: replacing.selectedId, generation: replacing.generation, actionBinding: f.controller.snapshot(replacing).actionBinding }), /timed out/);
  const preview = f.session();
  preview.layout = 'modal';
  f.panel(preview);
  const selecting = f.controller.select(preview, preview.selectedId);
  await Promise.all([...occupied, initialSearch, replace, selecting]);
  await pause();
  assert.equal(started.length, 4, 'timeouts must not create replacement physical operations');
  assert.equal(f.controller.documentOpenGate, f.controller.validationOpenGate);
  assert.equal(f.controller.documentOpenGate.active, 4);
  assert.equal(f.controller.documentOpenGate.waiting, 0);
  assert.equal(initial.partial, true);
  assert.equal(initial.needsRerun, true);
  assert.equal(initial.searching, false);
  assert.ok(validating.results.every(result => result.invalid && !result.pending));
  assert.equal(replacing.replacing, false);
  assert.match(preview.notice, /timed out/);
  assert.equal(workers, 0);
  assert.equal(applied, 0);
  for (const hold of holds) hold.resolve(f.document);
  await tick();
  assert.equal(f.controller.documentOpenGate.active, 0);
  assert.equal(workers, 0, 'late opens cannot start searches or restore rows');
  assert.equal(applied, 0);
});


test('closing a modal during initial document preparation cancels its wait, not the physical host request', async t => {
  const hold = deferred();
  let workers = 0;
  const f = fixture(t, { search: async () => { workers++; return output([]); }, dispose() {} });
  const s = f.session();
  s.layout = 'modal';
  s.results = [];
  s.searching = true;
  const panel = f.panel(s);
  f.v.workspace.openTextDocument = () => hold.promise;
  const searching = f.controller.search(s);
  await tick();
  panel.dispose();
  await searching;
  assert.equal(f.controller.documentOpenGate.active, 1);
  hold.resolve(f.document);
  await tick();
  assert.equal(workers, 0);
  assert.equal(f.controller.documentOpenGate.active, 0);
  assert.deepEqual(s.results, []);
});


test('initial preparation does not spend physical opens on definitely masked or excluded editors', async t => {
  const f = fixture(t), s = f.session();
  s.options = { ...s.options, maskEnabled: true, mask: '*.js' };
  f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
  f.v.workspace.getConfiguration = section => ({ get: (key, fallback) =>
    section === 'files' && key === 'exclude' ? { '**/generated/**': true } : fallback });
  f.v.window.tabGroups.all[0].tabs.push(
    { input: new f.v.TabInputText(uriFor('file:///workspace/readme.md')) },
    { input: new f.v.TabInputText(uriFor('file:///workspace/generated/other.js')) }
  );
  const opened = [];
  f.v.workspace.openTextDocument = async uri => { opened.push(uri.toString()); return f.document; };
  const request = await f.controller.request(s);
  assert.deepEqual(opened, [sourceUri.toString()]);
  assert.deepEqual(request.documents.map(item => item.uri), [sourceUri.toString()]);
});


test('initial request parameters and root policies are captured before awaiting document opens', async t => {
  const f = fixture(t), s = f.session(), hold = deferred();
  f.v.workspace.workspaceFolders = [{ name: 'workspace', uri: uriFor('file:///workspace') }];
  let excluded = { '**/old/**': true };
  f.v.workspace.getConfiguration = section => ({ get: (key, fallback) =>
    section === 'files' && key === 'exclude' ? excluded : fallback });
  f.v.workspace.openTextDocument = () => hold.promise;
  const preparing = f.controller.request(s);
  await tick();
  s.query = 'different';
  s.options.caseSensitive = true;
  excluded = { '**/new/**': true };
  hold.resolve(f.document);
  const request = await preparing;
  assert.equal(request.query, 'cat');
  assert.equal(request.caseSensitive, false);
  assert.deepEqual(request.roots[0].exclude, { '**/old/**': true });
});


test('completed event staleness does not retroactively make the initial enumeration partial', t => {
  const f = fixture(t), s = f.session();
  assert.equal(s.partial, false);
  f.events.save(f.document);
  f.events.document({ document: f.document, contentChanges: [] });
  assert.equal(s.scopeEventRevision, 2);
  assert.equal(s.scopeStale, true);
  assert.equal(s.partial, false);
});


test('zero-content notification in a zero-match scope file conflicts even during replacement', t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  s.scope = { kind: 'workspace' };
  s.searchRoots = [{ path: '/workspace', name: 'workspace', exclude: {} }];
  s.replacing = true;
  const rows = s.results;
  f.events.document({ document: { uri: uriFor('file:///workspace/no-match.js'), isDirty: false }, contentChanges: [] });
  assert.equal(s.scopeEventRevision, 1);
  assert.equal(s.scopeStale, true);
  assert.equal(s.partial, false);
  assert.equal(s.results, rows);
});


test('refresh messages do not restart an active search or replacement', async t => {
  const f = fixture(t), s = f.session();
  const generation = s.generation, ids = s.results.map(result => result.id);
  s.searching = true;
  await f.controller.message(s, { type: 'refresh' });
  s.searching = false;
  s.replacing = true;
  await f.controller.message(s, { type: 'refresh' });
  assert.equal(s.generation, generation);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.equal(s.timer, undefined);
});


test('a modal single replacement retains the snapshot and rechecks only the changed file', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  s.layout = 'modal';
  f.panel(s);
  s.replacement = 'dog';
  const generation = s.generation, ids = s.results.map(result => result.id);
  await f.controller.replace(s, false, { id: ids[0], generation, actionBinding: f.controller.snapshot(s).actionBinding });
  assert.equal(s.generation, generation);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.pending));
  await f.validate(s);
  assert.deepEqual(s.results.map(result => result.invalid), [true, false]);
});


test('changing rooted configuration or workspace keeps the snapshot and marks an in-flight search partial', async t => {
  const f = fixture(t);
  const s = f.session();
  s.scope = { kind: 'custom', name: 'API' };
  const savedRows = s.results;
  f.events.configuration({ affectsConfiguration: section => section === 'jbsearch.scopes' });
  f.events.folders({ added: [], removed: [] });
  assert.equal(s.results, savedRows, 'completed snapshots remain frozen');
  assert.equal(s.timer, undefined);
  for (const trigger of [
    () => f.events.configuration({ affectsConfiguration: section => section === 'jbsearch.scopes' }),
    () => f.events.folders({ added: [], removed: [] })
  ]) {
    let finish, batch;
    f.controller.request = async () => ({ query: s.query,
      namedScopeBinding: { scopeName: 'API', rootName: 'API', uri: 'file:///workspace/api' } });
    f.controller.engine = { search: (_request, callbacks) => {
      batch = callbacks.onBatch;
      return new Promise(resolve => { finish = resolve; });
    }, dispose() {} };
    s.searching = true;
    s.results = [];
    const searching = f.controller.search(s);
    await pause();
    const oldGeneration = s.generation;
    trigger();
    assert.equal(s.generation, oldGeneration);
    const stale = f.matches();
    batch(stale);
    finish(output(stale));
    await searching;
    assert.deepEqual(s.results.map(result => result.id), stale.map(result => result.id));
    assert.equal(s.partial, true, 'changed scope settings make the in-flight search incomplete');
  }
});

test('single replacement rejects an action for the old displayed result revision', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  const id = s.results[0].id;
  const oldRevision = s.results[0].resultRevision ?? 0;
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
  await f.validate(s);
  assert.notEqual(s.results[0].resultRevision, oldRevision);
  await assert.rejects(() => f.controller.replace(s, false, {
    id, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation, resultRevision: oldRevision
  }), /displayed result changed/);
  assert.equal(f.document.text, 'prefix cat! cat!');
  s.replacement = 'dog';
  await f.controller.replace(s, false, {
    id, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation, resultRevision: s.results[0].resultRevision
  });
  assert.equal(f.document.text, 'prefix dog! cat!');
});


test('worker, tracking, Undo/Redo and single replace retain exact UTF-16 hashes', async t => {
  for (const [originalUnit, otherUnit] of [['\ud800', '\ud801'], ['\udc00', '\udc01']]) {
    const f = fixture(t);
    f.document.text = `${originalUnit} cat!`;
    const s = f.session('(cat)(?=!)', { regex: true }, 'replace');
    const found = await f.controller.engine.search({ query: s.query, regex: true,
      scope: { kind: 'openEditors' }, roots: [], documents: [{ uri: sourceUri.toString(),
        text: f.document.text, version: f.document.version }] });
    s.results = found.results;
    s.selectedId = s.results[0].id;
    s.replacement = '$1-dog';
    assert.equal(s.results[0].contentHash, contentHash(f.document.text));
    // Model a missed event without changing the version: the worker hash must
    // distinguish the changed surrogate even though the match text is identical.
    f.document.text = `${otherUnit} cat!`;
    await assert.rejects(() => f.controller.replace(s, false, {
      id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation, resultRevision: 0
    }), /changed since the search/);
    f.document.text = `${originalUnit} cat!`;
    f.change([{ rangeOffset: 0, rangeLength: 0, text: 'z' }]);
    await f.validate(s);
    f.change([{ rangeOffset: 0, rangeLength: 1, text: '' }], 1);
    await f.validate(s);
    f.change([{ rangeOffset: 0, rangeLength: 0, text: 'z' }], 2);
    await f.validate(s);
    assert.equal(s.results[0].contentHash, contentHash(f.document.text));
    await f.controller.replace(s, false, { id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation,
      resultRevision: s.results[0].resultRevision });
    assert.equal(f.document.text, `z${originalUnit} cat-dog!`);
  }
});


test('a dispatched WorkspaceEdit remains locked until VS Code reports its outcome', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  const configuration = f.controller.configuration.bind(f.controller);
  f.controller.configuration = () => ({ get: (key, fallback) => key === 'replace.prepareTimeoutMs'
    ? 100 : configuration().get(key, fallback) });
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.v.workspace.applyEdit = async () => { enter(); await gate; return true; };
  f.controller.queueValidation = () => {};
  const pending = f.controller.replace(s, false, {
    id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation, resultRevision: 0
  });
  await entered;
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(s.replacing, true, 'the preparation timeout cannot recall a dispatched edit');
  await assert.rejects(() => f.controller.replace(s, false, {
    id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation, resultRevision: 0
  }), /Wait for the current search/);
  release();
  await pending;
  assert.equal(s.replacing, false);
});


test('duplicate result ids and ranges fail closed before opening a document', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  f.v.workspace.openTextDocument = () => assert.fail('ambiguous results must not open files');
  for (const duplicate of [
    { ...s.results[1], id: s.results[0].id },
    { ...s.results[1], offset: s.results[0].offset, length: s.results[0].length }
  ]) {
    s.results = [s.results[0], duplicate];
    await assert.rejects(() => f.controller.replace(s, true, { actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation }), /ambiguous identities/);
  }
});


test('replacement groups 50000 results once per file without quadratic session lookups', async t => {
  const f = fixture(t);
  f.document.text = 'cat '.repeat(50000);
  f.document.positionAt = offset => ({ line: 0, character: Math.min(offset, f.document.text.length) });
  f.document.offsetAt = position => position.character;
  const s = f.session('cat', {}, 'replace');
  assert.equal(s.results.length, 50000);
  // Synthetic complete worker response isolates per-file preparation/grouping;
  // real discovery at its result cap is deliberately incomplete.
  f.controller.engine.search = async () => output(s.results);
  let applied = 0;
  f.v.workspace.applyEdit = async edit => { applied = edit.entries.length; return true; };
  f.controller.queueValidation = () => {};
  await f.controller.replace(s, true, { actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation });
  assert.equal(applied, 50000);
});


test('an initially dirty Open Editors buffer still uses its versioned snapshot', async t => {
  const f = fixture(t);
  f.document.isDirty = true;
  const s = f.session('cat', {}, 'replace');
  f.controller.queueValidation = () => {};
  await f.controller.replace(s, false, { id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation, resultRevision: 0 });
  assert.equal(f.document.text, '! cat!',
    'the default empty replacement removes only the selected match');
});


test('an untitled snapshot replaces without a disk baseline', async t => {
  const f = fixture(t);
  f.document.uri = uriFor('untitled:Scratch.js');
  f.document.fileName = 'Scratch.js';
  f.document.text = 'cat';
  f.document.isDirty = true;
  const s = f.session('cat', {}, 'replace');
  const result = await f.controller.engine.search({ query: 'cat', scope: { kind: 'openEditors' }, roots: [],
    documents: [{ uri: f.document.uri.toString(), text: f.document.text, version: f.document.version }] });
  s.results = result.results;
  s.selectedId = s.results[0].id;
  s.replacement = 'dog';
  f.controller.queueValidation = () => {};
  await f.controller.replace(s, false, { id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation, resultRevision: 0 });
  assert.equal(f.document.text, 'dog');
});


test('modal document edits retain the snapshot and use worker validation', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  s.layout = 'modal';
  f.panel(s);
  f.controller.preview.render = async () => ({ lines: [] });
  const ids = s.results.map(result => result.id), generation = s.generation;
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
  assert.equal(s.generation, generation);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.pending));
  await f.validate(s);
  assert.ok(s.results.every(result => !result.pending && !result.invalid));
  assert.deepEqual(s.results.map(result => result.id), ids);
});


test('opening a disk result binds its document version before subsequent edits', async t => {
  for (const layout of ['modal', 'findWindow']) {
    const f = fixture(t), s = f.session('cat', {}, 'replace');
    s.layout = layout;
    s.results = s.results.map(result => ({ ...result, source: 'disk', documentVersion: undefined }));
    if (layout === 'modal') {
      f.panel(s);
      f.controller.preview.render = async () => ({ lines: [] });
    } else f.controller.findPreview.show = async () => ({ document: f.document });
    await f.controller.select(s, s.selectedId);
    assert.ok(s.results.every(result => result.pending), `${layout} should check the opened document`);
    await f.validate(s);
    assert.ok(s.results.every(result => !result.invalid && !result.identityUnknown &&
      result.documentVersion === f.document.version));
    f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
    await f.validate(s);
    assert.ok(s.results.every(result => !result.invalid && !result.identityUnknown));
  }
});


test('closing a document during worker validation leaves its rows unverified', async t => {
  let finish;
  const f = fixture(t, { search: () => new Promise(resolve => { finish = resolve; }), dispose() {} });
  const s = f.session();
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
  const checking = f.validate(s);
  await pause();
  f.document.isClosed = true;
  finish(output(f.matches()));
  await checking;
  assert.ok(s.results.every(result => result.invalid && !result.pending));
  assert.equal(s.needsRerun, true);
  assert.match(s.notice, /closed/);
});


test('closing a tracked document invalidates its identity without reopening it', t => {
  const f = fixture(t), s = f.session();
  const ids = s.results.map(result => result.id);
  f.v.workspace.openTextDocument = () => assert.fail('closing must not reopen the document');
  f.events.close(f.document);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.identityUnknown && result.invalid));
  assert.ok(s.results.every(result => !result.pending));
});


test('a CRLF-interior match cannot be submitted to the editor', async t => {
  const f = fixture(t), s = f.session('(?=\\n)', { regex: true }, 'replace');
  f.document.text = 'x\r\ny';
  s.results = f.matches('(?=\\n)', { regex: true });
  s.selectedId = s.results[0].id;
  await assert.rejects(() => f.controller.replace(s, false, {
    id: s.selectedId, actionBinding: f.controller.snapshot(s).actionBinding, generation: s.generation, resultRevision: 0
  }), /cannot be represented/);
  assert.equal(f.document.text, 'x\r\ny');
});


test('streaming Find results retain arrival order until the deterministic completion sort', async t => {
  const make = name => ({ id: name, uri: `file:///workspace/${name}.js`,
    relativePath: `${name}.js`, label: `${name}.js`, rootName: 'workspace',
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
    offset: 0, length: 3, lineText: 'cat', previewMatchStart: 0, previewMatchEnd: 3 });
  const z = make('z'), a = make('a');
  const f = fixture(t, { search: async (_request, { onBatch }) => {
    onBatch([z]);
    onBatch([a]);
    return output([z, a]);
  }, dispose() {} });
  const s = f.session();
  s.results = [];
  s.selectedId = null;
  s.searching = true;
  f.controller.findTree.update(f.controller.snapshot(s), { activate: true });
  const seen = [];
  f.controller.findTree.onDidChangeTreeData(() => {
    seen.push(f.controller.findTree.state.results.map(result => result.id));
  });
  await f.controller.search(s);
  assert.deepEqual(seen, [['z'], ['z', 'a'], ['a', 'z']]);
  assert.deepEqual(s.results.map(result => result.id), ['a', 'z']);
  assert.equal(s.searching, false);
});



// Composed ownership/admission regressions (F1/F3), not branch-local stand-ins.
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'the expected asynchronous boundary was reached');
    await pause();
  }
}
for (const destination of ['confirm', 'new', 'same']) {
  for (const phase of ['debounce', 'fifo', 'opening', 'worker']) {
    test(`pending ${phase} checks retain their first deadline through ${destination} ownership transfer`, async t => {
      const searches = [];
      const f = fixture(t, { search: (_request, callbacks) => {
        const hold = deferred(); searches.push({ hold, callbacks }); return hold.promise;
      }, dispose() {} });
      const target = destination === 'confirm' ? f.session() : undefined;
      const source = f.session();
      source.layout = 'modal'; f.panel(source);
      if (target) { source.targetWindowId = target.id; target.draftId = source.id; }
      const ids = source.results.map(row => row.id), generation = source.generation;
      const blockers = [];
      if (phase === 'fifo') {
        for (let i = 0; i < 4; i++) {
          const blocker = f.session(); blockers.push(blocker);
          f.controller.queueValidation(blocker, sourceUri.toString(), 0);
        }
        await until(() => searches.length === 4);
      }
      const opening = deferred(); let opens = 0;
      if (phase === 'opening') f.v.workspace.openTextDocument = () => ++opens === 1
        ? opening.promise : Promise.resolve(f.document);
      f.controller.queueValidation(source, sourceUri.toString(), phase === 'debounce' ? 1000 : 0);
      if (phase === 'opening') await until(() => opens === 1);
      if (phase === 'worker') await until(() => searches.length === 1);
      if (phase === 'fifo') await until(() => f.controller.validationQueue.some(item => item.session === source));
      const original = source.validations.get(sourceUri.toString());
      const firstQueued = original.firstQueued, deadline = original.deadline;
      const window = await f.controller.openFindWindow(source, destination === 'new');
      assert.deepEqual(window.results.map(row => row.id), ids);
      assert.equal(window.generation, destination === 'same' ? generation : generation + 1);
      const admitted = window.validations.get(sourceUri.toString());
      assert.ok(admitted, 'a pending destination row owns a real validation entry');
      assert.equal(admitted.firstQueued, firstQueued);
      assert.equal(admitted.deadline, deadline);
      assert.equal(admitted.generation, window.generation);
      if (window !== source) assert.equal(original.abort.signal.aborted, true);
      if (destination !== 'same') {
        const rows = window.results;
        if (phase === 'opening') opening.resolve(f.document);
        if (phase === 'worker') searches[0].hold.resolve(output([]));
        await tick();
        assert.equal(window.results, rows, 'a canceled old caller cannot publish into the new owner');
      }
      for (const blocker of blockers) f.controller.closeFindSearch(blocker);
      for (const job of searches) job.hold.resolve(output(f.matches()));
      if (phase === 'opening') opening.resolve(f.document);
      // Current and late workers are explicitly settled; no fake successful
      // open frees a physical slot before its underlying promise completes.
      await until(() => {
        for (const job of searches) job.hold.resolve(output(f.matches()));
        return !window.results.some(row => row.pending);
      });
      assert.ok(window.results.every(row => !row.invalid && !row.identityUnknown));
      assert.ok(f.controller.documentOpenGate.active <= 4);
      assert.ok(f.controller.validationEntries.size <= 512);
    });
  }
}
for (const ticket of ['expired', 'unknown']) test(`transfer fails closed for an ${ticket} original validation ticket`, async t => {
  const f = fixture(t), source = f.session(); source.layout = 'modal'; f.panel(source);
  f.controller.queueValidation(source, sourceUri.toString(), 1000);
  const entry = source.validations.get(sourceUri.toString());
  if (ticket === 'expired') entry.deadline = Date.now() - 1;
  else f.controller.cancelValidations(source);
  const window = await f.controller.openFindWindow(source, true);
  assert.ok(window.results.every(row => row.invalid && !row.pending && row.identityUnknown));
  assert.equal(window.needsRerun, true);
  assert.equal(window.validations?.size || 0, 0);
  assert.match(window.notice, /timed out|no longer available/);
});
for (const phase of ['debounce', 'fifo', 'running']) for (const direction of ['increase', 'decrease']) {
  test(`a ${phase} hot requeue does not ${direction} its first-admission deadline`, async t => {
    const jobs = [], f = fixture(t, { search: () => { const job = deferred(); jobs.push(job); return job.promise; }, dispose() {} });
    let timeout = direction === 'increase' ? 2000 : 5000;
    f.controller.configuration = () => ({ get: (key, fallback) => key === 'search.timeoutMs' ? timeout : fallback });
    const blockers = [];
    if (phase === 'fifo') {
      for (let i = 0; i < 4; i++) { const s = f.session(); blockers.push(s); f.controller.queueValidation(s, sourceUri.toString(), 0); }
      await until(() => jobs.length === 4);
    }
    const s = f.session(); f.controller.queueValidation(s, sourceUri.toString(), phase === 'debounce' ? 1000 : 0);
    if (phase === 'running') await until(() => jobs.length === 1);
    if (phase === 'fifo') await until(() => f.controller.validationQueue.some(item => item.session === s));
    const first = s.validations.get(sourceUri.toString());
    timeout = direction === 'increase' ? 100000 : 100;
    f.controller.queueValidation(s, sourceUri.toString(), 1000);
    const latest = s.validations.get(sourceUri.toString());
    assert.equal(latest.firstQueued, first.firstQueued);
    assert.equal(latest.deadline, first.deadline);
    assert.equal(first.abort.signal.aborted, true);
    if (phase === 'running') assert.ok(f.controller.validationEntries.has(first), 'canceled running work stays counted until it settles');
    f.controller.cancelValidations(s);
    for (const blocker of blockers) f.controller.closeFindSearch(blocker);
    for (const job of jobs) job.resolve(output([]));
    await tick();
    assert.equal(f.controller.validationEntries.size, 0);
  });
}


test('a dispatched old-generation edit keeps its lock but cannot revalidate or overwrite the new query on settlement', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace');
  let entered, finish;
  const dispatched = new Promise(resolve => { entered = resolve; });
  f.v.workspace.applyEdit = () => { entered(); return new Promise(resolve => { finish = resolve; }); };
  const validating = [];
  f.controller.queueValidation = (_session, uri) => validating.push(uri);
  const replacing = f.controller.replace(s, false, { id: s.selectedId,
    generation: s.generation, actionBinding: f.controller.snapshot(s).actionBinding });
  await dispatched;
  s.query = 'new-query';
  f.controller.resetSearch(s); // Explicit forced reset: the already submitted edit cannot be recalled.
  s.notice = 'Current generation status';
  assert.equal(s.replacing, true);
  finish(true);
  await replacing;
  assert.equal(s.replacing, false);
  assert.deepEqual(validating, []);
  assert.equal(s.notice, 'Current generation status');
  assert.deepEqual(s.results, []);
});

for (const flags of [
  { scopeStale: true, needsRerun: false },
  { scopeStale: false, needsRerun: true },
  { scopeStale: true, needsRerun: true }
]) {
  test(`modal refresh resets stale flags ${JSON.stringify(flags)} while preserving the scope revision`, async t => {
    const f = fixture(t), s = f.session();
    s.layout = 'modal';
    f.panel(s);
    Object.assign(s, flags, { scopeEventRevision: 7 });
    const before = f.controller.snapshot(s), generation = s.generation;
    assert.equal(before.scopeStale, flags.scopeStale);
    assert.equal(before.needsRerun, flags.needsRerun);
    await f.controller.message(s, { type: 'refresh' });
    clearTimeout(s.timer);
    assert.equal(s.generation, generation + 1);
    assert.equal(s.scopeStale, false);
    assert.equal(s.needsRerun, false);
    assert.equal(s.scopeEventRevision, 7);
    assert.deepEqual(s.results, []);
  });
}

// Candidate-1 independent review counterexamples, exercised against the live
// composed controller and the same explicitly synthetic host fixture above.
function transferFixture(f, destination) {
  const target = destination === 'confirm' ? f.session('cat', {}, 'replace') : undefined;
  const source = f.session('cat', {}, 'replace');
  source.layout = 'modal'; f.panel(source);
  if (target) { source.targetWindowId = target.id; target.draftId = source.id; }
  return { source, target };
}
for (const phase of ['reveal', 'close']) for (const event of ['close', 'watcher', 'edit']) {
  for (const pending of [false, true]) test(`transfer ${phase} rollback retains ${event} epoch with original pending=${pending}`, async t => {
    const f = fixture(t), { source, target } = transferFixture(f, 'confirm');
    if (pending) f.controller.queueValidation(target, sourceUri.toString(), 1000);
    const ids = target.results.map(row => row.id), epoch = target.scopeEventRevision;
    const hold = deferred();
    if (phase === 'reveal') f.controller.findTree.show = () => hold.promise;
    else f.controller.closeModalEditors = () => hold.promise;
    const moving = f.controller.openFindWindow(source, false);
    await tick();
    if (event === 'close') { f.document.isClosed = true; f.events.close(f.document); }
    else if (event === 'watcher') f.events.fileChange(f.document.uri);
    else f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
    const delivered = target.scopeEventRevision;
    assert.ok(delivered > epoch);
    hold.reject(new Error('synthetic transfer failure'));
    await assert.rejects(moving, /synthetic transfer failure/);
    assert.ok(target.scopeEventRevision >= delivered, 'delivered epochs never rewind');
    assert.deepEqual(target.results.map(row => row.id), ids);
    assert.ok(target.results.every(row => row.invalid && row.identityUnknown && !row.pending));
    assert.equal(target.validations?.size || 0, 0);
    assert.equal(target.scopeStale, true); assert.equal(target.needsRerun, true);
    assert.equal(target.searching, false, 'rollback events do not silently rerun');
    assert.match(target.notice, /unverified.*Rerun/);
    assert.equal(source.panels.size, 1);
  });
}
for (const destination of ['confirm', 'new', 'same']) for (const phase of ['reveal', 'close']) {
  for (const field of ['query', 'replacement']) test(`accepted ${field} during ${destination} transfer ${phase} cancels without discarding its ACK`, async t => {
    const f = fixture(t), { source, target } = transferFixture(f, destination);
    const hold = deferred();
    if (phase === 'reveal') f.controller.findTree.show = () => hold.promise;
    else f.controller.closeModalEditors = () => hold.promise;
    const moving = f.controller.openFindWindow(source, destination === 'new');
    await tick();
    await f.controller.message(source, { type: 'update', clientId: 'race', revision: 1,
      patch: { [field]: 'accepted-value' } });
    clearTimeout(source.timer);
    hold.resolve(true);
    await assert.rejects(moving, /changed or was closed/);
    assert.equal(source.patchAcks.get('race'), 1);
    assert.equal(source[field], 'accepted-value');
    if (field === 'query') assert.equal(source.results.length, 0);
    assert.equal(source.panels.size, 1);
    assert.equal(source.layout, 'modal');
    assert.equal(f.controller.sessions.get(source.id), source);
    assert.equal(source.transferring, undefined);
    if (target) { assert.equal(target.query, 'cat'); assert.equal(target.replacement, ''); }
    if (destination === 'new') assert.equal(f.controller.sessions.size, 1, 'no abandoned destination');
  });
  for (const settlement of ['resolve', 'reject']) test(`closed ${destination} destination during ${phase}/${settlement} never reappears in native provider`, async t => {
    const f = fixture(t), { source, target } = transferFixture(f, destination);
    const hold = deferred();
    if (phase === 'reveal') f.controller.findTree.show = () => hold.promise;
    else f.controller.closeModalEditors = () => hold.promise;
    const moving = f.controller.openFindWindow(source, destination === 'new');
    await tick();
    const window = target || (destination === 'same' ? source : [...f.controller.sessions.values()].find(s => s !== source));
    f.controller.closeFindSearch(window);
    const focusCount = f.commands.filter(command => command[0] === 'jbsearch.results.focus').length;
    hold[settlement](settlement === 'reject' ? new Error('late reveal failure') : true);
    await assert.rejects(moving, /changed or was closed|late reveal failure/);
    assert.equal(f.controller.sessions.has(window.id), false);
    assert.equal(f.controller.findTree.sessions.has(window.id), false);
    assert.notEqual(f.controller.currentId, window.id);
    assert.equal(f.commands.filter(command => command[0] === 'jbsearch.results.focus').length, focusCount);
  });
  test(`controller disposal during ${destination} transfer ${phase} suppresses all late publication`, async t => {
    const f = fixture(t), { source } = transferFixture(f, destination);
    const hold = deferred();
    if (phase === 'reveal') f.controller.findTree.show = () => hold.promise;
    else f.controller.closeModalEditors = () => hold.promise;
    const moving = f.controller.openFindWindow(source, destination === 'new');
    await tick(); f.controller.dispose();
    const count = f.commands.length;
    hold.resolve(true);
    await assert.rejects(moving, /changed or was closed/);
    assert.equal(f.controller.findTree.sessions.size, 0);
    assert.equal(f.commands.length, count);
    assert.equal(source.transferring, undefined);
  });
}

test('busy controller refresh sends an explicit matching refusal without resetting its generation', async t => {
  const f = fixture(t), s = f.session(); s.layout = 'modal'; const panel = f.panel(s);
  const generation = s.generation; s.replacing = true;
  await f.controller.message(s, { type: 'refresh', generation, requestId: 'client:rerun:1' });
  assert.equal(s.generation, generation);
  assert.deepEqual(panel.messages.at(-1), { type: 'refreshRejected', generation, requestId: 'client:rerun:1' });
  s.replacing = false;
  await f.controller.message(s, { type: 'refresh', generation, requestId: 'client:rerun:2' });
  clearTimeout(s.timer);
  assert.equal(s.generation, generation + 1);
});

for (const command of ['jbsearch.findInFiles', 'jbsearch.replaceInFiles']) for (const phase of ['retained', 'opening']) {
  test(`global ${command} during ${phase} review never discovers through the frozen model`, async t => {
    const f = fixture(t), source = f.session('cat', {}, 'replace');
    const searches = [], search = f.controller.search.bind(f.controller);
    f.controller.search = session => { searches.push(session.id); return search(session); };
    const fs = require('node:fs'), vm = require('node:vm');
    const entry = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/extension'), 'utf8'), {
      module: entry,
      require: id => id === 'vscode' ? f.v : { SearchController: class { constructor() { return f.controller; } } }
    });
    entry.exports.activate({ subscriptions: [] });
    const hold = deferred(), execute = f.v.commands.executeCommand;
    if (phase === 'opening') f.v.commands.executeCommand = async (...args) => {
      const value = await execute(...args);
      if (args[0] === '_workbench.openWith' && args[1].query === 'review=1') await hold.promise;
      return value;
    };
    const reviewing = f.controller.replace(source, true, { generation: source.generation });
    await tick();
    const review = f.controller.sessions.get(source.reviewId);
    assert.ok(review?.reviewOnly);
    const semantic = JSON.stringify({ query: review.query, replacement: review.replacement,
      mode: review.mode, generation: review.generation, results: review.results });
    const binding = f.controller.snapshot(review).actionBinding;
    f.document.text = 'cat! cat! cat!'; f.document.version++;
    await f.nativeCommands.get(command)();
    const ordinary = f.controller.sessions.get(f.controller.currentId);
    assert.notEqual(ordinary, review); assert.equal(ordinary.reviewOnly, undefined);
    clearTimeout(ordinary.timer); await f.controller.search(ordinary);
    assert.equal(ordinary.results.length, 3);
    f.controller.schedule(review, 0); f.controller.resetSearch(review); await search(review);
    assert.equal(review.timer, undefined);
    assert.equal(searches.includes(review.id), false, 'ordinary discovery never receives the review session');
    assert.equal(JSON.stringify({ query: review.query, replacement: review.replacement,
      mode: review.mode, generation: review.generation, results: review.results }), semantic);
    assert.equal(f.controller.snapshot(review).actionBinding, binding);
    hold.resolve(true); await reviewing;
    assert.equal(f.controller.sessions.get(review.id), review);
  });
}

for (const adapter of ['modal', 'native']) for (const outcome of ['false', 'reject', 'success']) {
  for (const transition of ['reset', 'reopen', 'close']) test(`late ${outcome} apply through ${adapter} after ${transition} releases only its real lock`, async t => {
    const f = fixture(t), s = f.session('cat', {}, 'replace');
    f.controller.selectAutomatic = async () => {}; // Presentation is not under test here.
    const errors = []; f.v.window.showErrorMessage = message => errors.push(message);
    const hold = deferred(); let dispatched = 0;
    f.v.workspace.applyEdit = () => { dispatched++; return hold.promise; };
    let view, delivery;
    const oldGeneration = s.generation;
    if (adapter === 'modal') {
      s.layout = 'modal'; view = f.panel(s);
      view.callbacks.message({ type: 'replaceAll', generation: s.generation,
        actionBinding: f.controller.snapshot(s).actionBinding });
    } else {
      f.controller.findTree.update(f.controller.snapshot(s), { activate: true });
      const node = f.controller.findTree.sessions.get(s.id).tree.byResultId.get(s.selectedId);
      delivery = f.nativeCommands.get('jbsearch.results.replaceAll')(node);
    }
    await until(() => dispatched === 1);
    assert.equal(s.replacing, true);
    let fresh = s;
    if (transition === 'close') {
      if (adapter === 'modal') view.dispose();
      else f.controller.dispose();
    } else if (transition === 'reopen') {
      await f.controller.show('replace');
      fresh = f.controller.sessions.get(f.controller.currentId);
      clearTimeout(fresh.timer); await f.controller.search(fresh);
    } else {
      s.query = 'cat!'; f.controller.resetSearch(s); await f.controller.search(s);
    }
    if (transition !== 'close') {
      assert.ok(fresh.generation > oldGeneration || fresh !== s);
      assert.equal(fresh.error, ''); assert.equal(fresh.needsRerun, false);
      fresh.notice = 'Fresh generation status';
    }
    assert.equal(s.replacing, true, 'reset/caller abort cannot release an already dispatched edit');
    if (outcome === 'reject') hold.reject(new Error('synthetic old apply rejection'));
    else hold.resolve(outcome === 'success');
    if (delivery) await delivery;
    await until(() => !s.replacing); await tick();
    assert.equal(dispatched, 1);
    if (transition !== 'close') {
      assert.equal(fresh.error, ''); assert.equal(fresh.needsRerun, false);
      assert.equal(fresh.notice, 'Fresh generation status');
    }
    if (transition === 'close' && adapter === 'native') assert.equal(f.controller.findTree.sessions.size, 0);
    if (outcome !== 'success' && transition !== 'close' && (fresh === s || adapter === 'modal'))
      assert.ok(errors.some(message => /earlier submitted|synthetic old|No success/.test(message)), 'old failure is separate, not current search state');
  });
}

test('controller modal INVALID inspection passes the configured bound to the actual preview renderer', async t => {
  const { PreviewProvider } = require('../src/preview');
  const f = fixture(t), s = f.session(); s.layout = 'modal'; f.panel(s);
  s.results = s.results.map(row => ({ ...row, invalid: true }));
  const provider = new PreviewProvider(f.v, f.controller.context);
  provider.load = async () => ({ registry: { getColorMap: () => [] }, languages: new Map() });
  f.controller.preview = provider;
  let reads = 0;
  Object.assign(f.document, { positionAt: () => ({ line: 0, character: 1000000000 }),
    offsetAt: position => position.character, getText() { reads++; throw new Error('UNBOUNDED_READ_REQUESTED'); } });
  await f.controller.select(s, s.selectedId);
  assert.equal(reads, 0);
  assert.match(s.notice, /Preview unavailable:.*size limit/);
  assert.ok(s.results.every(row => row.invalid));
});

for (const destination of ['confirm', 'new', 'same']) for (const phase of ['reveal', 'close']) {
  test(`explicit Rerun of ${destination} destination during ${phase} preserves the accepted generation`, async t => {
    const f = fixture(t), { source, target } = transferFixture(f, destination);
    const hold = deferred();
    if (phase === 'reveal') f.controller.findTree.show = () => hold.promise;
    else f.controller.closeModalEditors = () => hold.promise;
    const moving = f.controller.openFindWindow(source, destination === 'new');
    await tick();
    const window = target || (destination === 'same' ? source : [...f.controller.sessions.values()].find(s => s !== source));
    const before = window.generation;
    await f.controller.message(window, { type: 'refresh', generation: before });
    clearTimeout(window.timer);
    assert.equal(window.generation, before + 1);
    hold.resolve(true);
    await assert.rejects(moving, /changed or was closed/);
    assert.equal(window.generation, before + 1);
    assert.deepEqual(window.results, []);
    assert.equal(f.controller.sessions.get(window.id), window);
    assert.equal(source.panels.size, 1, 'an obsolete transfer cannot dispose its source');
    if (destination === 'same') assert.equal(f.controller.findTree.sessions.has(source.id), false);
    else assert.equal(f.controller.findTree.state.query, 'cat');
  });
}

test('a disposed modal delivery adapter cannot dispatch a retained same-generation action', async t => {
  const f = fixture(t), s = f.session('cat', {}, 'replace'); s.layout = 'modal';
  const view = f.panel(s), actionBinding = f.controller.snapshot(s).actionBinding;
  let applied = 0; f.v.workspace.applyEdit = async () => { applied++; return true; };
  view.dispose();
  assert.equal(f.controller.sessions.get(s.id), s, 'ordinary modal close may retain its hidden query session');
  view.callbacks.message({ type: 'replaceAll', generation: s.generation, actionBinding });
  await tick();
  assert.equal(applied, 0);
  assert.equal(s.replacing, undefined);
  assert.equal(s.reviewId, undefined);
});

// Keep the actual FindTree/show/close/custom-editor/event routes. Only the
// synthetic host's final focus or rollback-open promise is held.
function holdRollbackHost(f, source, newTab, phase) {
  // session() supplies a native completed fixture; an actual modal source has
  // no pre-existing provider entry before the production transfer installs it.
  if (source.layout === 'modal') f.controller.findTree.remove(source.id);
  const reached = deferred(), hold = deferred();
  const execute = f.v.commands.executeCommand;
  let focusCalls = 0, reopenUri;
  f.v.commands.executeCommand = async (...args) => {
    if (args[0] === 'jbsearch.results.focus' && ++focusCalls === 2) {
      if (phase === 'focus') { reached.resolve(); return hold.promise; }
      throw new Error('synthetic final focus failure');
    }
    if (args[0] === '_workbench.openWith') {
      reopenUri = args[1];
      if (phase === 'reopen') { reached.resolve(); await hold.promise; }
    }
    return execute(...args);
  };
  const moving = f.controller.openFindWindow(source, newTab);
  const failure = assert.rejects(moving, /synthetic final focus failure|changed or was closed/);
  return { reached: reached.promise, moving, failure, get reopenUri() { return reopenUri; },
    release() { if (phase === 'focus') hold.reject(new Error('synthetic final focus failure')); else hold.resolve(); } };
}
for (const destination of ['confirm', 'new', 'same']) for (const phase of ['focus', 'reopen']) {
  for (const event of ['close', 'watcher', 'edit', 'static']) test(`rollback ${destination} retains source ${event} history during ${phase}`, async t => {
    const f = fixture(t), { source } = transferFixture(f, destination);
    const ids = source.results.map(row => row.id), epoch = source.scopeEventRevision;
    const oldBinding = f.controller.snapshot(source).actionBinding;
    let scheduled = 0;
    const schedule = f.controller.schedule.bind(f.controller);
    f.controller.schedule = (...args) => { scheduled++; return schedule(...args); };
    const control = holdRollbackHost(f, source, destination === 'new', phase);
    try {
      await control.reached;
      assert.equal(source.panels.size, 0, 'production admitted close disposed the original source panel');
      assert.ok(f.controller.activeSession(source), 'temporary source event coverage includes zero-panel owner');
      if (event === 'close') { f.document.isClosed = true; f.events.close(f.document); }
      else if (event === 'watcher') { f.document.version++; f.events.fileChange(f.document.uri); }
      else if (event === 'edit') f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
      const delivered = source.scopeEventRevision;
      if (event !== 'static') assert.ok(delivered > epoch);
      control.release(); await control.failure;
      assert.equal(source.panels.size, 1);
      assert.equal(source.layout, 'modal');
      assert.deepEqual(source.results.map(row => row.id), ids);
      assert.ok(source.scopeEventRevision >= delivered);
      assert.equal(scheduled, 0, 'source events and rollback never silently rerun a completed snapshot');
      assert.equal(f.controller.transferEventSources?.get(source), undefined);
      assert.equal(f.controller.modalRestores?.size || 0, 0);
      assert.notEqual(f.controller.snapshot(source).actionBinding?.snapshotToken, oldBinding.snapshotToken);
      if (event === 'close') {
        assert.ok(source.results.every(row => row.identityUnknown && row.invalid && !row.pending));
        assert.equal(source.validations?.size || 0, 0);
      } else if (event === 'watcher') {
        await f.validate(source);
        assert.ok(source.results.every(row => row.identityUnknown && row.invalid && !row.pending));
      } else if (event === 'edit') {
        assert.deepEqual(source.results.map(row => row.offset), [7, 12]);
        assert.ok(source.results.every(row => row.pending && !row.identityUnknown));
        await f.validate(source);
        assert.ok(source.results.every(row => !row.pending && !row.invalid && !row.identityUnknown));
      } else {
        assert.equal(source.scopeEventRevision, epoch);
        assert.equal(source.scopeStale, false);
        assert.ok(source.results.every(row => !row.pending && !row.invalid));
      }
      if (event !== 'static') assert.equal(source.scopeStale, true);
      assert.ok(control.reopenUri.query.includes('restore='));
      assert.throws(() => f.controller.openCustomDocument(control.reopenUri), /closed or changed/,
        'a settled rollback resource cannot be reused to recreate a source');
    } finally { control.release(); await control.moving.catch(() => {}); }
  });
}
for (const destination of ['confirm', 'new']) for (const phase of ['focus', 'reopen']) {
  test(`rollback ${destination} source pending check keeps its original deadline through ${phase}`, async t => {
    const f = fixture(t), { source } = transferFixture(f, destination);
    f.controller.queueValidation(source, sourceUri.toString(), 1000);
    const original = source.validations.get(sourceUri.toString());
    const control = holdRollbackHost(f, source, destination === 'new', phase);
    try {
      await control.reached;
      f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
      const current = source.validations.get(sourceUri.toString());
      assert.equal(current.firstQueued, original.firstQueued);
      assert.equal(current.deadline, original.deadline);
      control.release(); await control.failure;
      assert.equal(source.validations.get(sourceUri.toString()), current);
      await f.validate(source);
      assert.ok(source.results.every(row => !row.invalid && !row.pending));
    } finally { control.release(); await control.moving.catch(() => {}); }
  });
}
for (const destination of ['confirm', 'new']) for (const ending of ['error', 'no provider', 'close', 'dispose']) {
  test(`rollback ${destination} reopen ${ending} cannot leave live late resource admission`, async t => {
    const f = fixture(t), { source } = transferFixture(f, destination), errors = [];
    f.v.window.showErrorMessage = message => { errors.push(message); };
    const control = holdRollbackHost(f, source, destination === 'new', 'reopen');
    try {
      await control.reached;
      if (ending === 'dispose') f.controller.dispose();
      if (ending === 'error' || ending === 'no provider') {
        // The already submitted host call is still held; its continuation below
        // deliberately bypasses or rejects provider resolution.
        f.controller.openCustomDocument = () => {
          if (ending === 'error') throw new Error('synthetic rollback open failure');
          return { session: source };
        };
        if (ending === 'no provider') f.controller.resolveCustomEditor = () => {};
      }
      if (ending === 'close') {
        const document = f.controller.openCustomDocument(control.reopenUri);
        const panel = f.panel(source);
        panel.dispose();
        let disposed = false;
        f.controller.resolveCustomEditor(document, { dispose() { disposed = true; } });
        assert.equal(disposed, true, 'a document resolved before Close cannot attach afterward');
      }
      control.release(); await control.failure;
      assert.equal(source.panels.size, 0);
      assert.equal(f.controller.findTree.sessions.has(source.id), false);
      assert.equal(f.controller.transferEventSources?.get(source), undefined);
      assert.equal(f.controller.modalRestores?.size || 0, 0);
      assert.equal(source.validations?.size || 0, 0);
      assert.notEqual(f.controller.currentId, source.id);
      if (ending === 'error') assert.ok(errors.some(message => /rollback open failure/.test(message)));
      // Restore the actual admission method before checking the expired resource.
      f.controller.openCustomDocument = SearchController.prototype.openCustomDocument;
      assert.throws(() => f.controller.openCustomDocument(control.reopenUri), /closed|changed/);
    } finally { control.release(); await control.moving.catch(() => {}); }
  });
}
for (const action of ['query', 'refresh']) test(`accepted source ${action} during rollback reopening is not overwritten`, async t => {
  const f = fixture(t), { source } = transferFixture(f, 'new');
  const control = holdRollbackHost(f, source, true, 'reopen');
  try {
    await control.reached;
    if (action === 'query') await f.controller.message(source, { type: 'update', clientId: 'rollback', revision: 1,
      patch: { query: 'accepted query' } });
    else await f.controller.message(source, { type: 'refresh', generation: source.generation });
    clearTimeout(source.timer);
    const generation = source.generation;
    control.release(); await control.failure;
    assert.equal(source.generation, generation);
    assert.deepEqual(source.results, []);
    assert.equal(source.panels.size, 1);
    if (action === 'query') { assert.equal(source.query, 'accepted query'); assert.equal(source.patchAcks.get('rollback'), 1); }
  } finally { control.release(); await control.moving.catch(() => {}); }
});
