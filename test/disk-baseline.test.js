'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { SearchEngine, iterateMatches } = require('../src/search');
const { reconcileDocumentResults } = require('../src/find-results');
const { assertDiskBaseline, commonDiskBaseline, readStableDiskBaseline } = require('../src/disk-baseline');
const { contentHash } = require('../src/content-hash');
const { constants } = require('node:fs');

test('disk provenance survives snapshot validation, including UTF-8 BOM and CRLF', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-disk-baseline-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'input.txt');
  const text = 'header\r\nneedle\r\n';
  await fs.writeFile(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]));
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  const found = await engine.search({ query: 'needle', roots: [{ path: directory, name: 'root' }],
    scope: { kind: 'workspace' }, respectExcludes: false });
  assert.equal(found.results.length, 1);
  const original = found.results[0], uri = { fsPath: file, toString: () => pathToFileURL(file).toString() };
  assert.equal(original.source, 'disk');
  const document = { uri, version: 7, getText: () => text, positionAt(offset) {
    const lines = text.slice(0, offset).split('\n');
    return { line: lines.length - 1, character: lines.at(-1).replace(/\r$/, '').length };
  }, offsetAt(position) {
    return text.split('\n').slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character;
  } };
  const fresh = [...iterateMatches(text, { query: 'needle' }, { uri: uri.toString(),
    source: 'snapshot', documentVersion: 7 })];
  const [result] = reconcileDocumentResults([original], uri, fresh, document);
  assert.equal(result.source, 'snapshot');
  assert.equal(result.documentVersion, 7);
  assert.equal(result.trackedDocumentVersion, 7);
  assert.equal(result.diskBaseline.origin, 'disk');
  assert.equal(result.diskBaseline.mtimeMs, original.mtimeMs);
  assert.equal(result.diskBaseline.fileSize, original.fileSize);
  assert.equal(result.diskBaseline.byteHash, original.diskByteHash);
  await assertDiskBaseline(uri, result.diskBaseline);
  assert.throws(() => commonDiskBaseline([result, { ...result, diskBaseline: undefined }]), /inconsistent/);

  // Even forged matching metadata cannot make different bytes pass the raw hash.
  const replacement = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('header\r\nneedlf\r\n')]);
  await fs.writeFile(file, replacement);
  const now = await fs.stat(file);
  await assert.rejects(() => assertDiskBaseline(uri, { ...result.diskBaseline,
    mtimeMs: now.mtimeMs, ctimeMs: now.ctimeMs, fileSize: now.size, dev: now.dev, ino: now.ino }), /changed on disk/);
  await assert.rejects(() => assertDiskBaseline(uri, result.diskBaseline), /changed on disk/);
});

test('a disk baseline rejects a symlink or unavailable file', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-disk-symlink-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'input.txt');
  await fs.writeFile(file, 'needle');
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  const found = await engine.search({ query: 'needle', roots: [{ path: directory, name: 'root' }],
    scope: { kind: 'workspace' }, respectExcludes: false });
  const baseline = commonDiskBaseline(found.results);
  const uri = { fsPath: file };
  await fs.rm(file);
  await assert.rejects(() => assertDiskBaseline(uri, baseline), /ENOENT/);
  if (process.platform !== 'win32') {
    const target = path.join(directory, 'target.txt');
    await fs.writeFile(target, 'needle');
    await fs.symlink(target, file);
    await assert.rejects(() => assertDiskBaseline(uri, baseline), /changed on disk/);
  }
});

test('lossless saved decoding hashes exact UTF-16 text with UTF-8/UTF-16 BOMs and chunk-boundary surrogate pairs', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-disk-encoding-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const uri = { fsPath: path.join(directory, 'input.txt') };
  for (const encoding of ['utf8', 'utf8bom', 'utf16le', 'utf16be']) {
    const text = `${encoding === 'utf8' ? '' : '\ufeff'}${'x'.repeat(65531)}\ud83d\ude00\r\ncat`;
    let bytes = Buffer.from(text, encoding.startsWith('utf16') ? 'utf16le' : 'utf8');
    if (encoding === 'utf16be') bytes = bytes.swap16();
    if (encoding !== 'utf8') bytes = Buffer.concat([
      Buffer.from(encoding === 'utf8bom' ? [0xef, 0xbb, 0xbf] : encoding === 'utf16le' ? [0xff, 0xfe] : [0xfe, 0xff]), bytes
    ]);
    await fs.writeFile(uri.fsPath, bytes);
    const baseline = await readStableDiskBaseline(uri, { encoding });
    assert.equal(baseline.contentHash, contentHash(text), encoding);
    assert.equal(baseline.encoding, encoding);
    assert.equal(baseline.linkPolicy, 'no-follow');
    await assertDiskBaseline(uri, baseline);
  }
});

test('saved decoding rejects lossy Unicode, conflicting BOM, unknown and legacy codecs', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-disk-invalid-encoding-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const uri = { fsPath: path.join(directory, 'input.txt') };
  for (const [encoding, bytes] of [
    ['utf8', [0xc3, 0x28]], ['utf8', [0xef, 0xbb, 0xbf, 0x61]],
    ['utf8bom', [0x61]], ['utf16le', [0xff, 0xfe, 0x00, 0xd8]],
    ['utf16be', [0xfe, 0xff, 0x00]], ['utf16le', [0xfe, 0xff, 0x00, 0x61]]
  ]) {
    await fs.writeFile(uri.fsPath, Buffer.from(bytes));
    await assert.rejects(() => readStableDiskBaseline(uri, { encoding }), /encoding|encoded|valid/);
  }
  for (const encoding of ['windows1251', 'unknown', ''])
    await assert.rejects(() => readStableDiskBaseline(uri, { encoding }), /losslessly/);
});

test('disk size is bounded before opening and no-follow rejects a link swapped in after lstat', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-disk-open-race-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const uri = { fsPath: path.join(directory, 'input.txt') };
  await fs.writeFile(uri.fsPath, 'longer than limit');
  const originalOpen = fs.open;
  let opens = 0;
  fs.open = async (...args) => { opens++; return originalOpen(...args); };
  t.after(() => { fs.open = originalOpen; });
  await assert.rejects(() => readStableDiskBaseline(uri, { maxBytes: 2 }), /size limit/);
  assert.equal(opens, 0);
  if (process.platform === 'win32') return;
  const target = path.join(directory, 'target.txt');
  await fs.writeFile(target, 'longer than limit');
  fs.open = async (...args) => {
    await fs.rm(uri.fsPath);
    await fs.symlink(target, uri.fsPath);
    return originalOpen(...args);
  };
  await assert.rejects(() => readStableDiskBaseline(uri), error => error.code === 'ELOOP');
});

test('missing no-follow capability blocks only strict rebase reads, not explicit identity validation', async t => {
  const vm = require('node:vm'), syncFs = require('node:fs');
  const module = { exports: {} };
  vm.runInNewContext(syncFs.readFileSync(require.resolve('../src/disk-baseline'), 'utf8'), {
    module, exports: module.exports, Buffer, TextDecoder,
    require: id => id === 'node:fs' ? { constants: { ...constants, O_NOFOLLOW: 0 } } :
      id === './document-snapshot' ? require('../src/document-snapshot') : require(id)
  });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-disk-portable-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const uri = { fsPath: path.join(directory, 'input.txt') };
  await fs.writeFile(uri.fsPath, 'cat');
  await assert.rejects(() => module.exports.readStableDiskBaseline(uri), /without following links/);
  const baseline = await module.exports.readStableDiskBaseline(uri, { linkPolicy: 'identity-validated' });
  assert.equal(baseline.linkPolicy, 'identity-validated');
  await module.exports.assertDiskBaseline(uri, baseline);
  await assert.rejects(() => module.exports.assertDiskBaseline(uri,
    { ...baseline, linkPolicy: 'no-follow' }), /without following links/);
  assert.throws(() => commonDiskBaseline([{ diskBaseline: baseline },
    { diskBaseline: { ...baseline, linkPolicy: 'no-follow' } }]), /inconsistent/);
  await assert.rejects(() => module.exports.readStableDiskBaseline(uri,
    { expectedBaseline: { ...baseline, linkPolicy: 'no-follow' }, linkPolicy: 'identity-validated' }), /downgraded/);
  await fs.writeFile(uri.fsPath, 'dog');
  await assert.rejects(() => module.exports.assertDiskBaseline(uri, baseline), /changed on disk/);
});
