'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { FindTree, buildTree, snippetFor, VIEW_ID, SELECT_COMMAND } = require('../src/find-tree');

class Uri {
  constructor({ scheme = 'file', authority = '', path = '/', query = '', fragment = '' }) {
    Object.assign(this, { scheme, authority, path, query, fragment });
  }
  static parse(value) {
    const url = new URL(value);
    return new Uri({ scheme: url.protocol.slice(0, -1), authority: url.host,
      path: decodeURIComponent(url.pathname), query: url.search.slice(1), fragment: url.hash.slice(1) });
  }
  static joinPath(base, ...parts) { return base.with({ path: path.posix.join(base.path, ...parts) }); }
  with(change) { return new Uri({ ...this, ...change }); }
  toString() {
    return `${this.scheme}://${this.authority}${encodeURI(this.path).replaceAll('#', '%23').replaceAll('?', '%3F')}${this.query ? `?${this.query}` : ''}${this.fragment ? `#${this.fragment}` : ''}`;
  }
}

class EventEmitter {
  constructor() { this.listeners = new Set(); this.disposed = false; }
  event = callback => { this.listeners.add(callback); return { dispose: () => this.listeners.delete(callback) }; };
  fire(value) { if (!this.disposed) for (const listener of this.listeners) listener(value); }
  dispose() { this.disposed = true; this.listeners.clear(); }
}

function result(id = 'one', relativePath = 'src/example.bl', extra = {}) {
  return { id, uri: `file:///workspace/${relativePath}`, relativePath,
    label: relativePath.split('/').at(-1), rootName: 'workspace',
    lineText: '    static public guid Value = 42;', previewMatchStart: 18, previewMatchEnd: 22,
    range: { start: { line: 4, character: 18 }, end: { line: 4, character: 22 } }, ...extra };
}

function snapshot(id = 'session-one', results = [result()], extra = {}) {
  return { id, query: 'guid', generation: 3, mode: 'find', layout: 'findWindow',
    scope: { kind: 'workspace' }, options: {}, results, selectedId: results[0]?.id, ...extra };
}

function fixture(t, callbacks = {}) {
  const commands = new Map(), calls = [], selections = [], actions = [], sessions = [];
  const reveals = [], creations = [];
  const nativeSelection = new EventEmitter();
  let pick;
  class TreeItem { constructor(label, collapsibleState) { Object.assign(this, { label, collapsibleState }); } }
  class ThemeColor { constructor(id) { this.id = id; } }
  class ThemeIcon {
    static File = { id: 'file' };
    static Folder = { id: 'folder' };
    constructor(id, color) { Object.assign(this, { id, color }); }
  }
  const view = {
    visible: false, selection: [], onDidChangeSelection: nativeSelection.event,
    async reveal(node, options) {
      reveals.push({ node, options });
      if (options.select) selectNative(node);
    },
    dispose() { this.disposed = true; nativeSelection.dispose(); }
  };
  function selectNative(node) {
    view.selection = node ? [node] : [];
    nativeSelection.fire({ selection: view.selection });
  }
  const v = {
    EventEmitter, Uri, TreeItem, TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon, ThemeColor,
    window: {
      createTreeView(id, options) { creations.push({ id, options }); return view; },
      async showQuickPick(items, options) { return pick?.(items, options); }
    },
    commands: {
      registerCommand(id, callback) { assert.ok(!commands.has(id)); commands.set(id, callback); return { dispose() { commands.delete(id); } }; },
      async executeCommand(...args) { calls.push(args); return commands.get(args[0])?.(...args.slice(1)); }
    }
  };
  const tree = new FindTree(v, {
    onSelect: async (...args) => { selections.push(args); return callbacks.onSelect?.(...args); },
    onAction: async (...args) => { actions.push(args); return callbacks.onAction?.(...args); },
    onSessionChange: async (...args) => { sessions.push(args); return callbacks.onSessionChange?.(...args); }
  });
  t.after(() => tree.dispose());
  const flatten = (nodes = tree.getChildren()) => nodes.flatMap(node => [node, ...flatten(tree.getChildren(node))]);
  return { v, tree, view, calls, selections, actions, sessions, reveals, creations, flatten,
    selectNative,
    setPick(value) { pick = value; } };
}

test('native provider gives file and directory URIs to workbench, including files with match children', t => {
  const h = fixture(t);
  h.tree.update(snapshot());
  assert.equal(h.creations[0].id, 'jbsearch.results');
  assert.equal(h.creations[0].options.treeDataProvider, h.tree);
  assert.equal(h.creations[0].options.showCollapseAll, true);
  assert.equal(h.creations[0].options.canSelectMany, false);
  const nodes = h.flatten();
  assert.deepEqual(nodes.map(node => node.kind), ['root', 'directory', 'file', 'match']);
  const items = nodes.map(node => h.tree.getTreeItem(node));
  assert.equal(items[0].resourceUri.path, '/workspace/');
  assert.equal(items[1].resourceUri.path, '/workspace/src');
  assert.equal(items[2].resourceUri.path, '/workspace/src/example.bl');
  assert.equal(items[0].iconPath, h.v.ThemeIcon.Folder);
  assert.equal(items[1].iconPath, h.v.ThemeIcon.Folder);
  assert.equal(items[2].iconPath, h.v.ThemeIcon.File);
  assert.equal(items[2].collapsibleState, h.v.TreeItemCollapsibleState.Expanded);
  assert.equal(h.tree.getParent(nodes[3]), nodes[2]);
  assert.deepEqual(items[3].command, { command: 'jbsearch.results.select', title: 'Open Search Result', arguments: ['session-one', 'one'] });
  assert.deepEqual(h.selections, []);
});

test('groups preserve snapshot order, stable identities, duplicate workspace names and aggregate statuses', t => {
  const h = fixture(t);
  const results = [result('z', 'src/z.bl'), result('a', 'src/a.bl', { invalid: true }),
    result('other', 'test/spec.bl', { uri: 'file:///other/test/spec.bl', pending: true })];
  h.tree.update(snapshot('find', results));
  const nodes = h.flatten();
  assert.deepEqual(nodes.filter(node => node.kind === 'match').map(node => node.result.id), ['z', 'a', 'other']);
  assert.equal(h.tree.getChildren().length, 2);
  assert.match(h.tree.getTreeItem(h.tree.getChildren()[0]).description, /2 results · 1 invalid/);
  assert.match(h.tree.getTreeItem(h.tree.getChildren()[1]).description, /1 result · 1 checking/);
  h.tree.update(snapshot('find', results.map(item => ({ ...item, invalid: true, range: { start: { line: 90, character: 0 } } }))));
  assert.deepEqual(h.flatten().map(node => node.id), nodes.map(node => node.id));
  h.tree.update(snapshot('different', results), { activate: true });
  assert.notEqual(h.flatten()[0].id, nodes[0].id, 'different searches cannot share native expansion/selection IDs');
});

test('remote resource paths and encoded filename characters remain intact without resolving icons', t => {
  const h = fixture(t);
  const names = ['src/a#b.bl', 'src/c?d.bl', 'src/e%f.bl', 'src/проба.bl'];
  const results = names.map((name, index) => result(String(index), name, {
    uri: `vscode-remote://ssh-remote+host/Work%20dir/${name.split('/').map(encodeURIComponent).join('/')}`
  }));
  h.tree.update(snapshot('remote', results));
  assert.equal(h.tree.getChildren().length, 1);
  const directory = h.flatten().find(node => node.kind === 'directory');
  assert.equal(directory.uri.scheme, 'vscode-remote');
  assert.equal(directory.uri.authority, 'ssh-remote+host');
  assert.equal(directory.uri.path, '/Work dir/src');
  assert.deepEqual(h.flatten().filter(node => node.kind === 'file').map(node => node.uri.path), names.map(name => `/Work dir/${name}`));
});

test('snippets trim indentation before matches and use UTF-16 native label highlights', () => {
  assert.deepEqual(snippetFor(result()), { label: 'static public guid Value = 42;', highlights: [[14, 18]] });
  assert.deepEqual(snippetFor(result('astral', 'a.js', { lineText: '    😀cat', previewMatchStart: 6, previewMatchEnd: 9 })),
    { label: '😀cat', highlights: [[2, 5]] });
  assert.deepEqual(snippetFor(result('spaces', 'a.js', { lineText: '    cat', previewMatchStart: 1, previewMatchEnd: 3 })),
    { label: '   cat', highlights: [[0, 2]] });
  assert.deepEqual(snippetFor(result('zero', 'a.js', { lineText: 'cat', previewMatchStart: 1, previewMatchEnd: 1 })),
    { label: 'c∣at', highlights: [[1, 2]] });
});

test('INVALID retains the original snippet and current location; pending state is explicit', t => {
  const h = fixture(t);
  h.tree.update(snapshot());
  const initialIds = h.flatten().map(node => node.id);
  h.tree.update(snapshot('session-one', [result('one', 'src/example.bl', {
    invalid: true, invalidReason: 'Changed', lineText: 'no longer matches', range: { start: { line: 30, character: 0 } }
  })]));
  const node = h.flatten().at(-1), item = h.tree.getTreeItem(node);
  assert.equal(item.label.label, 'INVALID · static public guid Value = 42;');
  assert.deepEqual(item.label.highlights, []);
  assert.equal(item.description, '31:1');
  assert.equal(item.iconPath.id, 'error');
  assert.equal(item.iconPath.color.id, 'errorForeground');
  assert.equal(item.contextValue, 'jbsearch.match.invalid');
  assert.match(item.tooltip, /Changed\nno longer matches/);
  assert.deepEqual(h.flatten().map(value => value.id), initialIds);
  h.tree.update(snapshot('session-one', [result('one', 'src/example.bl', { pending: true })]));
  assert.equal(h.tree.getTreeItem(h.flatten().at(-1)).contextValue, 'jbsearch.match.pending');
  assert.match(h.tree.getTreeItem(h.flatten().at(-1)).description, /Checking…/);
  assert.equal(h.tree.getTreeItem(h.flatten().at(-1)).iconPath, undefined, 'checking must not claim a confirmed error');
  h.tree.update(snapshot('session-one', [result('one', 'src/example.bl', { lineText: '    new guid', previewMatchStart: 8, previewMatchEnd: 12 })], { generation: 4 }));
  assert.equal(h.tree.getTreeItem(h.flatten().at(-1)).iconPath, undefined, 'valid results and Undo remove the error icon');
  h.tree.update(snapshot('session-one', [result('one', 'src/example.bl', { invalid: true, lineText: 'gone' })], { generation: 4 }));
  assert.equal(h.tree.getTreeItem(h.flatten().at(-1)).label.label, 'INVALID · new guid');
});

test('show and snapshot updates reveal native selection without opening an editor; command callbacks are awaited', async t => {
  let release;
  const completed = new Promise(resolve => { release = resolve; });
  const h = fixture(t, { onSelect: () => completed });
  h.tree.update(snapshot());
  await h.tree.show('session-one');
  assert.deepEqual(h.selections, []);
  assert.deepEqual(h.calls.find(call => call[0] === `${VIEW_ID}.focus`), [`${VIEW_ID}.focus`]);
  assert.equal(h.reveals.at(-1).node.result.id, 'one');
  assert.equal(h.reveals.at(-1).options.focus, false);
  let returned = false;
  const selecting = h.v.commands.executeCommand(SELECT_COMMAND, 'session-one', 'one').then(() => { returned = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returned, false);
  assert.deepEqual(h.selections, [['session-one', 'one']]);
  release();
  await selecting;
  assert.equal(returned, true);
  assert.equal(await h.tree.select('session-one', 'removed-result'), false);
});

test('saved-search picker switches the active snapshot without opening its source document', async t => {
  const h = fixture(t);
  h.tree.update(snapshot('first'));
  h.tree.update(snapshot('second', [result('two')], { query: 'cat', scope: { kind: 'openEditors' } }));
  h.setPick((items, options) => {
    assert.equal(options.placeHolder, 'Switch saved search');
    assert.equal(items.length, 2);
    assert.equal(items[0].picked, true);
    assert.match(items[1].detail, /Open Editors/);
    return items[1];
  });
  assert.equal(await h.tree.pickSession(), true);
  assert.equal(h.tree.activeId, 'second');
  assert.equal(h.tree.view.description, 'cat');
  assert.deepEqual(h.sessions, [['second']]);
  assert.deepEqual(h.selections, []);
  assert.equal(h.tree.remove('second'), true);
  assert.equal(h.tree.activeId, 'first');
  h.setPick(() => undefined);
  assert.equal(await h.tree.pickSession(), false);
  h.tree.remove('first');
  assert.deepEqual(h.tree.getChildren(), []);
  assert.equal(h.tree.activeId, undefined);
});

test('navigation follows the original occurrence order and restores native selection', async t => {
  const h = fixture(t);
  h.tree.update(snapshot('find', [result('last-filename', 'z.bl'), result('first-filename', 'a.bl'), result('invalid', 'b.bl', { invalid: true })]));
  await h.tree.navigate(1);
  assert.deepEqual(h.selections.at(-1), ['find', 'first-filename']);
  assert.equal(h.reveals.at(-1).node.result.id, 'first-filename');
  assert.deepEqual(h.reveals.at(-1).options, { select: true, focus: true, expand: true });
  await h.tree.navigate(1);
  assert.deepEqual(h.selections.at(-1), ['find', 'invalid']);
  await h.tree.navigate(1);
  assert.deepEqual(h.selections.at(-1), ['find', 'last-filename']);
});

test('native selection events synchronize controls and actions without activating an editor', async t => {
  const h = fixture(t);
  const state = snapshot('find', [result('invalid', 'a.bl', { invalid: true }), result('valid', 'b.bl'), result('next', 'c.bl')], { mode: 'replace' });
  h.tree.update(state);
  const matches = h.flatten().filter(node => node.kind === 'match');
  h.selectNative(matches[0]);
  assert.equal(h.tree.contextValues.get('canReplace'), false);
  h.selectNative(matches[1]);
  assert.equal(h.tree.state.selectedId, 'valid');
  assert.equal(h.tree.contextValues.get('canReplace'), true);
  assert.deepEqual(h.selections, [], 'a selection event alone is not source activation');
  await h.tree.action('replace');
  assert.deepEqual(h.actions.at(-1), ['find', { type: 'replace', id: 'valid', generation: 3 }]);
  await h.tree.action('focusPreview');
  assert.deepEqual(h.actions.at(-1), ['find', { type: 'openResult', id: 'valid' }]);
  await h.tree.navigate(1);
  assert.deepEqual(h.selections.at(-1), ['find', 'next'], 'F4 starts from the actual native selection');
  assert.equal(h.view.selection[0].result.id, 'next');
  const opened = h.selections.length;
  h.selectNative(h.tree.getChildren()[0]);
  assert.equal(h.tree.state.selectedId, null);
  assert.equal(h.tree.contextValues.get('hasSelection'), false);
  assert.equal(h.tree.contextValues.get('canReplace'), false);
  assert.equal(await h.tree.action('focusPreview'), false);
  h.selectNative(undefined);
  assert.equal(h.tree.state.selectedId, null);
  assert.equal(h.selections.length, opened);
});

test('validation updates retain keyboard selection while a new search can choose its own occurrence', t => {
  const h = fixture(t);
  const state = snapshot('find', [result('one'), result('two')], { mode: 'replace' });
  h.tree.update(state);
  h.selectNative(h.flatten().find(node => node.result?.id === 'two'));
  h.tree.update({ ...state, results: state.results.map(item => ({ ...item, pending: item.id === 'two' })) });
  assert.equal(h.tree.state.selectedId, 'two', 'last activated occurrence in the controller cannot override native selection');
  assert.equal(h.tree.contextValues.get('canReplace'), false);
  h.tree.update(state);
  assert.equal(h.tree.state.selectedId, 'two');
  assert.equal(h.tree.contextValues.get('canReplace'), true);
  h.tree.update({ ...state, generation: 4 });
  assert.equal(h.tree.state.selectedId, 'one');
  assert.deepEqual(h.selections, [], 'receiving snapshots must not activate an editor');
});

test('replace actions retain generation and block invalid, pending, partial and busy snapshots', async t => {
  const h = fixture(t);
  const state = snapshot('find', [result()], { mode: 'replace' });
  h.tree.update(state);
  assert.equal(await h.tree.action('replace'), true);
  assert.deepEqual(h.actions.at(-1), ['find', { type: 'replace', id: 'one', generation: 3 }]);
  assert.equal(await h.tree.action('replaceAll'), true);
  assert.deepEqual(h.actions.at(-1), ['find', { type: 'replaceAll', generation: 3 }]);
  for (const flag of ['invalid', 'pending']) {
    h.tree.update({ ...state, results: [result('one', 'src/example.bl', { [flag]: true })] });
    assert.equal(await h.tree.action('replace'), false);
    assert.equal(await h.tree.action('replaceAll'), false);
  }
  h.tree.update({ ...state, partial: true });
  assert.equal(await h.tree.action('replace'), true);
  assert.equal(await h.tree.action('replaceAll'), false);
  for (const extra of [{ searching: true }, { replacing: true }, { error: 'Worker timed out' }]) {
    h.tree.update({ ...state, ...extra });
    assert.equal(await h.tree.action('replace'), false);
    assert.equal(await h.tree.action('replaceAll'), false);
  }
  h.tree.update({ ...state, mode: 'find' });
  assert.equal(await h.tree.action('replace'), false);
});

test('toolbar actions use their own session and closing is delegated to controller', async t => {
  const h = fixture(t);
  h.tree.update(snapshot('first'));
  const first = h.flatten().at(-1);
  h.tree.update(snapshot('second', [result('two')]), { activate: true });
  await h.tree.action('editSearch', first);
  assert.deepEqual(h.actions.at(-1), ['first', { type: 'editSearch' }]);
  assert.equal(h.tree.activeId, 'first');
  await h.tree.action('focusPreview', first);
  assert.deepEqual(h.actions.at(-1), ['first', { type: 'openResult', id: 'one' }]);
  await h.tree.action('close');
  assert.deepEqual(h.actions.at(-1), ['first', { type: 'closeSearch' }]);
  assert.equal(h.tree.sessions.size, 2, 'controller owns the lifecycle; action itself cannot drop a search');
  h.tree.update(snapshot('first', []));
  assert.equal(await h.tree.action('replace', first), false);
});

test('a large native hierarchy is data only, and disposal releases provider/commands/session data', t => {
  const h = fixture(t);
  const results = Array.from({ length: 5000 }, (_, index) => result(`row-${index}`));
  h.tree.update(snapshot('large', results));
  const root = h.tree.getChildren()[0];
  assert.equal(root.total, 5000);
  assert.equal(h.tree.getChildren(h.tree.getChildren(root)[0])[0].children.length, 5000);
  h.tree.dispose();
  assert.equal(h.tree.sessions.size, 0);
  assert.equal(h.view.disposed, true);
  assert.equal(h.tree.changeEmitter.disposed, true);
  assert.equal(h.v.commands.executeCommand(SELECT_COMMAND, 'large', 'row-1') instanceof Promise, true);
  assert.deepEqual(h.selections, []);
});
