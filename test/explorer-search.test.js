'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SearchController } = require('../src/controller');

function uriFor(value) {
  const parsed = new URL(value);
  return {
    scheme: parsed.protocol.slice(0, -1), path: decodeURIComponent(parsed.pathname),
    fsPath: decodeURIComponent(parsed.pathname), toString: () => value
  };
}

const rootUri = uriFor('file:///workspace');
const selectedUri = uriFor('file:///workspace/chosen%20folder');

function fixture() {
  const errors = [], opened = [], scheduled = [], inspected = [], notifications = [];
  const controller = Object.create(SearchController.prototype);
  const config = { get: (_key, fallback) => fallback };
  Object.assign(controller, {
    sessions: new Map(), currentId: null, disposed: false,
    notify: session => notifications.push(session.id),
    schedule: session => scheduled.push(session.id),
    v: {
      version: '1.143.1',
      Uri: { parse: uriFor },
      FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
      workspace: {
        getConfiguration: () => config,
        getWorkspaceFolder(uri) {
          if (uri?.scheme === 'file' &&
              (uri.fsPath === '/workspace' || uri.fsPath.startsWith('/workspace/')))
            return { uri: rootUri, name: 'Project' };
          return undefined;
        },
        asRelativePath(uri, includeRoot) {
          assert.equal(includeRoot, true);
          return 'Project/' + uri.fsPath.slice('/workspace/'.length);
        },
        fs: { stat: async uri => { inspected.push(uri); return { type: 2 }; } }
      },
      window: {
        activeTextEditor: undefined,
        showErrorMessage: message => { errors.push(message); },
        showInformationMessage: async () => undefined
      },
      commands: { executeCommand: async (...args) => { opened.push(args); } }
    }
  });
  const session = controller.create('replace');
  Object.assign(session, {
    query: 'needle', replacement: 'replacement',
    results: [{ id: 'existing-result' }], selectedId: 'existing-result',
    abort: new AbortController()
  });
  return { controller, session, errors, opened, scheduled, inspected, notifications };
}

function snapshot(controller) {
  return {
    currentId: controller.currentId,
    sessions: [...controller.sessions.values()].map(session => ({
      id: session.id, uri: session.uri.toString(), mode: session.mode, layout: session.layout,
      query: session.query, replacement: session.replacement, options: { ...session.options },
      scope: { ...session.scope }, results: [...session.results], generation: session.generation,
      selectedId: session.selectedId, targetWindowId: session.targetWindowId,
      draftId: session.draftId, aborted: session.abort?.signal.aborted
    }))
  };
}

function assertUnchanged(f, before, scope, results) {
  assert.deepEqual(snapshot(f.controller), before);
  assert.equal(f.session.scope, scope);
  assert.equal(f.session.results, results);
  assert.equal(f.opened.length, 0);
  assert.equal(f.scheduled.length, 0);
  assert.equal(f.notifications.length, 0);
}

test('invalid Explorer arguments never broaden or mutate the current search', async t => {
  const cases = [
    ['missing URI', undefined],
    ['null URI', null],
    ['empty Explorer context', {}],
    ['a path string instead of a URI', '/workspace/chosen folder'],
    ['empty filesystem path', { scheme: 'file', fsPath: '' }],
    ['outside the workspace', uriFor('file:///outside/folder')],
    ['a sibling sharing the workspace prefix', uriFor('file:///workspace-other/folder')],
    ['a virtual filesystem folder', uriFor('memfs:/workspace/folder')],
    ['an untransformed remote URI', uriFor('vscode-remote://another-host/workspace/folder')],
    ['an ordinary file', selectedUri, async () => ({ type: 1 })],
    ['an unknown resource type', selectedUri, async () => ({ type: 0 })],
    ['a symbolic link without Directory flag', selectedUri, async () => ({ type: 64 })]
  ];
  for (const [name, uri, stat] of cases) await t.test(name, async () => {
    const f = fixture();
    const before = snapshot(f.controller), scope = f.session.scope, results = f.session.results;
    if (stat) f.controller.v.workspace.fs.stat = stat;
    await f.controller.showInDirectory(uri);
    assert.equal(f.errors.length, 1);
    assert.match(f.errors[0], /JB Search/);
    assertUnchanged(f, before, scope, results);
  });
});

test('filesystem errors preserve the previous search instead of falling back to the project', async t => {
  for (const message of ['Folder no longer exists', 'EACCES: permission denied'])
    await t.test(message, async () => {
      const f = fixture();
      const before = snapshot(f.controller), scope = f.session.scope, results = f.session.results;
      f.controller.v.workspace.fs.stat = async () => { throw new Error(message); };
      await f.controller.showInDirectory(selectedUri);
      assert.equal(f.errors.length, 1);
      assert.ok(f.errors[0].includes(message));
      assertUnchanged(f, before, scope, results);
    });
});

test('invalid context does not create a modal when there is no active search', async () => {
  const f = fixture();
  f.controller.sessions.clear();
  f.controller.currentId = null;
  const before = snapshot(f.controller);
  await f.controller.showInDirectory({});
  assert.equal(f.errors.length, 1);
  assert.deepEqual(snapshot(f.controller), before);
  assert.equal(f.opened.length, 0);
  assert.equal(f.scheduled.length, 0);
});

test('Directory is a FileType flag and the original Explorer URI reaches stat unchanged', async () => {
  const f = fixture(), calls = [];
  f.controller.v.workspace.fs.stat = async uri => { f.inspected.push(uri); return { type: 2 | 64 }; };
  f.controller.show = async (...args) => { calls.push(args); };
  await f.controller.showInDirectory(selectedUri);
  assert.deepEqual(f.errors, []);
  assert.equal(f.inspected[0], selectedUri);
  assert.deepEqual(calls, [['find', {
    kind: 'directory', directory: '/workspace/chosen folder', path: '/workspace/chosen folder',
    label: 'Project/chosen folder'
  }]]);
});

test('a running replacement blocks the directory entry point for modal, saved search, and gear draft', async t => {
  for (const source of ['modal', 'saved search', 'gear draft']) await t.test(source, async () => {
    const f = fixture();
    if (source === 'saved search') f.session.layout = 'findWindow';
    if (source === 'gear draft') {
      const owner = f.controller.create('replace', f.session);
      owner.layout = 'findWindow';
      owner.replacing = true;
      owner.draftId = f.session.id;
      f.session.targetWindowId = owner.id;
      f.controller.currentId = f.session.id;
    } else f.session.replacing = true;
    const before = snapshot(f.controller), scope = f.session.scope, results = f.session.results;
    await f.controller.showInDirectory(selectedUri);
    assert.equal(f.errors.length, 1);
    assert.match(f.errors[0], /replace|replacement/i);
    assertUnchanged(f, before, scope, results);
  });
});

test('replacement starting during directory validation is still protected before opening', async () => {
  const f = fixture();
  let release;
  f.controller.v.workspace.fs.stat = () => new Promise(resolve => { release = resolve; });
  const running = f.controller.showInDirectory(selectedUri);
  f.session.replacing = true;
  const before = snapshot(f.controller), scope = f.session.scope, results = f.session.results;
  release({ type: 2 });
  await running;
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /replace|replacement/i);
  assertUnchanged(f, before, scope, results);
});

test('a slower earlier folder validation cannot replace the most recently chosen directory', async () => {
  const f = fixture(), calls = [];
  const first = uriFor('file:///workspace/earlier'), last = uriFor('file:///workspace/latest');
  let release;
  f.controller.v.workspace.fs.stat = uri => uri === first
    ? new Promise(resolve => { release = resolve; })
    : Promise.resolve({ type: 2 });
  f.controller.show = async (...args) => { calls.push(args); };
  const earlier = f.controller.showInDirectory(first);
  await f.controller.showInDirectory(last);
  release({ type: 2 });
  await earlier;
  assert.deepEqual(f.errors, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].directory, last.fsPath);
});

test('an obsolete filesystem error is not shown over a newer successful folder request', async () => {
  const f = fixture(), calls = [];
  const first = uriFor('file:///workspace/earlier'), last = uriFor('file:///workspace/latest');
  let reject;
  f.controller.v.workspace.fs.stat = uri => uri === first
    ? new Promise((_resolve, fail) => { reject = fail; })
    : Promise.resolve({ type: 2 });
  f.controller.show = async (...args) => { calls.push(args); };
  const earlier = f.controller.showInDirectory(first);
  await f.controller.showInDirectory(last);
  reject(new Error('The earlier folder disappeared'));
  await earlier;
  assert.deepEqual(f.errors, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].directory, last.fsPath);
});

test('a pending directory validation cannot open or mutate a disposed controller', async () => {
  const f = fixture();
  let release;
  f.controller.v.workspace.fs.stat = () => new Promise(resolve => { release = resolve; });
  const running = f.controller.showInDirectory(selectedUri);
  f.controller.disposed = true;
  const before = snapshot(f.controller), scope = f.session.scope, results = f.session.results;
  release({ type: 2 });
  await running;
  assert.deepEqual(f.errors, []);
  assertUnchanged(f, before, scope, results);
});
