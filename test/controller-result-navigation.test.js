'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { textDocument } = require('./text-document');
const { SearchController } = require('../src/controller');

function fixture(mode = 'find') {
  const events = [], shown = [], errors = [], notifications = [];
  const text = 'header\nprefix needle suffix\n';
  const result = {
    id: 'match', uri: 'file:///workspace/example.js', offset: text.indexOf('needle'),
    length: 6, matchText: 'needle',
    contentHash: createHash('sha256').update(text, 'utf16le').digest('hex'),
    range: { start: { line: 1, character: 7 }, end: { line: 1, character: 13 } }
  };
  const session = {
    id: 'session', mode, layout: 'modal', query: 'needle', generation: 3,
    options: {}, results: [result], panels: new Set(), scope: { kind: 'workspace' }
  };
  const document = textDocument({ toString: () => result.uri }, text);
  const central = { viewColumn: 2, tabs: [] };
  const tab = { input: { uri: { scheme: 'jbsearch', path: '/session~fresh.jbsearch' } } };
  const modal = { viewColumn: 99, tabs: [tab] };
  const panel = { dispose() { events.push('dispose-panel'); session.panels.delete(panel); } };
  session.panels.add(panel);
  const controller = Object.create(SearchController.prototype);
  controller.sessions = new Map([[session.id, session]]);
  controller.currentId = session.id;
  controller.notify = value => notifications.push({ ...value, results: value.results.slice() });
  controller.disposed = false;
  controller.configuration = () => ({ get: (_key, fallback) => fallback });
  controller.schedule = value => {
    assert.equal(value, session);
    events.push('refresh');
    value.generation++;
    value.results = [];
  };
  controller.v = {
    Uri: { parse: value => value },
    ViewColumn: { Active: -1 },
    Range: class {
      constructor(sl, sc, el, ec) {
        this.start = { line: sl, character: sc };
        this.end = { line: el, character: ec };
      }
    },
    workspace: { openTextDocument: async uri => {
      assert.equal(uri, result.uri);
      events.push('open-document');
      return document;
    } },
    window: {
      tabGroups: {
        all: [central, modal], activeTabGroup: modal,
        async close(tabs, preserveFocus) {
          assert.deepEqual(tabs, [tab]);
          assert.equal(preserveFocus, true);
          events.push('close-modal');
          modal.tabs = [];
          this.activeTabGroup = central;
          return true;
        }
      },
      showErrorMessage: message => { errors.push(message); },
      async showTextDocument(doc, options) {
        events.push('show-source');
        assert.equal(doc, document);
        shown.push(options);
      }
    }
  };
  return { controller, session, document, result, events, shown, errors, central, modal, panel, tab, notifications };
}

for (const mode of ['find', 'replace']) {
  test(`${mode} activation closes the modal and opens the match in the restored central editor`, async () => {
    const f = fixture(mode);
    await f.controller.message(f.session, { type: 'openResult', id: f.result.id, generation: 3 });
    assert.deepEqual(f.events, ['open-document', 'close-modal', 'dispose-panel', 'show-source']);
    assert.equal(f.shown.length, 1);
    assert.equal(f.shown[0].viewColumn, f.central.viewColumn);
    assert.equal(f.shown[0].preview, false);
    assert.equal(f.shown[0].preserveFocus, false);
    assert.deepEqual(f.shown[0].selection.start, f.result.range.start);
    assert.deepEqual(f.shown[0].selection.end, f.result.range.end);
    assert.equal(f.session.panels.size, 0);
    assert.equal(f.controller.v.window.tabGroups.all.length, 2, 'navigation must not create an editor group');
  });
}

test('activation waits for the workbench to finish closing the modal', async () => {
  const f = fixture();
  let finishClose, announce;
  const started = new Promise(resolve => { announce = resolve; });
  const close = f.controller.v.window.tabGroups.close;
  f.controller.v.window.tabGroups.close = async (...args) => {
    announce();
    await new Promise(resolve => { finishClose = resolve; });
    return close.apply(f.controller.v.window.tabGroups, args);
  };
  const opening = f.controller.message(f.session, { type: 'openResult', id: f.result.id, generation: 3 });
  await started;
  assert.equal(f.shown.length, 0);
  assert.equal(f.session.panels.size, 1);
  finishClose();
  await opening;
  assert.equal(f.shown[0].viewColumn, 2);
});

test('changed results invalidate without closing the dialog or opening an editor', async () => {
  const f = fixture();
  f.document.text = f.document.text.replace('needle', 'changed');
  await assert.rejects(() => f.controller.message(f.session, {
    type: 'openResult', id: f.result.id, generation: 3
  }), /Rerun Search/);
  assert.deepEqual(f.events, ['open-document']);
  assert.equal(f.shown.length, 0);
  assert.equal(f.session.panels.size, 1);
});

test('changes around a regex result are stale even when its matched text and offset remain', async () => {
  const f = fixture();
  f.session.options.regex = true;
  f.document.text = f.document.text.replace('suffix', 'other!');
  assert.equal(f.document.text.slice(f.result.offset, f.result.offset + f.result.length), 'needle');
  await assert.rejects(() => f.controller.message(f.session, {
    type: 'openResult', id: f.result.id, generation: 3
  }), /Rerun Search/);
  assert.deepEqual(f.events, ['open-document']);
});

test('old generations and replacement in progress cannot activate a modal result', async () => {
  const f = fixture();
  await f.controller.message(f.session, { type: 'openResult', id: f.result.id, generation: 2 });
  f.session.replacing = true;
  await f.controller.message(f.session, { type: 'openResult', id: f.result.id, generation: 3 });
  assert.deepEqual(f.events, []);
  assert.equal(f.session.panels.size, 1);
});

test('a new search supersedes activation while its source document is loading', async () => {
  const f = fixture();
  let loaded;
  f.controller.v.workspace.openTextDocument = () => new Promise(resolve => { loaded = resolve; });
  const opening = f.controller.message(f.session, { type: 'openResult', id: f.result.id, generation: 3 });
  await new Promise(resolve => setImmediate(resolve));
  f.session.generation++;
  loaded(f.document);
  await opening;
  assert.deepEqual(f.events, []);
  assert.equal(f.session.panels.size, 1);
});

test('repeated activation shares a single modal close and source opening', async () => {
  const f = fixture();
  let loaded;
  f.controller.v.workspace.openTextDocument = () => new Promise(resolve => { loaded = resolve; });
  const first = f.controller.message(f.session, { type: 'openResult', id: f.result.id, generation: 3 });
  await f.controller.message(f.session, { type: 'openResult', id: f.result.id, generation: 3 });
  loaded(f.document);
  await first;
  assert.equal(f.events.filter(event => event === 'close-modal').length, 1);
  assert.equal(f.shown.length, 1);
});

test('refused modal closure leaves the dialog available and does not open a source behind it', async () => {
  const f = fixture();
  f.controller.v.window.tabGroups.close = async () => false;
  await assert.rejects(() => f.controller.message(f.session, {
    type: 'openResult', id: f.result.id, generation: 3
  }), /Could not close the search dialog/);
  assert.equal(f.session.panels.size, 1);
  assert.equal(f.shown.length, 0);
});

test('failed source opening after modal closure reports an error outside the closed webview', async () => {
  const f = fixture();
  f.controller.v.window.showTextDocument = async () => {
    throw new Error('Editor unavailable');
  };
  await assert.rejects(() => f.controller.message(f.session, {
    type: 'openResult', id: f.result.id, generation: 3
  }), /Editor unavailable/);
  assert.equal(f.session.panels.size, 0);
  assert.deepEqual(f.errors, ['JB Search: Could not open the search result: Editor unavailable']);
  assert.equal(f.session.openingResult, false);
});

test('changed results remain invalid without rerunning, closing the dialog, or opening an editor', async () => {
  const f = fixture();
  const sameFile = { ...f.result, id: 'same-file', offset: f.result.offset + 1 };
  const other = { ...f.result, id: 'other', uri: 'file:///workspace/other.js' };
  f.session.results.push(sameFile, other);
  f.session.results = f.session.results.map(result => result.uri === f.result.uri
    ? { ...result, identityUnknown: true, invalid: true, pending: true } : result);
  const abort = new AbortController();
  f.session.validations = new Map([[f.result.uri, { abort }]]);
  f.document.text = f.document.text.replace('needle', 'changed');
  await assert.rejects(() => f.controller.message(f.session, {
    type: 'openResult', id: f.result.id, generation: 3
  }), /Rerun Search/);
  assert.deepEqual(f.events, ['open-document']);
  assert.equal(f.shown.length, 0);
  assert.equal(f.session.panels.size, 1);
  assert.equal(f.session.generation, 3);
  assert.equal(f.session.scopeStale, true);
  assert.equal(f.session.scopeEventRevision, 1);
  assert.deepEqual(f.session.results.map(result => result.id), ['match', 'same-file', 'other']);
  assert.equal(f.session.results[0].identityUnknown, true);
  assert.equal(f.session.results[0].invalid, true);
  assert.equal(f.session.results[1].identityUnknown, true);
  assert.equal(f.session.results[1].invalid, true);
  assert.equal(f.session.results[0].pending, false);
  assert.equal(f.session.results[1].pending, false);
  assert.equal(f.session.results[2], other);
  assert.equal(abort.signal.aborted, true);
  assert.equal(f.session.validations.size, 0);
  assert.equal(f.notifications.at(-1).scopeStale, true);
  await f.controller.message(f.session, { type: 'refresh' });
  assert.equal(f.session.generation, 4, 'only explicit rerun starts another generation');
});


test('a result changed while closing the dialog is not silently rerun or opened', async () => {
  const f = fixture();
  const close = f.controller.v.window.tabGroups.close;
  f.controller.v.window.tabGroups.close = async (...args) => {
    const closed = await close.apply(f.controller.v.window.tabGroups, args);
    f.document.text = f.document.text.replace('needle', 'changed');
    return closed;
  };
  await f.controller.message(f.session, { type: 'openResult', id: f.result.id, generation: 3 });
  assert.deepEqual(f.events, ['open-document', 'close-modal', 'dispose-panel']);
  assert.equal(f.session.generation, 3);
  assert.equal(f.session.scopeStale, true);
  assert.equal(f.session.scopeEventRevision, 1);
  assert.equal(f.session.results[0].identityUnknown, true);
  assert.equal(f.session.results[0].invalid, true);
  assert.deepEqual(f.errors, [
    'JB Search: This result changed while closing the dialog. Open Find and rerun the search.'
  ]);
  assert.equal(f.shown.length, 0);
});
