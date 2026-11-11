'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { contentHash } = require('../src/content-hash');
const { SearchEngine, iterateMatches } = require('../src/search');
const { readStableDiskBaseline, assertDiskBaseline } = require('../src/disk-baseline');
const { trackDocumentChanges, reconcileDocumentResults, markDocumentIdentityUnknown } = require('../src/find-results');
const { observeDocumentSave, discardDocumentBaseline, prepareDiskBaseline,
  bindDocumentAuthority, hasCurrentDocumentAuthority } = require('../src/source-authority');

function documentFor(file, text, encoding = 'utf8') {
  const uri = { scheme: 'file', fsPath: file, toString: () => pathToFileURL(file).toString() };
  return { uri, text, encoding, version: 1, isDirty: false, isClosed: false,
    getText() { return this.text; },
    positionAt(offset) {
      offset = Math.max(0, Math.min(offset, this.text.length));
      const before = this.text.slice(0, offset).split('\n');
      return { line: before.length - 1, character: before.at(-1).replace(/\r$/, '').length };
    },
    offsetAt(position) { return this.text.split('\n').slice(0, position.line)
      .reduce((sum, line) => sum + line.length + 1, 0) + position.character; }
  };
}

async function fixture(t, initial = 'before cat\r\n', encoding = 'utf8') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-source-authority-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'input.txt');
  await fs.writeFile(file, initial);
  const document = documentFor(file, initial, encoding);
  const baseline = await readStableDiskBaseline(document.uri);
  const session = { generation: 4, scopeEventRevision: 0, query: '(cat)', options: { regex: true },
    scope: { kind: 'openEditors' }, results: [...iterateMatches(initial, { query: '(cat)', regex: true },
      { uri: document.uri.toString(), source: 'disk', contentHash: contentHash(initial),
        documentVersion: 1, diskBaseline: baseline })] };
  bindDocumentAuthority(session, document);
  const edit = () => {
    document.text = `prefix ${document.text}`;
    document.version++;
    document.isDirty = true;
    session.scopeEventRevision++;
    session.results = trackDocumentChanges(session.results, { document,
      contentChanges: [{ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }] });
    session.results = reconcileDocumentResults(session.results, document.uri,
      [...iterateMatches(document.text, { query: '(cat)', regex: true }, { uri: document.uri.toString() })], document);
  };
  const save = async (atomic = false) => {
    if (atomic) {
      await fs.writeFile(`${file}.new`, document.text);
      await fs.rename(`${file}.new`, file);
    } else await fs.writeFile(file, document.text);
    document.isDirty = false;
    session.scopeEventRevision++;
    assert.equal(observeDocumentSave(session, document), true);
  };
  return { session, document, baseline, file, directory, edit, save };
}

test('observed Save lazily rebases equal clean text, including an atomic-save inode change', async t => {
  const f = await fixture(t);
  f.edit();
  assert.equal(hasCurrentDocumentAuthority(f.session, f.document), true);
  await f.save(true);
  await assert.rejects(() => assertDiskBaseline(f.document.uri, f.baseline), /changed on disk/);
  const rebased = await prepareDiskBaseline(f.session, f.document, f.session.results);
  assert.equal(Object.isFrozen(rebased), true);
  assert.equal(rebased.contentHash, contentHash(f.document.text));
  assert.notEqual(rebased.ino, f.baseline.ino);
  assert.deepEqual(f.session.results[0].diskBaseline, f.baseline, 'helper does not silently mutate source provenance');
  assert.deepEqual(f.session.results[0].captures, ['cat']);
  await assertDiskBaseline(f.document.uri, rebased);
});

test('known dirty buffer uses unchanged independent raw disk bytes, never dirty text equality', async t => {
  const f = await fixture(t);
  f.edit();
  assert.notEqual(contentHash(f.document.text), contentHash(await fs.readFile(f.file, 'utf8')));
  assert.deepEqual(await prepareDiskBaseline(f.session, f.document, f.session.results), f.baseline);
  await fs.writeFile(f.file, 'external cat\r\n');
  await assert.rejects(() => prepareDiskBaseline(f.session, f.document, f.session.results), /changed on disk/);
});

test('unobserved Save, closed/reopened document, and unknown anchors cannot rebase by equal bytes', async t => {
  const f = await fixture(t);
  f.edit();
  await fs.writeFile(f.file, f.document.text);
  f.document.isDirty = false;
  await assert.rejects(() => prepareDiskBaseline(f.session, f.document, f.session.results), /changed on disk/);
  assert.equal(observeDocumentSave(f.session, f.document), true);
  await assert.rejects(() => prepareDiskBaseline(f.session, { ...f.document }, f.session.results), /changed on disk/);
  f.session.results = markDocumentIdentityUnknown(f.session.results, f.document.uri);
  assert.equal(observeDocumentSave(f.session, f.document), false);
  await assert.rejects(() => prepareDiskBaseline(f.session, f.document, f.session.results), /occurrence changed/);
  assert.equal(hasCurrentDocumentAuthority(f.session, f.document), false);
});

test('Close purges the ticket and document binding; dirty state after Save is not silently compared', async t => {
  const f = await fixture(t);
  f.edit();
  await f.save();
  f.document.isDirty = true;
  await assert.rejects(() => prepareDiskBaseline(f.session, f.document, f.session.results), /changed on disk/);
  f.document.isDirty = false;
  discardDocumentBaseline(f.session, f.document.uri);
  assert.equal(hasCurrentDocumentAuthority(f.session, f.document), false);
  assert.equal(observeDocumentSave(f.session, f.document), false);
});

test('state equality accepts another same-text writer after observed Save without claiming provenance', async t => {
  const f = await fixture(t);
  f.edit();
  await f.save();
  await fs.writeFile(`${f.file}.external`, f.document.text);
  await fs.rename(`${f.file}.external`, f.file);
  const rebased = await prepareDiskBaseline(f.session, f.document, f.session.results);
  assert.equal(rebased.contentHash, contentHash(f.document.text));
});

test('all asynchronous rebase boundaries reject changed epochs, generations, versions, URI, encoding, dirty and content state', async t => {
  for (const [name, mutate] of Object.entries({
    epoch: f => { f.session.scopeEventRevision++; },
    generation: f => { f.session.generation++; },
    request: f => { f.session.query = 'other'; },
    version: f => { f.document.version++; },
    uri: f => { f.document.uri = { ...f.document.uri, toString: () => 'file:///other' }; },
    encoding: f => { f.document.encoding = 'utf8bom'; },
    dirty: f => { f.document.isDirty = true; },
    closed: f => { f.document.isClosed = true; },
    content: f => { f.document.text = f.document.text.replace('prefix', 'PREFIX'); },
    revision: f => { f.session.results = f.session.results.map(row => ({ ...row, resultRevision: row.resultRevision + 1 })); },
    identity: f => { f.session.results = markDocumentIdentityUnknown(f.session.results, f.document.uri); },
    closeTicket: f => { discardDocumentBaseline(f.session, f.document.uri); },
    documentBinding: f => { bindDocumentAuthority(f.session, { ...f.document }); },
    newSave: f => { observeDocumentSave(f.session, f.document); }
  })) await t.test(name, async t => {
    const f = await fixture(t); f.edit(); await f.save();
    const selected = f.session.results.map(row => ({ ...row }));
    await assert.rejects(() => prepareDiskBaseline(f.session, f.document, selected, {
      readDisk: async (...args) => { const baseline = await readStableDiskBaseline(...args); mutate(f); return baseline; }
    }), /changed|same text|no longer current|rebased/);
  });
});

test('a same-version different clean buffer cannot manufacture observed Save authority', async t => {
  const f = await fixture(t);
  f.document.text = 'different cat\r\n';
  assert.equal(observeDocumentSave(f.session, f.document), false);
  assert.equal(hasCurrentDocumentAuthority(f.session, f.document), false);
});

test('strict Save rebase never adopts an injected identity-validated read', async t => {
  const f = await fixture(t); f.edit(); await f.save();
  await assert.rejects(() => prepareDiskBaseline(f.session, f.document, f.session.results, {
    readDisk: async (...args) => ({ ...await readStableDiskBaseline(...args), linkPolicy: 'identity-validated' })
  }), /requires strict no-follow/);
});

test('initial clean Open Editors disk authority finds matches hidden by a stale clean zero-match buffer', async t => {
  const f = await fixture(t);
  const engine = new SearchEngine(); t.after(() => engine.dispose());
  const output = await engine.search({ query: 'cat', roots: [], scope: { kind: 'openEditors' },
    sourcePolicy: 'disk-clean-buffers-dirty', respectExcludes: false,
    documents: [{ uri: f.document.uri.toString(), fsPath: f.file, text: 'stale no match',
      isDirty: false, encoding: 'utf8', version: 1 }] });
  assert.equal(output.truncated, false);
  assert.equal(output.results.length, 1);
  assert.equal(output.results[0].source, 'disk');
  assert.equal(output.results[0].contentHash, contentHash('before cat\r\n'));
});

test('clean Open Editors uses only explicit supported lossless codecs, not guessed legacy or conflicting BOM text', async t => {
  const f = await fixture(t);
  const engine = new SearchEngine(); t.after(() => engine.dispose());
  const request = encoding => ({ query: 'cat', roots: [], scope: { kind: 'openEditors' },
    sourcePolicy: 'disk-clean-buffers-dirty', respectExcludes: false,
    documents: [{ uri: f.document.uri.toString(), fsPath: f.file, isDirty: false, encoding, version: 1 }] });
  await fs.writeFile(f.file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('cat\r\n', 'utf16le')]));
  const wide = await engine.search(request('utf16le'));
  assert.equal(wide.truncated, false);
  assert.equal(wide.results[0].matchText, 'cat');
  for (const encoding of ['utf16be', 'windows1251']) {
    const unsupported = await engine.search(request(encoding));
    assert.equal(unsupported.truncated, true);
    assert.equal(unsupported.stats.skipped.encoding, 1);
    assert.equal(unsupported.results.length, 0);
  }
  for (const bom of [[0xef, 0xbb, 0xbf], [0xff, 0xfe, 0, 0], [0, 0, 0xfe, 0xff]]) {
    await fs.writeFile(f.file, Buffer.concat([Buffer.from(bom), Buffer.from('cat')]));
    for (const encoding of ['utf16le', 'utf16be']) {
      const conflict = await engine.search(request(encoding));
      assert.equal(conflict.truncated, true);
      assert.equal(conflict.stats.skipped.encoding, 1);
      assert.equal(conflict.results.length, 0);
    }
  }
});

test('initial dirty file snapshots retain independent disk baselines and unavailable sources stay blocked', async t => {
  const f = await fixture(t);
  const engine = new SearchEngine(); t.after(() => engine.dispose());
  const request = { query: 'cat', roots: [], scope: { kind: 'openEditors' },
    sourcePolicy: 'disk-clean-buffers-dirty', respectExcludes: false,
    documents: [{ uri: f.document.uri.toString(), fsPath: f.file, text: 'unsaved cat cat',
      isDirty: true, encoding: 'utf8', version: 4 }] };
  const output = await engine.search(request);
  assert.equal(output.truncated, false);
  assert.equal(output.results.length, 2);
  assert.equal(output.results[0].source, 'snapshot');
  assert.equal(output.results[0].contentHash, contentHash('unsaved cat cat'));
  await assertDiskBaseline(f.document.uri, output.results[0].diskBaseline);
  await fs.rm(f.file);
  const missing = await engine.search(request);
  assert.equal(missing.truncated, true);
  assert.equal(missing.results.length, 2);
  assert.ok(missing.results.every(row => row.invalid && row.unavailable && row.diskBaselineUnavailable));
});

test('unavailable clean Open Editors inputs cannot become a complete zero-match snapshot', async t => {
  const f = await fixture(t);
  const engine = new SearchEngine(); t.after(() => engine.dispose());
  const request = { query: 'cat', roots: [], scope: { kind: 'openEditors' },
    sourcePolicy: 'disk-clean-buffers-dirty', respectExcludes: false, maxFileSizeMiB: 0.001,
    documents: [{ uri: f.document.uri.toString(), fsPath: f.file, isDirty: false, encoding: 'utf8' }] };
  await fs.rm(f.file);
  const missing = await engine.search(request);
  assert.equal(missing.truncated, true);
  assert.equal(missing.stats.skipped.unreadable, 1);
  assert.equal(missing.results.length, 0);
  await fs.writeFile(f.file, 'cat'.repeat(1000));
  const oversized = await engine.search(request);
  assert.equal(oversized.truncated, true);
  assert.equal(oversized.stats.skipped.tooLarge, 1);
  assert.equal(oversized.results.length, 0);
  if (process.platform !== 'win32') {
    await fs.rm(f.file);
    const target = path.join(f.directory, 'target.txt');
    await fs.writeFile(target, 'cat');
    await fs.symlink(target, f.file);
    const linked = await engine.search(request);
    assert.equal(linked.truncated, true);
    assert.equal(linked.stats.skipped.unreadable, 1);
    assert.equal(linked.results.length, 0);
  }
});

test('current disk observation admission refuses an expired prepared Save proof and cannot be manufactured from bytes', async t => {
  const { commitDiskObservation } = require('../src/source-authority');
  const f = await fixture(t); f.edit(); await f.save();
  const rebased = await prepareDiskBaseline(f.session, f.document, f.session.results);
  f.session.scopeEventRevision++;
  assert.throws(() => commitDiskObservation(f.session, f.document, rebased), /source changed/);
  discardDocumentBaseline(f.session, f.document.uri.toString());
  bindDocumentAuthority(f.session, f.document);
  commitDiskObservation(f.session, f.document, { ...rebased }); // No private proof => no admission.
  f.document.isDirty = true;
  await assert.rejects(() => prepareDiskBaseline(f.session, f.document, f.session.results), /changed on disk/);
});
