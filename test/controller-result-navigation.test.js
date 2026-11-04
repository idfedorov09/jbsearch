'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { SearchController } = require('../src/controller');

function fixture(mode = 'find') {
  const events = [], shown = [], errors = [];
  const text = 'header\nprefix needle suffix\n';
  const result = {
    id: 'match', uri: 'file:///workspace/example.js', offset: text.indexOf('needle'),
    length: 6, matchText: 'needle',
    contentHash: createHash('sha256').update(text).digest('hex'),
    range: { start: { line: 1, character: 7 }, end: { line: 1, character: 13 } }
  };
  const session = {
    id: 'session', mode, layout: 'modal', query: 'needle', generation: 3,
    options: {}, results: [result], panels: new Set(), scope: { kind: 'workspace' }
  };
  const document = { text, version: 1, getText() { return this.text; } };
  const central = { viewColumn: 2, tabs: [] };
  const tab = { input: { uri: { scheme: 'jbsearch', path: '/session~fresh.jbsearch' } } };
  const modal = { viewColumn: 99, tabs: [tab] };
  const panel = { dispose() { events.push('dispose-panel'); session.panels.delete(panel); } };
  session.panels.add(panel);
  const controller = Object.create(SearchController.prototype);
  controller.sessions = new Map([[session.id, session]]);
  controller.currentId = session.id;
  controller.disposed = false;
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
  return { controller, session, document, result, events, shown, errors, central, modal, panel, tab };
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

test('changed results refresh without closing the dialog or opening an editor', async () => {
  const f = fixture();
  f.document.text = f.document.text.replace('needle', 'changed');
  await assert.rejects(() => f.controller.message(f.session, {
    type: 'openResult', id: f.result.id, generation: 3
  }), /search has been refreshed/);
  assert.deepEqual(f.events, ['open-document', 'refresh']);
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
  }), /search has been refreshed/);
  assert.deepEqual(f.events, ['open-document', 'refresh']);
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
