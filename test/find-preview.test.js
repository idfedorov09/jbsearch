'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FindPreview } = require('../src/find-preview');
const { PhysicalOpenGate } = require('../src/validation-open-boundary');

const result = (id, uri = 'file:///workspace/A.js', line = 2) => ({
  id, uri,
  range: { start: { line, character: 3 }, end: { line, character: 8 } }
});
function fixture() {
  const calls = [];
  const source = { viewColumn: 1, tabs: [{ label: 'Source.js' }, { label: 'Keep.js', isDirty: true }] };
  const userRight = { viewColumn: 2, tabs: [{ label: 'User.js', isDirty: true }] };
  const groups = [source, userRight];
  const documents = new Map();
  const editors = new Map();
  const decorations = [];
  const panel = { viewColumn: 1, reveal: (...args) => calls.push(['reveal', ...args]) };
  const v = {
    ViewColumn: { Active: -1 },
    Uri: { parse: (uri) => ({ toString: () => uri }) },
    Range: class Range {
      constructor(sl, sc, el, ec) {
        this.start = { line: sl, character: sc };
        this.end = { line: el, character: ec };
      }
    },
    DecorationRangeBehavior: { ClosedClosed: 1 },
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
    commands: {
      async executeCommand(command) {
        assert.fail(`Find must not change the workbench layout: ${command}`);
      }
    },
    workspace: {
      async openTextDocument(uri) {
        const key = String(uri);
        calls.push(['open', key]);
        if (!documents.has(key)) documents.set(key, { uri, validateRange: (range) => range });
        return documents.get(key);
      }
    },
    window: {
      tabGroups: { all: groups, activeTabGroup: source },
      visibleTextEditors: [],
      createTextEditorDecorationType(options) {
        const type = { options, dispose: () => calls.push(['disposeDecoration', type]) };
        decorations.push(type);
        return type;
      },
      async showTextDocument(document, options) {
        calls.push(['show', String(document.uri), options]);
        const key = String(document.uri);
        if (!editors.has(key)) editors.set(key, {
          document, viewColumn: options.viewColumn,
          setDecorations: (type, ranges) => calls.push(['decorate', key, type, ranges]),
          revealRange: (range, type) => calls.push(['revealRange', key, range, type])
        });
        const editor = editors.get(key);
        this.visibleTextEditors = [editor];
        return editor;
      }
    }
  };
  return { v, calls, source, userRight, groups, documents, editors, decorations, panel };
}

test('Find results use the active central group without splitting or moving user tabs', async () => {
  const f = fixture(), adapter = new FindPreview(f.v);
  await adapter.show(result('a'));
  assert.equal(f.groups.length, 2);
  assert.equal(adapter.viewColumn, 1);
  assert.equal(f.groups[0], f.source);
  assert.equal(f.groups[1], f.userRight);
  assert.equal(f.source.tabs[1].isDirty, true);
  assert.equal(f.userRight.tabs[0].isDirty, true);
  const options = f.calls.find(c => c[0] === 'show')[2];
  assert.equal(options.viewColumn, 1);
  assert.equal(options.preview, true);
  assert.equal(options.preserveFocus, true);
  assert.equal(options.selection.start.line, 2);
  assert.deepEqual(options.selection.start, options.selection.end);
});

test('hidden or disposed preview editors are not decorated after navigation', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  await adapter.show(result('a'));
  f.v.window.visibleTextEditors = [];
  f.calls.length = 0;
  assert.equal(adapter.update(result('a'), [result('a')]), false);
  adapter.clear();
  assert.equal(f.calls.filter(call => call[0] === 'decorate').length, 0);
});

test('an empty editor area uses ViewColumn.Active without creating a group', async () => {
  const f = fixture(), adapter = new FindPreview(f.v);
  f.v.window.tabGroups.activeTabGroup = undefined;
  await adapter.show(result('a'));
  assert.equal(f.calls.find(c => c[0] === 'show')[2].viewColumn, -1);
  assert.equal(f.groups.length, 2);
});

test('result navigation reuses its group and preserves focus without revealing the central panel again', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  await adapter.show(result('a'));
  f.calls.length = 0;
  await adapter.show(result('b', 'file:///workspace/B.js'));
  assert.equal(f.calls.filter((c) => c[0] === 'command' || c[0] === 'reveal').length, 0);
  assert.equal(f.calls.find((c) => c[0] === 'show')[2].preserveFocus, true);
  assert.equal(f.groups.length, 2);
});

test('explicit editing can take focus while keeping the preview in its native group', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  await adapter.show(result('a'), [], { preserveFocus: false });
  assert.equal(f.calls.find((c) => c[0] === 'show')[2].preserveFocus, false);
  assert.equal(f.calls.find((c) => c[0] === 'show')[2].preview, false);
});

test('native decorations inherit theme colors and distinguish selected, invalid and other-file matches', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  const selected = result('a');
  await adapter.show(selected, [
    selected, result('b'), { ...result('invalid'), invalid: true },
    { ...result('not-valid'), valid: false }, { ...result('pending'), pending: true },
    result('other', 'file:///workspace/B.js')
  ]);
  assert.equal(f.decorations[0].options.backgroundColor,
    'color-mix(in srgb, var(--vscode-editor-findMatchHighlightBackground, transparent) 70%, transparent)');
  assert.equal(f.decorations[1].options.backgroundColor,
    'color-mix(in srgb, var(--vscode-editor-findMatchBackground, transparent) 70%, transparent)');
  assert.equal(f.decorations[0].options.opacity, undefined);
  assert.equal(f.decorations[0].options.color, undefined);
  assert.equal(f.decorations[0].options.borderColor,
    'var(--vscode-editor-findMatchHighlightBorder, transparent)');
  assert.equal(f.decorations[1].options.borderColor,
    'var(--vscode-editor-findMatchBorder, transparent)');
  const ordinary = f.calls.find((c) => c[0] === 'decorate' && c[2] === f.decorations[0]);
  const current = f.calls.find((c) => c[0] === 'decorate' && c[2] === f.decorations[1]);
  assert.equal(ordinary[3].length, 1);
  assert.equal(current[3].length, 1);
  f.calls.length = 0;
  await adapter.show({ ...selected, invalid: true });
  assert.deepEqual(f.calls.find((c) => c[0] === 'decorate' && c[2] === f.decorations[1])[3], []);
});

test('an edit updates native decorations without opening files, moving the caret or scrolling', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  await adapter.show(result('a'), [result('a'), result('b')]);
  f.calls.length = 0;
  assert.equal(adapter.update(result('a', undefined, 4), [result('a'), result('b', undefined, 5)]), true);
  assert.ok(f.calls.every((c) => c[0] === 'decorate'));
  const selected = f.calls.find((c) => c[2] === f.decorations[1]);
  assert.equal(selected[3][0].start.line, 4);
  f.calls.length = 0;
  adapter.update({ ...result('a'), pending: true }, [{ ...result('b'), pending: true }]);
  assert.ok(f.calls.every((c) => c[0] === 'decorate' && c[3].length === 0));
  f.calls.length = 0;
  assert.equal(adapter.update(result('x', 'file:///workspace/Other.js')), false);
  assert.equal(f.calls.length, 0);
});

test('decoration updates arriving during an open are applied after that open completes', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  let unblock;
  const open = f.v.workspace.openTextDocument;
  const blocked = new Promise((resolve) => { unblock = resolve; });
  f.v.workspace.openTextDocument = async (uri) => { await blocked; return open(uri); };
  const showing = adapter.show(result('a'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(adapter.update(result('a', undefined, 4), [result('b', undefined, 5)]), false);
  unblock();
  await showing;
  const selected = f.calls.find((c) => c[0] === 'decorate' && c[2] === f.decorations[1]);
  assert.equal(selected[3][0].start.line, 4);
  assert.equal(f.calls.find((c) => c[0] === 'show')[2].selection.start.line, 4);
});

test('navigation follows the group the user most recently activated', async () => {
  const f = fixture(), adapter = new FindPreview(f.v);
  await adapter.show(result('a'));
  f.v.window.tabGroups.activeTabGroup = f.userRight;
  await adapter.show(result('b', 'file:///workspace/B.js'));
  assert.equal(f.calls.filter(c => c[0] === 'show').at(-1)[2].viewColumn, 2);
  assert.equal(f.groups.length, 2);
});

test('queued preview requests show only the latest result', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  const first = adapter.show(result('a'));
  const second = adapter.show(result('b', 'file:///workspace/B.js'));
  assert.equal(await first, undefined);
  assert.ok(await second);
  assert.deepEqual(f.calls.filter((c) => c[0] === 'show').map((c) => c[1]), ['file:///workspace/B.js']);
});

test('a failed open does not prevent later navigation or close any source tab', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  const open = f.v.workspace.openTextDocument;
  f.v.workspace.openTextDocument = async () => { throw new Error('file disappeared'); };
  await assert.rejects(() => adapter.show(result('a')), /file disappeared/);
  f.v.workspace.openTextDocument = open;
  assert.ok(await adapter.show(result('b')));
  assert.equal(f.calls.filter((c) => c[0] === 'command').length, 0);
  assert.equal(f.source.tabs[1].isDirty, true);
});

test('clear and dispose cancel pending navigation and leave all editors and dirty tabs open', async () => {
  const f = fixture();
  const adapter = new FindPreview(f.v);
  await adapter.show(result('a'));
  const pending = adapter.show(result('b'));
  adapter.clear();
  assert.equal(await pending, undefined);
  assert.ok(await adapter.show(result('a')));
  const after = adapter.show(result('c'));
  adapter.dispose();
  adapter.dispose();
  assert.equal(await after, undefined);
  assert.equal(await adapter.show(result('b')), undefined);
  assert.equal(f.calls.filter((c) => c[0] === 'disposeDecoration').length, 2);
  assert.equal(f.groups.length, 2);
  assert.equal(f.source.tabs[1].isDirty, true);
});

test('injected shared opening gate bounds native preview waiting and ignores late navigation', async () => {
  const f = fixture();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const open = f.v.workspace.openTextDocument;
  const gate = new PhysicalOpenGate(async uri => {
    if (String(uri).endsWith('/A.js')) await blocked;
    return open(uri);
  }, { limit: 1 });
  const adapter = new FindPreview(f.v, { openDocument: (uri, options) =>
    gate.open(uri, { ...options, timeoutMs: 30 }) });
  const first = adapter.show(result('a'));
  await new Promise(resolve => setImmediate(resolve));
  const second = assert.rejects(adapter.show(result('b', 'file:///workspace/B.js')), { code: 'GATE_TIMEOUT' });
  assert.equal(await first, undefined, 'superseding selection cancels only its caller');
  await second;
  assert.equal(gate.active, 1);
  assert.equal(gate.waiting, 0);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(call => call[0] === 'show').length, 0);
  assert.ok(await adapter.show(result('c', 'file:///workspace/C.js')));
  assert.equal(f.calls.filter(call => call[0] === 'show').length, 1);
  adapter.dispose();
  gate.dispose();
});

test('disposing native preview cancels a gated waiter without releasing the actual physical open', async () => {
  const f = fixture();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const gate = new PhysicalOpenGate(async uri => { await blocked; return f.v.workspace.openTextDocument(uri); });
  const adapter = new FindPreview(f.v, { openDocument: (uri, options) => gate.open(uri, options) });
  const showing = adapter.show(result('a'));
  await new Promise(resolve => setImmediate(resolve));
  adapter.dispose();
  assert.equal(await showing, undefined);
  assert.equal(gate.active, 1);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(gate.active, 0);
  assert.equal(f.calls.filter(call => call[0] === 'show').length, 0);
  gate.dispose();
});

test('an external cancellation during showTextDocument cannot decorate or reveal its late editor', async () => {
  const f = fixture(), adapter = new FindPreview(f.v), abort = new AbortController();
  const show = f.v.window.showTextDocument;
  let finishShow, announce;
  const started = new Promise(resolve => { announce = resolve; });
  f.v.window.showTextDocument = async function (...args) {
    const editor = await show.apply(this, args);
    announce();
    await new Promise(resolve => { finishShow = resolve; });
    return editor;
  };
  const showing = adapter.show(result('a'), [], { signal: abort.signal });
  await started;
  abort.abort();
  finishShow();
  assert.equal(await showing, undefined);
  assert.equal(adapter.editor, undefined);
  assert.equal(f.calls.filter(call => ['decorate', 'revealRange'].includes(call[0])).length, 0);
  assert.equal(f.calls.filter(call => call[0] === 'show').length, 1,
    'an already dispatched native show cannot be revoked');
  adapter.dispose();
});

test('Close before native show dispatch suppresses an already opening document, but not later explicit inspection', async () => {
  const f = fixture(); let release;
  const adapter = new FindPreview(f.v, { openDocument: () => new Promise(resolve => { release = resolve; }) });
  const opening = adapter.show(result('old'));
  await new Promise(resolve => setImmediate(resolve));
  const document = { uri: f.v.Uri.parse('file:///workspace/A.js'), isClosed: true, validateRange: range => range };
  release(document); await opening;
  assert.equal(f.calls.some(call => call[0] === 'show'), false);
  adapter.openDocument = async () => ({ ...document, isClosed: false });
  await adapter.show({ ...result('old'), invalid: true });
  assert.equal(f.calls.filter(call => call[0] === 'show').length, 1, 'a fresh explicit INVALID inspection remains usable');
  adapter.dispose();
});

test('native acquisition checks its immutable controller binding immediately before dispatch', async () => {
  const f = fixture(); let release, current = true;
  const adapter = new FindPreview(f.v, { openDocument: () => new Promise(resolve => { release = resolve; }) });
  const opening = adapter.show(result('same-id'), [], { current: () => current });
  await new Promise(resolve => setImmediate(resolve));
  current = false;
  release({ uri: f.v.Uri.parse('file:///workspace/A.js'), validateRange: range => range });
  await opening;
  assert.equal(f.calls.some(call => call[0] === 'show'), false);
  adapter.dispose();
});
