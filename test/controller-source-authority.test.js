'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { SearchController } = require('../src/controller');
const { SearchEngine } = require('../src/search');
const { approvalFor } = require('../src/replace-approval');
const { PhysicalOpenGate } = require('../src/validation-open-boundary');
const { textDocument } = require('./text-document');

function uriFor(value) {
  if (!/^[a-z][\w+.-]*:/i.test(value)) value = pathToFileURL(value).toString();
  const parsed = new URL(value);
  return { scheme: parsed.protocol.slice(0, -1), path: parsed.pathname, query: parsed.search.slice(1),
    with(changes) { const next = new URL(value); if (changes.query !== undefined) next.search = changes.query; return uriFor(next.toString()); }, fsPath: parsed.protocol === 'file:' ? fileURLToPath(value) : undefined,
    toString: () => value };
}
const pause = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, { disk = 'cat! cat!', buffer = disk, dirty = false, scheme = 'file' } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-authority-'));
  const file = path.join(base, 'source.txt');
  await fs.writeFile(file, disk);
  const uri = scheme === 'file' ? uriFor(file) : uriFor('untitled:source.txt');
  const document = textDocument(uri, buffer, { isDirty: dirty });
  const events = {}, edits = [];
  const listen = key => callback => { events[key] = callback; return { dispose() {} }; };
  const settings = {};
  class TabInputText { constructor(uri) { this.uri = uri; } }
  class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
  class WorkspaceEdit { constructor() { this.entries = []; } replace(uri, range, replacement) { this.entries.push({ uri, range, replacement }); } }
  const v = {
    version: '1.144.1', Uri: { parse: uriFor }, TabInputText, Range, WorkspaceEdit, EndOfLine: { CRLF: 2 },
    EventEmitter: class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} },
    commands: { registerCommand: () => ({ dispose() {} }), async executeCommand() {} },
    window: {
      tabGroups: { all: [{ tabs: [{ input: new TabInputText(uri) }] }], onDidChangeTabs: listen('tabs') },
      registerCustomEditorProvider: () => ({ dispose() {} }), onDidChangeActiveColorTheme: listen('theme'),
      createTreeView: () => ({ selection: [], visible: true, onDidChangeSelection: listen('selection'), dispose() {} })
    },
    workspace: {
      workspaceFolders: [], textDocuments: [document], getWorkspaceFolder: () => ({}),
      getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
      openTextDocument: async () => document,
      onDidChangeTextDocument: listen('document'), onDidSaveTextDocument: listen('save'),
      onDidCloseTextDocument: listen('close'), onDidChangeConfiguration: listen('configuration'),
      createFileSystemWatcher: () => ({ onDidChange: listen('watch'), onDidCreate: listen('create'), onDidDelete: listen('delete'), dispose() {} }),
      async applyEdit(edit) {
        edits.push(edit.entries);
        const changes = edit.entries.map(item => ({ rangeOffset: document.offsetAt(item.range.start),
          rangeLength: document.offsetAt(item.range.end) - document.offsetAt(item.range.start), text: item.replacement }));
        for (const change of changes.sort((a, b) => b.rangeOffset - a.rangeOffset))
          document.text = document.text.slice(0, change.rangeOffset) + change.text + document.text.slice(change.rangeOffset + change.rangeLength);
        document.version++; document.isDirty = true;
        events.document({ document, contentChanges: changes });
        return true;
      }
    }
  };
  const controller = new SearchController(v, { subscriptions: [] }, new SearchEngine(), { dispose() {}, invalidate() {} });
  // Keep presentation out of the filesystem test; do not override request,
  // source preparation, document opens, validation, disk reads or edit dispatch.
  controller.notify = () => {};
  const session = controller.create('replace');
  Object.assign(session, { layout: 'findWindow', query: 'cat', replacement: 'dog', scope: { kind: 'openEditors' } });
  t.after(async () => { controller.dispose(); await fs.rm(base, { recursive: true, force: true }); });
  async function search() { controller.resetSearch(session); await controller.search(session); return approvalFor(session)?.binding; }
  async function validate() {
    const entry = session.validations?.get(uri.toString());
    assert.ok(entry); clearTimeout(entry.timer);
    await controller.validateDocument(session, uri.toString(), entry);
  }
  function change(offset, length, text) {
    document.text = document.text.slice(0, offset) + text + document.text.slice(offset + length);
    document.version++; document.isDirty = true;
    events.document({ document, contentChanges: [{ rangeOffset: offset, rangeLength: length, text }] });
  }
  const replace = (all = true, binding = approvalFor(session)?.binding) => controller.replace(session, all,
    { generation: session.generation, id: session.results[0]?.id, actionBinding: binding });
  return { base, file, uri, document, events, edits, settings, controller, session, search, validate, change, replace, v };
}

test('real full preflight keeps clean disk authoritative, even for a stale clean zero-match editor', async t => {
  const f = await fixture(t, { buffer: 'no occurrences' });
  let textReads = 0;
  const getText = f.document.getText;
  f.document.getText = function() { textReads++; return getText.call(this); };
  await f.search();
  assert.equal(textReads, 0, 'initial discovery must not read a clean file buffer');
  assert.equal(f.session.results.length, 2, 'disk matches cannot disappear behind a stale clean buffer');
  assert.equal(f.session.partial, false);
  const original = f.session.results;
  await assert.rejects(() => f.replace(), /stale|changed|range/);
  assert.equal(f.edits.length, 0);
  assert.equal(f.session.results, original);
});

test('tracked dirty buffers retain identity and independent raw disk authority without text equality', async t => {
  const f = await fixture(t, { disk: 'old backing bytes', buffer: 'cat! cat!', dirty: true });
  await f.search();
  const oldBinding = approvalFor(f.session).binding, ids = f.session.results.map(row => row.id);
  const baseline = f.session.results[0].diskBaseline;
  assert.ok(baseline.byteHash);
  f.change(0, 0, 'prefix ');
  await f.validate();
  assert.deepEqual(f.session.results.map(row => row.id), ids);
  assert.ok(f.session.results.every(row => !row.invalid && !row.pending && !row.identityUnknown));
  assert.deepEqual(f.session.results[0].diskBaseline, baseline);
  await assert.rejects(() => f.replace(true, oldBinding), /older search snapshot/);
  await f.replace();
  assert.equal(f.edits.length, 1);
  assert.equal(f.document.text, 'prefix dog! dog!');
  assert.equal(f.document.isDirty, true);
  assert.equal(await fs.readFile(f.file, 'utf8'), 'old backing bytes');
});

test('observed Save lazily rebases disk state while preserving the immutable approved baseline', async t => {
  const f = await fixture(t, { disk: 'old backing bytes', buffer: 'cat! cat!', dirty: true });
  await f.search();
  const originalBaseline = f.session.results[0].diskBaseline;
  await fs.writeFile(f.file, f.document.text);
  f.document.isDirty = false;
  f.events.document({ document: f.document, contentChanges: [] });
  f.events.save(f.document);
  await f.validate();
  const approval = approvalFor(f.session), frozenBaseline = approval.model.results[0].diskBaseline;
  assert.deepEqual(frozenBaseline, originalBaseline);
  f.events.watch(f.uri); // Save's watcher is state equality, not writer provenance.
  await f.validate();
  await f.replace();
  assert.equal(f.edits.length, 1);
  assert.deepEqual(frozenBaseline, originalBaseline, 'preparation never mutates the frozen manifest');
  assert.equal(await fs.readFile(f.file, 'utf8'), 'cat! cat!');
  assert.equal(f.document.text, 'dog! dog!');
});

test('a changed disk without observed Save never rebases from a matching clean editor', async t => {
  const f = await fixture(t);
  await f.search(); const original = f.session.results;
  await fs.writeFile(f.file, 'changed backing file');
  await assert.rejects(() => f.replace(false), /changed on disk/);
  assert.equal(f.edits.length, 0);
  assert.equal(f.session.results, original);
});

test('unknown watcher identity and Close cannot revive by matching current text', async t => {
  for (const event of ['watch', 'close']) await t.test(event, async t => {
    const f = await fixture(t);
    await f.search();
    f.events[event](event === 'close' ? f.document : f.uri);
    if (event === 'watch') await f.validate();
    assert.ok(f.session.results.every(row => row.identityUnknown));
    await assert.rejects(() => f.replace(false), /INVALID/);
    assert.equal(f.edits.length, 0);
  });
});

test('missing backing file keeps dirty occurrences visible but invalid and incomplete', async t => {
  const f = await fixture(t, { buffer: 'cat!', dirty: true });
  await fs.unlink(f.file);
  await f.search();
  assert.equal(f.session.results.length, 1);
  assert.equal(f.session.partial, true);
  assert.ok(f.session.results[0].diskBaselineUnavailable);
  assert.equal(f.session.results[0].unavailable, true);
  await assert.rejects(() => f.replace(false), /INVALID/);
  await assert.rejects(() => f.replace(true), /complete results/);
  assert.equal(f.edits.length, 0);
});

test('real untitled snapshots need no fabricated disk baseline', async t => {
  const f = await fixture(t, { scheme: 'untitled', dirty: true });
  await f.search();
  assert.equal(f.session.partial, false);
  assert.equal(f.session.results[0].diskBaseline, undefined);
  await f.replace();
  assert.equal(f.document.text, 'dog! dog!');
  assert.equal(f.edits.length, 1);
});

test('a new match in a previously zero-match Open Editors file causes zero edits and preserves the full old list', async t => {
  const f = await fixture(t);
  const extraFile = path.join(f.base, 'zero.txt');
  await fs.writeFile(extraFile, 'no occurrences');
  const extra = textDocument(uriFor(extraFile), 'no occurrences');
  f.v.window.tabGroups.all[0].tabs.push({ input: new f.v.TabInputText(extra.uri) });
  f.v.workspace.textDocuments.push(extra);
  f.v.workspace.openTextDocument = async uri => uri.toString() === extra.uri.toString() ? extra : f.document;
  await f.search(); const original = f.session.results;
  await fs.writeFile(extraFile, 'cat'); // No watcher event: preflight still must find the extra target.
  await assert.rejects(() => f.replace(), /results changed/);
  assert.equal(f.edits.length, 0);
  assert.equal(f.session.results, original);
  assert.equal(f.session.needsRerun, true);
});

test('real asynchronous filesystem preparation rejects a changed document and holds its physical slot', async t => {
  const f = await fixture(t);
  await f.search();
  const actualLstat = fs.lstat.bind(fs);
  let enter, release, first = true;
  const entered = new Promise(resolve => { enter = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  t.mock.method(fs, 'lstat', async (...args) => {
    const result = await actualLstat(...args);
    if (first && args[0] === f.file) { first = false; enter(); await waiting; }
    return result;
  });
  const replacing = f.replace(false);
  await entered;
  assert.equal(f.controller.diskChecks.active, 1);
  f.document.version++; f.document.text = 'prefix cat! cat!'; f.document.isDirty = true;
  release();
  await assert.rejects(replacing, /source changed|file changed/);
  assert.equal(f.edits.length, 0);
});

test('repeated preparation timeouts bound underlying filesystem work without late edits', async t => {
  const f = await fixture(t, { dirty: true });
  await f.search();
  f.settings['replace.prepareTimeoutMs'] = 100;
  const releases = [];
  let starts = 0;
  f.controller.diskChecks.dispose();
  f.controller.diskChecks = new PhysicalOpenGate(() => {
    starts++; return new Promise(resolve => releases.push(resolve));
  });
  for (let attempt = 0; attempt < 7; attempt++) {
    await assert.rejects(() => f.replace(false), /timed out|cancelled/);
    assert.ok(f.controller.diskChecks.active <= 4);
    assert.equal(f.controller.diskChecks.waiting, 0);
  }
  assert.equal(starts, 4);
  releases.forEach(resolve => resolve()); await pause();
  assert.equal(f.edits.length, 0);
  assert.equal(f.controller.diskChecks.active, 0);
});


test('observed Save cannot turn missing or malformed historical provenance into a trusted baseline', async t => {
  for (const field of ['byteHash', 'ctimeMs', 'linkPolicy', 'origin', 'uri']) await t.test(field, async t => {
    const f = await fixture(t, { disk: 'older bytes', buffer: 'cat!', dirty: true });
    await f.search();
    const corrupt = { ...f.session.results[0].diskBaseline }; delete corrupt[field];
    f.session.results = f.session.results.map(row => ({ ...row, diskBaseline: corrupt }));
    await fs.writeFile(f.file, f.document.text); f.document.isDirty = false;
    f.events.save(f.document); await f.validate();
    await assert.rejects(() => f.replace(false), /incomplete or unverified/);
    assert.equal(f.edits.length, 0);
  });
});


test('wrong baseline origin, URI or link policy stays blocked after a clean observed Save in Single and All', async t => {
  for (const all of [false, true]) for (const [field, value] of [
    ['origin', 'buffer'], ['uri', 'file:///another-source.txt'], ['linkPolicy', 'unsafe-follow']
  ]) await t.test(`${all}:${field}`, async t => {
    const f = await fixture(t, { disk: 'older bytes', buffer: 'cat!', dirty: true });
    await f.search();
    f.session.results = f.session.results.map(row => ({ ...row, diskBaseline: { ...row.diskBaseline, [field]: value } }));
    await fs.writeFile(f.file, f.document.text); f.document.isDirty = false;
    f.events.save(f.document); await f.validate();
    await assert.rejects(() => f.replace(all), /incomplete or unverified/);
    assert.equal(f.edits.length, 0);
  });
});

test('a legitimate observed atomic Save may rebase inode but not the approved URI or occurrence set', async t => {
  const f = await fixture(t, { disk: 'older bytes', buffer: 'cat! cat!', dirty: true });
  await f.search();
  const baseline = f.session.results[0].diskBaseline;
  const saved = path.join(f.base, 'atomic-save.txt');
  await fs.writeFile(saved, f.document.text); await fs.rename(saved, f.file);
  assert.notEqual((await fs.stat(f.file)).ino, baseline.ino);
  f.document.isDirty = false; f.events.save(f.document); await f.validate();
  const approved = approvalFor(f.session).model;
  await f.replace();
  assert.equal(f.edits.length, 1);
  assert.equal(f.document.text, 'dog! dog!');
  assert.equal(approved.results[0].diskBaseline.uri, f.uri.toString());
  assert.equal(approved.results[0].diskBaseline.ino, baseline.ino, 'no frozen provenance mutation');
});

test('All validates recorded provenance on every row, not just the first common baseline', async t => {
  const f = await fixture(t, { disk: 'older bytes', buffer: 'cat! cat!', dirty: true });
  await f.search();
  assert.equal(f.session.results.length, 2);
  f.session.results = f.session.results.map((row, index) => index === 0 ? row : ({ ...row,
    diskBaseline: { ...row.diskBaseline, uri: 'file:///wrong-second-row.txt' } }));
  await fs.writeFile(f.file, f.document.text); f.document.isDirty = false;
  f.events.save(f.document); await f.validate();
  await assert.rejects(() => f.replace(), /incomplete or unverified/);
  assert.equal(f.edits.length, 0);
});

test('observed Save never rebases permission, missing, unsupported or resource failures as changed bytes', async t => {
  for (const all of [false, true]) for (const code of ['EACCES', 'ENOENT', 'ENOTSUP', 'GATE_TIMEOUT'])
    await t.test(`${all}:${code}`, async t => {
      const f = await fixture(t, { disk: 'older bytes', buffer: 'cat!', dirty: true });
      await f.search();
      await fs.writeFile(f.file, f.document.text); f.document.isDirty = false;
      f.events.save(f.document); await f.validate();
      const lstat = fs.lstat;
      let attempts = 0;
      // Fail just the old-baseline assertion. A catch-all adoption would then
      // see a successful strict read and incorrectly treat this as Save proof.
      fs.lstat = async (...args) => {
        if (args[0] === f.file && ++attempts === 1)
          throw Object.assign(new Error(`Injected ${code} source failure`), { code });
        return lstat(...args);
      };
      try {
        await assert.rejects(() => f.replace(all), error => error.code === code && /Disk baseline check failed/.test(error.message));
        assert.equal(attempts, 1, 'non-change errors must not enter a second rebase read');
        assert.equal(f.edits.length, 0);
      } finally { fs.lstat = lstat; }
    });
});


test('the frozen-review explicit action shares the same wrong-origin/URI admission as direct Single and All', async t => {
  const f = await fixture(t, { disk: 'older bytes', buffer: 'cat!', dirty: true });
  await f.search();
  f.session.results = f.session.results.map(row => ({ ...row,
    diskBaseline: { ...row.diskBaseline, origin: 'buffer', uri: 'file:///wrong-source.txt' } }));
  await fs.writeFile(f.file, f.document.text); f.document.isDirty = false;
  f.events.save(f.document); await f.validate();
  await f.controller.replace(f.session, true, { generation: f.session.generation });
  const review = f.controller.sessions.get(f.session.reviewId);
  assert.equal(review.reviewOnly, true);
  await assert.rejects(() => f.controller.message(review, { type: 'replaceAll',
    actionBinding: review.reviewApproval.binding }), /incomplete or unverified/);
  assert.equal(f.edits.length, 0);
});

test('composed lifecycle transitions replace same-length result arrays and never retain an obsolete authority index', async t => {
  const { prepareDiskBaseline } = require('../src/source-authority');
  for (const transition of ['queue', 'tracked edit', 'validation', 'external change', 'close'])
    await t.test(transition, async t => {
      const f = await fixture(t, { dirty: true }); await f.search();
      const original = f.session.results, selected = original.slice();
      // Prime the real helper's private ID->row index through a successful
      // physical baseline assertion, then use actual controller event paths.
      await prepareDiskBaseline(f.session, f.document, selected);
      if (transition === 'queue') f.controller.queueValidation(f.session, f.uri.toString(), 1000);
      else if (transition === 'tracked edit') f.change(0, 0, 'prefix ');
      else if (transition === 'validation') {
        f.controller.queueValidation(f.session, f.uri.toString(), 1000); await f.validate();
      } else if (transition === 'external change') {
        f.document.version++; // unknown history; equal text alone is not an anchor
        f.events.watch(f.uri);
      } else f.events.close(f.document);
      const current = f.session.results;
      assert.notEqual(current, original);
      assert.equal(current.length, original.length);
      assert.deepEqual(current.map(row => row.id), original.map(row => row.id));
      assert.ok(current.every((row, i) => row !== original[i]));
      if (transition !== 'validation') {
        await assert.rejects(() => prepareDiskBaseline(f.session, f.document, selected), /occurrence changed|source changed/);
      } else {
        await prepareDiskBaseline(f.session, f.document, current);
        assert.ok(current.every(row => !row.pending && !row.invalid));
      }
    });
});

async function validateOwner(f, session) {
  const entry = session.validations?.get(f.uri.toString());
  assert.ok(entry); clearTimeout(entry.timer);
  await f.controller.validateDocument(session, f.uri.toString(), entry);
}
function replaceOccurrence(f, session, id) {
  return f.controller.replace(session, false, { id, generation: session.generation,
    actionBinding: approvalFor(session)?.binding });
}
async function observedCleanSave(f) {
  await fs.writeFile(f.file, f.document.text);
  f.document.isDirty = false;
  f.events.document({ document: f.document, contentChanges: [] });
  f.events.save(f.document);
}
for (const later of ['unchanged', 'known delta', 'disk changed', 'close', 'new Save']) {
  test(`accepted Save baseline persists for a surviving Single: ${later}`, async t => {
    const f = await fixture(t, { disk: 'older backing bytes', buffer: 'cat! cat!', dirty: true });
    await f.search();
    const ids = f.session.results.map(row => row.id), originalBaseline = f.session.results[0].diskBaseline;
    await observedCleanSave(f); await f.validate();
    const approval = approvalFor(f.session), frozen = approval.model.results[0].diskBaseline;
    await replaceOccurrence(f, f.session, ids[0]); await f.validate();
    assert.equal(f.edits.length, 1);
    assert.ok(f.session.results.find(row => row.id === ids[0]).identityUnknown);
    if (later === 'known delta') { f.change(0, 0, 'prefix '); await f.validate(); }
    if (later === 'disk changed') await fs.writeFile(f.file, 'external cat! cat!');
    if (later === 'close') { f.document.isClosed = true; f.events.close(f.document); }
    if (later === 'new Save') { await observedCleanSave(f); await f.validate(); }
    if (['disk changed', 'close'].includes(later)) {
      await assert.rejects(() => replaceOccurrence(f, f.session, ids[1]), /changed on disk|INVALID/);
      assert.equal(f.edits.length, 1);
    } else {
      const survivor = f.session.results.find(row => row.id === ids[1]);
      assert.ok(!survivor.invalid && !survivor.pending && !survivor.identityUnknown);
      await replaceOccurrence(f, f.session, ids[1]);
      assert.equal(f.edits.length, 2);
      assert.equal(f.document.text, later === 'known delta' ? 'prefix dog! dog!' : 'dog! dog!');
    }
    assert.deepEqual(frozen, originalBaseline, 'historical approved source provenance stays immutable');
    assert.deepEqual(f.session.results[1].diskBaseline, originalBaseline, 'no live row origin substitution');
    assert.ok(f.session.results[0].identityUnknown, 'destroyed first occurrence is never revived');
  });
}
for (const destination of ['confirm', 'new', 'same']) for (const authority of ['known', 'Save pending', 'Save complete', 'accepted baseline']) {
  test(`${destination} owner positively renews ${authority} document authority`, async t => {
    const f = await fixture(t, { disk: 'older backing bytes', buffer: 'cat! cat!', dirty: true });
    await f.search();
    const source = f.session, ids = source.results.map(row => row.id);
    if (authority !== 'known') {
      await observedCleanSave(f);
      if (authority !== 'Save pending') await f.validate();
    }
    if (authority === 'accepted baseline') {
      await replaceOccurrence(f, source, ids[0]); await f.validate();
    }
    const oldDeadline = source.validations?.get(f.uri.toString())?.deadline;
    source.layout = 'modal';
    source.panels.add({ dispose() { source.panels.delete(this); } });
    if (destination === 'confirm') {
      const target = f.controller.create('replace'); target.layout = 'findWindow';
      source.targetWindowId = target.id; target.draftId = source.id;
    }
    f.controller.findTree.show = async () => true;
    f.controller.closeModalEditors = async () => {};
    const owner = await f.controller.openFindWindow(source, destination === 'new');
    assert.deepEqual(owner.results.map(row => row.id), ids);
    if (oldDeadline !== undefined) assert.equal(owner.validations.get(f.uri.toString()).deadline, oldDeadline);
    if (owner.results.some(row => row.pending)) await validateOwner(f, owner);
    // An unchanged delivered watcher must not destroy continuous known history.
    f.events.watch(f.uri); await validateOwner(f, owner);
    const selectedId = authority === 'accepted baseline' ? ids[1] : ids[0];
    assert.ok(!owner.results.find(row => row.id === selectedId).identityUnknown);
    await replaceOccurrence(f, owner, selectedId);
    assert.equal(f.edits.length, authority === 'accepted baseline' ? 2 : 1);
    if (authority === 'accepted baseline') assert.ok(owner.results[0].identityUnknown);
  });
}
for (const event of ['watcher', 'known edit', 'close']) test(`authority is renewed during reveal without hiding an intervening ${event}`, async t => {
  const f = await fixture(t, { disk: 'older backing bytes', buffer: 'cat! cat!', dirty: true });
  await f.search(); await observedCleanSave(f); await f.validate();
  const ids = f.session.results.map(row => row.id);
  await replaceOccurrence(f, f.session, ids[0]); await f.validate();
  const source = f.session; source.layout = 'modal';
  source.panels.add({ dispose() { source.panels.delete(this); } });
  let finish;
  f.controller.findTree.show = () => new Promise(resolve => { finish = resolve; });
  f.controller.closeModalEditors = async () => {};
  const transferring = f.controller.openFindWindow(source, true);
  await pause();
  const destination = [...f.controller.sessions.values()].find(s => s !== source);
  if (event === 'watcher') f.events.watch(f.uri);
  else if (event === 'known edit') f.change(0, 0, 'prefix ');
  else { f.document.isClosed = true; f.events.close(f.document); }
  finish(true); const owner = await transferring;
  assert.equal(owner, destination);
  if (event === 'close') {
    assert.ok(owner.results.every(row => row.identityUnknown && row.invalid));
    await assert.rejects(() => replaceOccurrence(f, owner, ids[1]), /INVALID/);
    assert.equal(f.edits.length, 1);
  } else {
    await validateOwner(f, owner);
    assert.ok(!owner.results.find(row => row.id === ids[1]).identityUnknown);
    await replaceOccurrence(f, owner, ids[1]);
    assert.equal(f.edits.length, 2);
  }
});

for (const loaded of [false, true]) test(`complete project preflight accepts unchanged clean multi-file cache admission, preloaded=${loaded}`, async t => {
  const f = await fixture(t);
  const secondFile = path.join(f.base, 'second.txt'); await fs.writeFile(secondFile, 'cat!');
  const second = textDocument(uriFor(secondFile), 'cat!');
  const documents = new Map([f.document, second].map(doc => [doc.uri.toString(), doc]));
  f.v.workspace.workspaceFolders = [{ name: 'fixture', uri: uriFor(f.base) }];
  f.v.workspace.textDocuments = loaded ? [...documents.values()] : [];
  f.v.window.tabGroups.all[0].tabs = [];
  f.session.scope = { kind: 'workspace' };
  f.v.workspace.openTextDocument = async uri => {
    const doc = documents.get(uri.toString()); assert.ok(doc);
    if (!f.v.workspace.textDocuments.includes(doc)) f.v.workspace.textDocuments.push(doc);
    return doc;
  };
  const dispatched = [];
  f.v.workspace.applyEdit = async edit => { dispatched.push(edit.entries); return true; };
  await f.search(); assert.equal(f.session.partial, false); assert.equal(f.session.results.length, 3);
  const original = f.session.results;
  await f.replace();
  assert.equal(dispatched.length, 1); assert.equal(dispatched[0].length, 3);
  assert.equal(new Set(dispatched[0].map(edit => edit.uri.toString())).size, 2);
  assert.equal(f.v.workspace.textDocuments.length, 2);
  assert.deepEqual(f.session.results.map(row => row.id), original.map(row => row.id));
});
for (const transition of ['new dirty', 'changed dirty']) test(`project preflight refuses ${transition} zero-match buffer authority during its own opens`, async t => {
  const f = await fixture(t);
  const otherFile = path.join(f.base, 'zero.txt'); await fs.writeFile(otherFile, 'no occurrences');
  const other = textDocument(uriFor(otherFile), 'no occurrences', { isDirty: true });
  f.v.workspace.workspaceFolders = [{ name: 'fixture', uri: uriFor(f.base) }];
  f.v.workspace.textDocuments = transition === 'changed dirty' ? [other] : [];
  f.session.scope = { kind: 'workspace' };
  f.v.workspace.openTextDocument = async () => {
    if (!f.v.workspace.textDocuments.includes(f.document)) f.v.workspace.textDocuments.push(f.document);
    if (!f.v.workspace.textDocuments.includes(other)) f.v.workspace.textDocuments.push(other);
    else { other.text = 'different zero-match buffer'; other.version++; }
    return f.document;
  };
  let dispatched = 0; f.v.workspace.applyEdit = async () => { dispatched++; return true; };
  await f.search(); const original = f.session.results;
  assert.equal(original.length, 2); assert.equal(f.session.partial, false);
  await assert.rejects(() => f.replace(), /scope or open documents changed/);
  assert.equal(dispatched, 0); assert.equal(f.session.results, original);
});

test('static failed transfer re-admits the original completed Save authority without restoring a source token', async t => {
  const f = await fixture(t, { disk: 'older backing bytes', buffer: 'cat! cat!', dirty: true });
  await f.search();
  const source = f.session, target = f.controller.create('replace');
  Object.assign(target, { layout: 'findWindow', query: 'cat', replacement: 'dog', scope: { kind: 'openEditors' } });
  f.controller.resetSearch(target); await f.controller.search(target);
  source.layout = 'modal'; source.panels.add({ dispose() { source.panels.delete(this); } });
  source.targetWindowId = target.id; target.draftId = source.id;
  await observedCleanSave(f);
  // Hold BOTH real admissions before awaiting either worker; otherwise the
  // second one's normal zero-delay timer can finish while the first is awaited.
  for (const owner of [source, target]) clearTimeout(owner.validations.get(f.uri.toString()).timer);
  await validateOwner(f, target); await f.validate();
  const old = approvalFor(target).binding;
  f.controller.findTree.show = async () => { throw new Error('synthetic reveal failure'); };
  await assert.rejects(() => f.controller.openFindWindow(source, false), /synthetic reveal failure/);
  assert.notEqual(approvalFor(target).binding, old);
  await replaceOccurrence(f, target, target.results[0].id);
  assert.equal(f.edits.length, 1);
});

test('unrenewable completed document authority is explicitly INVALID, never silently copied', async t => {
  const { discardDocumentBaseline } = require('../src/source-authority');
  const f = await fixture(t, { dirty: true }); await f.search();
  const source = f.session;
  discardDocumentBaseline(source, f.uri.toString());
  source.layout = 'modal'; source.panels.add({ dispose() { source.panels.delete(this); } });
  f.controller.findTree.show = async () => true; f.controller.closeModalEditors = async () => {};
  const owner = await f.controller.openFindWindow(source, true);
  assert.ok(owner.results.every(row => row.invalid && row.identityUnknown && !row.pending));
  assert.equal(owner.needsRerun, true); assert.match(owner.notice, /authority.*Rerun/);
  await assert.rejects(() => replaceOccurrence(f, owner, owner.results[0].id), /INVALID/);
  assert.equal(f.edits.length, 0);
});

test('a known delta during final native focus follows the destination authority after the modal is closed', async t => {
  const f = await fixture(t, { disk: 'older backing bytes', buffer: 'cat! cat!', dirty: true });
  await f.search(); await observedCleanSave(f); await f.validate();
  const ids = f.session.results.map(row => row.id);
  await replaceOccurrence(f, f.session, ids[0]); await f.validate();
  const source = f.session; source.layout = 'modal';
  source.panels.add({ dispose() { source.panels.delete(this); } });
  f.controller.findTree.show = async () => true; f.controller.closeModalEditors = async () => {};
  let reached, finish;
  const atFocus = new Promise(resolve => { reached = resolve; });
  f.v.commands.executeCommand = command => {
    if (command === 'jbsearch.results.focus') { reached(); return new Promise(resolve => { finish = resolve; }); }
  };
  const moving = f.controller.openFindWindow(source, true);
  await atFocus;
  assert.equal(source.panels.size, 0);
  f.change(0, 0, 'prefix ');
  finish(); const owner = await moving;
  await validateOwner(f, owner);
  assert.ok(!owner.results.find(row => row.id === ids[1]).identityUnknown);
  await replaceOccurrence(f, owner, ids[1]);
  assert.equal(f.edits.length, 2);
  assert.equal(f.document.text, 'prefix dog! dog!');
});

function rollbackAuthorityHost(f, source, newTab, phase) {
  // Real controller/provider callbacks, worker and raw-file checks are retained;
  // this fixture has no workbench, so only its resource-free host endpoints are
  // doubled. Both the final focus wait and actual rollback open can be held.
  f.controller.context.extensionUri = f.v.Uri.parse('file:///extension');
  f.v.Uri.joinPath = (base, ...pieces) => f.v.Uri.parse(base.toString().replace(/\/$/, '') + '/' + pieces.join('/'));
  f.controller.renderPanel = () => {};
  f.v.window.showErrorMessage = message => assert.fail(`Unexpected presentation error: ${message}`);
  function panel(document) {
    let disposed = false, onDispose;
    const view = { active: true, visible: true,
      webview: { postMessage() {}, onDidReceiveMessage() {} },
      onDidDispose(callback) { onDispose = callback; }, onDidChangeViewState() {},
      dispose() { if (!disposed) { disposed = true; onDispose?.(); } }
    };
    f.controller.resolveCustomEditor(document, view);
  }
  source.layout = 'modal'; f.controller.currentId = source.id;
  panel({ session: source });
  f.controller.findTree.show = async () => true;
  f.controller.closeModalEditors = async () => {};
  let reached, release, reject, reopenUri;
  const atWait = new Promise(resolve => { reached = resolve; });
  const hold = new Promise((resolve, fail) => { release = resolve; reject = fail; });
  f.v.commands.executeCommand = async (command, uri) => {
    if (command === 'jbsearch.results.focus') {
      if (phase === 'focus') { reached(); return hold; }
      throw new Error('synthetic final focus failure');
    }
    if (command === '_workbench.openWith') {
      reopenUri = uri;
      if (phase === 'reopen') { reached(); await hold; }
      panel(f.controller.openCustomDocument(uri));
    }
  };
  const moving = f.controller.openFindWindow(source, newTab);
  const failure = assert.rejects(moving, /synthetic final focus failure/);
  return { moving, failure, atWait, get reopenUri() { return reopenUri; },
    release() { if (phase === 'focus') reject(new Error('synthetic final focus failure')); else release(); } };
}
for (const destination of ['confirm', 'new', 'same']) for (const phase of ['focus', 'reopen']) {
  for (const event of ['known delta', 'Close', 'Save', 'static']) {
    test(`real saved authority survives ${destination} rollback ${event} during ${phase}`, async t => {
      const { hasCurrentDocumentAuthority } = require('../src/source-authority');
      const f = await fixture(t, { disk: 'older backing bytes', buffer: 'cat! cat!', dirty: true });
      await f.search(); await observedCleanSave(f); await f.validate();
      const source = f.session, ids = source.results.map(row => row.id);
      const originalBaseline = source.results[1].diskBaseline;
      const originalApproval = approvalFor(source);
      await replaceOccurrence(f, source, ids[0]); await f.validate();
      assert.equal(f.edits.length, 1);
      assert.equal(hasCurrentDocumentAuthority(source, f.document), true);
      const oldBinding = approvalFor(source).binding, wasStale = source.scopeStale;
      if (destination === 'confirm') {
        const target = f.controller.create('replace'); target.layout = 'findWindow';
        source.targetWindowId = target.id; target.draftId = source.id;
      }
      let scheduled = 0;
      const schedule = f.controller.schedule.bind(f.controller);
      f.controller.schedule = (...args) => { scheduled++; return schedule(...args); };
      const epoch = source.scopeEventRevision;
      const host = rollbackAuthorityHost(f, source, destination === 'new', phase);
      try {
        await host.atWait;
        assert.equal(source.panels.size, 0);
        assert.equal(f.controller.activeSession(source), true);
        if (event === 'known delta') f.change(0, 0, 'prefix ');
        else if (event === 'Close') { f.document.isClosed = true; f.events.close(f.document); }
        else if (event === 'Save') await observedCleanSave(f);
        const entry = source.validations?.get(f.uri.toString());
        if (entry) clearTimeout(entry.timer);
        const delivered = source.scopeEventRevision;
        if (event !== 'static') assert.ok(delivered > epoch);
        host.release(); await host.failure;
        assert.equal(source.panels.size, 1);
        assert.equal(source.layout, 'modal');
        assert.equal(source.scopeEventRevision, delivered);
        assert.equal(source.scopeStale, event === 'static' ? wasStale : true);
        assert.deepEqual(source.results.map(row => row.id), ids);
        assert.equal(f.controller.transferEventSources?.get(source), undefined);
        assert.equal(f.controller.modalRestores?.size || 0, 0);
        assert.equal(scheduled, 0, 'failed transfer and ordinary source events never run full discovery');
        assert.notEqual(approvalFor(source).binding.snapshotToken, oldBinding.snapshotToken);
        assert.throws(() => f.controller.openCustomDocument(host.reopenUri), /closed or changed/);
        if (event === 'Close') {
          assert.equal(hasCurrentDocumentAuthority(source, f.document), false);
          assert.ok(source.results.every(row => row.invalid && row.identityUnknown && !row.pending));
          assert.equal(source.validations?.size || 0, 0);
          await assert.rejects(() => replaceOccurrence(f, source, ids[1]), /INVALID/);
          assert.equal(f.edits.length, 1);
        } else {
          if (event !== 'static') {
            const survivor = source.results.find(row => row.id === ids[1]);
            assert.equal(survivor.pending, true);
            assert.equal(Boolean(survivor.identityUnknown), false);
            if (event === 'known delta') assert.equal(survivor.offset, 12);
            assert.equal(source.validations.get(f.uri.toString()), entry);
            await validateOwner(f, source);
          }
          assert.equal(hasCurrentDocumentAuthority(source, f.document), true);
          const survivor = source.results.find(row => row.id === ids[1]);
          assert.ok(!survivor.pending && !survivor.invalid && !survivor.identityUnknown);
          await replaceOccurrence(f, source, ids[1]);
          assert.equal(f.edits.length, 2, 'known surviving occurrence still has usable private disk authority');
          assert.equal(f.document.text, event === 'known delta' ? 'prefix dog! dog!' : 'dog! dog!');
        }
        assert.deepEqual(originalApproval.model.results[1].diskBaseline, originalBaseline);
        assert.deepEqual(source.results[1].diskBaseline, originalBaseline, 'immutable source origin is not rebased');
        assert.equal(source.results[0].identityUnknown, true, 'destroyed first occurrence is never revived');
      } finally { host.release(); await host.moving.catch(() => {}); }
    });
  }
}
for (const destination of ['confirm', 'new', 'same']) for (const phase of ['focus', 'reopen']) {
  for (const event of ['Save', 'Close', 'metadata']) {
    test(`zero-match ${event} advances source epoch during ${destination} rollback ${phase}`, async t => {
      const f = await fixture(t);
      const file = path.join(f.base, 'zero.txt'); await fs.writeFile(file, 'no occurrences');
      const zero = textDocument(uriFor(file), 'no occurrences');
      f.v.workspace.textDocuments.push(zero);
      f.v.window.tabGroups.all[0].tabs.push({ input: new f.v.TabInputText(zero.uri) });
      await f.search();
      const source = f.session, ids = source.results.map(row => row.id), epoch = source.scopeEventRevision;
      if (destination === 'confirm') {
        const target = f.controller.create('replace'); target.layout = 'findWindow';
        source.targetWindowId = target.id; target.draftId = source.id;
      }
      let scheduled = 0;
      const schedule = f.controller.schedule.bind(f.controller);
      f.controller.schedule = (...args) => { scheduled++; return schedule(...args); };
      const host = rollbackAuthorityHost(f, source, destination === 'new', phase);
      try {
        await host.atWait;
        if (event === 'Save') f.events.save(zero);
        else if (event === 'Close') { zero.isClosed = true; f.events.close(zero); }
        else f.events.document({ document: zero, contentChanges: [] });
        const delivered = source.scopeEventRevision;
        assert.ok(delivered > epoch, 'zero-row scope member remains relevant with no source panel');
        host.release(); await host.failure;
        assert.equal(source.scopeEventRevision, delivered);
        assert.equal(source.scopeStale, true);
        assert.deepEqual(source.results.map(row => row.id), ids);
        assert.ok(source.results.every(row => !row.invalid && !row.pending && !row.identityUnknown));
        assert.equal(source.validations?.size || 0, 0, 'zero-row events do not create file validation work');
        assert.equal(source.panels.size, 1);
        assert.equal(scheduled, 0);
        assert.equal(f.controller.transferEventSources?.get(source), undefined);
      } finally { host.release(); await host.moving.catch(() => {}); }
    });
  }
}
