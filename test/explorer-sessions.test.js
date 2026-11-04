'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SearchController } = require('../src/controller');

function uriFor(value) {
  const parsed = new URL(value);
  return {
    scheme: parsed.protocol.slice(0, -1), path: decodeURIComponent(parsed.pathname),
    fsPath: decodeURIComponent(parsed.pathname), toString: () => value
  };
}
const directoryUri = (directory) => uriFor(`file://${encodeURI(directory)}`);
const turn = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const roots = ['/workspace', '/second root'].map((directory, index) => ({
    uri: directoryUri(directory), name: index ? 'Second' : 'Project'
  }));
  const folders = new Set([
    '/workspace', '/workspace/src', '/workspace/src/nested \u043f\u0430\u043f\u043a\u0430',
    '/workspace/src-other', '/second root', '/second root/chosen folder'
  ]);
  const opened = [], errors = [], scheduled = [], inspected = [];
  const controller = Object.create(SearchController.prototype);
  const config = { get: (_key, fallback) => fallback };
  const workspaceFolder = uri => roots.find(root =>
    uri?.scheme === 'file' && (uri.fsPath === root.uri.fsPath || uri.fsPath.startsWith(`${root.uri.fsPath}/`))
  );
  controller.v = {
    version: '1.143.1',
    FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
    Uri: { parse: uriFor, isUri: uri => Boolean(uri && typeof uri.toString === 'function' && uri.scheme && uri.path) },
    workspace: {
      workspaceFolders: roots,
      getConfiguration: () => config,
      getWorkspaceFolder: workspaceFolder,
      asRelativePath(uri, includeWorkspaceFolder) {
        assert.equal(includeWorkspaceFolder, true);
        const root = workspaceFolder(uri);
        return `${root.name}/${path.posix.relative(root.uri.fsPath, uri.fsPath)}`.replace(/\/$/, '');
      },
      fs: {
        async stat(uri) {
          inspected.push(uri);
          return { type: folders.has(uri.fsPath) ? 2 : 1 };
        }
      }
    },
    window: {
      activeTextEditor: undefined,
      showErrorMessage: message => { errors.push(message); },
      showInformationMessage: async () => undefined
    },
    commands: { executeCommand: async (...args) => { opened.push(args); } }
  };
  Object.assign(controller, {
    sessions: new Map(), currentId: null, disposed: false,
    notify() {},
    schedule(session, delay) {
      SearchController.prototype.schedule.call(this, session, delay);
      clearTimeout(session.timer);
      scheduled.push({ session, scope: { ...session.scope } });
    }
  });
  const session = controller.create();
  Object.assign(session, {
    query: 'needle', replacement: 'replacement',
    options: { ...session.options, caseSensitive: true, regex: true, maskEnabled: true, mask: '*.bl' },
    results: [{ id: 'old', uri: 'file:///workspace/old.bl' }], selectedId: 'old'
  });
  t.after(() => {
    controller.disposed = true;
    for (const item of controller.sessions.values()) {
      clearTimeout(item.timer);
      item.abort?.abort();
      controller.cancelValidations(item);
    }
  });
  return { controller, session, opened, errors, scheduled, inspected, roots };
}

test('Explorer opens the selected nested directory before rendering and retains query options', async t => {
  const f = fixture(t), folder = directoryUri('/workspace/src/nested \u043f\u0430\u043f\u043a\u0430');
  const options = { ...f.session.options };
  const previousAbort = new AbortController();
  f.session.abort = previousAbort;
  f.controller.v.commands.executeCommand = async (...args) => {
    f.opened.push(args);
    assert.deepEqual(f.session.scope, {
      kind: 'directory', directory: folder.fsPath, path: folder.fsPath,
      label: 'Project/src/nested \u043f\u0430\u043f\u043a\u0430'
    });
    assert.deepEqual(f.session.results, [], 'previous results must not flash in the new scope');
    assert.equal(f.session.selectedId, null);
    assert.equal(previousAbort.signal.aborted, true);
  };
  await f.controller.showInDirectory(folder);
  assert.equal(f.controller.currentId, f.session.id);
  assert.equal(f.session.mode, 'find');
  assert.equal(f.session.query, 'needle');
  assert.equal(f.session.replacement, 'replacement');
  assert.deepEqual(f.session.options, options);
  assert.equal(f.inspected[0], folder, 'validation must use the URI supplied by Explorer');
  assert.equal(f.opened[0][0], '_workbench.openWith');
  assert.equal(f.scheduled.at(-1).scope.directory, folder.fsPath);
  assert.deepEqual(f.errors, []);
});

test('Explorer accepts workspace roots and a selected directory in the second workspace root', async t => {
  const f = fixture(t);
  for (const directory of ['/workspace', '/second root', '/second root/chosen folder']) {
    await f.controller.showInDirectory(directoryUri(directory));
    assert.equal(f.session.scope.kind, 'directory');
    assert.equal(f.session.scope.directory, directory);
    assert.equal(f.session.scope.path, directory);
    assert.equal(f.scheduled.at(-1).scope.directory, directory);
  }
  assert.equal(f.session.scope.label, 'Second/chosen folder');
  assert.deepEqual(f.errors, []);
});

test('a repeated Explorer command during modal opening retains the latest selected directory', async t => {
  const f = fixture(t);
  let release, announce;
  const started = new Promise(resolve => { announce = resolve; });
  f.controller.v.commands.executeCommand = (...args) => {
    f.opened.push(args);
    announce();
    return new Promise(resolve => { release = resolve; });
  };
  const first = f.controller.showInDirectory(directoryUri('/workspace/src'));
  await started;
  const second = f.controller.showInDirectory(directoryUri('/second root/chosen folder'));
  await turn();
  assert.equal(f.session.scope.directory, '/second root/chosen folder');
  assert.equal(f.opened.length, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(f.session.scope.directory, '/second root/chosen folder');
  assert.equal(f.scheduled.at(-1).scope.directory, '/second root/chosen folder');
  assert.deepEqual(f.errors, []);
});

test('out-of-order directory checks cannot reopen an earlier Explorer selection', async t => {
  const f = fixture(t), firstFolder = directoryUri('/workspace/src');
  let completeFirst;
  f.controller.v.workspace.fs.stat = uri => uri === firstFolder
    ? new Promise(resolve => { completeFirst = resolve; })
    : Promise.resolve({ type: 2 });
  const first = f.controller.showInDirectory(firstFolder);
  await f.controller.showInDirectory(directoryUri('/second root/chosen folder'));
  assert.equal(f.session.scope.directory, '/second root/chosen folder');
  assert.equal(f.opened.length, 1);
  completeFirst({ type: 2 });
  await first;
  assert.equal(f.session.scope.directory, '/second root/chosen folder');
  assert.equal(f.opened.length, 1, 'the older async check must not open another dialog');
  assert.equal(f.scheduled.length, 1);
  assert.deepEqual(f.errors, []);
});

test('changing to an Explorer directory rejects late batches from the previous scope', async t => {
  const f = fixture(t);
  let finish, sendBatch, announce;
  const started = new Promise(resolve => { announce = resolve; });
  f.controller.request = async session => ({ query: session.query, scope: { ...session.scope } });
  f.controller.engine = { search: (_request, callbacks) => {
    sendBatch = callbacks.onBatch;
    announce();
    return new Promise(resolve => { finish = resolve; });
  } };
  const running = f.controller.search(f.session);
  await started;
  await f.controller.showInDirectory(directoryUri('/workspace/src'));
  sendBatch([{ id: 'stale-batch' }]);
  finish({ results: [{ id: 'stale-final' }], truncated: false,
    stats: { errors: [], skippedFiles: 0 } });
  await running;
  assert.deepEqual(f.session.results, []);
  assert.equal(f.session.scope.directory, '/workspace/src');
  assert.equal(f.session.error, '');
});

for (const source of ['saved results', 'saved search draft']) {
  test(`Explorer search is independent of ${source}`, async t => {
    const f = fixture(t), saved = f.session;
    saved.layout = 'findWindow';
    const originalScope = saved.scope, originalResults = saved.results;
    if (source === 'saved search draft') {
      const draft = f.controller.create('replace', saved);
      draft.targetWindowId = saved.id;
      saved.draftId = draft.id;
    }
    await f.controller.showInDirectory(directoryUri('/workspace/src'));
    const opened = f.controller.sessions.get(f.controller.currentId);
    assert.notEqual(opened.id, saved.id);
    assert.equal(opened.layout, 'modal');
    assert.equal(opened.mode, 'find');
    assert.equal(opened.targetWindowId, undefined);
    assert.equal(opened.scope.directory, '/workspace/src');
    assert.equal(opened.query, saved.query);
    assert.deepEqual(opened.options, saved.options);
    assert.notEqual(opened.options, saved.options);
    assert.equal(saved.scope, originalScope);
    assert.equal(saved.results, originalResults);
    assert.equal(saved.layout, 'findWindow');
    assert.deepEqual(f.errors, []);
  });
}
