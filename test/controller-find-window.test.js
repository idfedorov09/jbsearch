'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
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
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
const output = (results) => ({ results, truncated: false, stats: { errors: [], skippedFiles: 0 } });

function fixture(t, engine = new SearchEngine()) {
  const events = {}, commands = [], previews = [], nativeCommands = new Map();
  const listen = name => callback => {
    events[name] = callback;
    return { dispose() {} };
  };
  const document = {
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
        reveal: async (node) => { events.revealedNode = node; },
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
      active: true, visible: true, viewColumn: column,
      webview: { postMessage() {}, onDidReceiveMessage: callback => { callbacks.message = callback; } },
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
      contentHash: createHash('sha256').update(document.text).digest('hex')
    })];
  }
  function session(query = 'cat', options = {}, mode = 'find') {
    const result = controller.create(mode);
    Object.assign(result, { layout: 'findWindow', query, options: { ...result.options, ...options },
      scope: { kind: 'openEditors' }, results: matches(query, options) });
    result.selectedId = result.results[0]?.id;
    controller.findTree.update(controller.snapshot(result), { activate: true });
    return result;
  }
  function change(changes) {
    for (const item of [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset))
      document.text = document.text.slice(0, item.rangeOffset) + item.text + document.text.slice(item.rangeOffset + item.rangeLength);
    document.version++;
    document.isDirty = true;
    events.document({ document, contentChanges: changes });
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
  assert.ok(s.results.every(result => result.pending));
  f.v.workspace.openTextDocument = () => assert.fail('unsafe replace must not open any document');
  await assert.rejects(() => f.controller.replace(s, true, { generation: s.generation }), /still being checked/);
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

test('document edits while a snapshot is still being built restart that search and reject its late batches', async t => {
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
  assert.deepEqual(s.results, []);
  assert.equal(s.searching, true, 'the new generation remains pending');
});

test('finished Find snapshots ignore Open Editors tab churn and query setting changes', t => {
  const f = fixture(t), s = f.session(), ids = s.results.map(result => result.id);
  f.events.tabs({ opened: [{ input: new f.v.TabInputText(sourceUri) }], closed: [], changed: [] });
  f.events.configuration({ affectsConfiguration: section => section === 'jbsearch' });
  f.events.fileCreate(uriFor('file:///workspace/new.js'));
  assert.equal(s.timer, undefined);
  assert.deepEqual(s.results.map(result => result.id), ids);
});

test('Find replacements use revalidated captures and remain as INVALID until rerun', async t => {
  const f = fixture(t), s = f.session('(cat)', { regex: true }, 'replace');
  s.replacement = '$1-dog';
  f.change([{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }]);
  await f.validate(s);
  const ids = s.results.map(result => result.id);
  await f.controller.replace(s, true, { generation: s.generation });
  await f.validate(s);
  assert.equal(f.document.text, 'prefix cat-dog! cat-dog!');
  assert.equal(f.document.isDirty, true);
  assert.deepEqual(s.results.map(result => result.id), ids);
  assert.ok(s.results.every(result => result.invalid));
  await assert.rejects(() => f.controller.replace(s, false, { id: ids[0], generation: s.generation }), /INVALID/);
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
    scope: { kind: 'custom', name: 'Sources' }, results: f.matches('cat!') });
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
  await f.controller.message(s, { type: 'select', id: s.results[0].id });
  const shown = f.previews.filter(item => item[0] === 'show').length;
  f.change([{ rangeOffset: 0, rangeLength: 0, text: '\n' }]);
  f.events.theme();
  await f.validate(s);
  assert.equal(f.previews.filter(item => item[0] === 'show').length, shown);
  assert.ok(f.previews.some(item => item[0] === 'update'));
  await f.controller.message(s, { type: 'openResult', id: s.results[0].id });
  assert.deepEqual(f.previews.filter(item => item[0] === 'show').at(-1).at(-1), { preserveFocus: false });
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
  await f.controller.message(background, { type: 'select', id: background.selectedId });
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
  s.selectedId = s.results[0].id;
  const source = f.panel(s, undefined);
  await f.controller.openFindWindow(s, false);
  assert.equal(f.controller.sessions.get(s.id), s);
  assert.equal(s.query, 'cat');
  assert.equal(s.results.length, 2);
  assert.equal(s.panels.size, 0);
  assert.equal(f.controller.findTree.activeId, s.id);
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
  f.change([{ rangeOffset: 0, rangeLength: 1, text: 'b' }]);
  await f.controller.message(target, { type: 'editSearch' });
  const draft = f.controller.sessions.get(f.controller.currentId);
  const execute = f.v.commands.executeCommand;
  f.v.commands.executeCommand = async (...args) => {
    if (args[0] === 'jbsearch.results.focus') throw new Error('Open failed');
    return execute(...args);
  };
  await assert.rejects(() => f.controller.openFindWindow(draft, false), /Open failed/);
  assert.ok(target.results.every(result => result.pending));
  assert.equal(target.validations.size, 1, 'rollback must resume the cancelled checks');
  await f.validate(target);
  assert.deepEqual(target.results.map(result => Boolean(result.invalid)), [true, false]);
  assert.ok(target.results.every(result => !result.pending));
});

test('a reveal failure after native focus restores the disposed modal and its draft owner', async t => {
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
  f.controller.findTree.view.reveal = async () => { throw new Error('Reveal failed'); };
  await assert.rejects(() => f.controller.openFindWindow(draft, false), /Reveal failed/);
  assert.equal(f.controller.sessions.get(draft.id), draft);
  assert.equal(draft.layout, 'modal');
  assert.equal(draft.panels.size, 1, 'a rolled-back search must remain reachable in a real modal');
  assert.equal(f.controller.currentId, draft.id);
  assert.equal(target.draftId, draft.id);
  assert.equal(f.controller.findTree.activeId, target.id);
  assert.equal(target.query, 'cat');
});

test('native selection opens a central source only on user action, including occurrence navigation', async t => {
  const f = fixture(t), s = f.session();
  await f.controller.findTree.show(s.id);
  assert.equal(f.previews.filter(item => item[0] === 'show').length, 0);
  await f.nativeCommands.get('jbsearch.results.select')(s.id, s.results[0].id);
  let call = f.previews.filter(item => item[0] === 'show').at(-1);
  assert.equal(call[1].id, s.results[0].id);
  assert.deepEqual(call.at(-1), { preserveFocus: true });
  await f.nativeCommands.get('jbsearch.results.next')();
  assert.equal(s.selectedId, s.results[1].id);
  await f.nativeCommands.get('jbsearch.results.openResult')();
  call = f.previews.filter(item => item[0] === 'show').at(-1);
  assert.equal(call[1].id, s.results[1].id);
  assert.deepEqual(call.at(-1), { preserveFocus: false });
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

test('changing rooted configuration or workspace during a search discards late batches but preserves finished snapshots', async t => {
  const f = fixture(t);
  const s = f.session();
  s.scope = { kind: 'custom', name: 'API' };
  const savedRows = s.results;
  f.events.configuration({ affectsConfiguration: section => section === 'jbsearch' });
  f.events.folders({ added: [], removed: [] });
  assert.equal(s.results, savedRows, 'completed snapshots remain frozen');
  assert.equal(s.timer, undefined);
  for (const trigger of [
    () => f.events.configuration({ affectsConfiguration: section => section === 'jbsearch' }),
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
    assert.ok(s.generation > oldGeneration);
    const stale = f.matches();
    batch(stale);
    finish(output(stale));
    await searching;
    assert.deepEqual(s.results, [], 'results from a previous root must be discarded');
  }
});
