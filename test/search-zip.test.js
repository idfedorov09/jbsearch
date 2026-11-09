'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SearchEngine } = require('../src/search');
const { isConfirmedZip } = require('../src/search/zip');
const { zipFixture } = require('./zip-fixture');

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-zip-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) {
    const filename = path.join(root, name);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, contents);
  }
  return root;
}

function request(root, overrides = {}) {
  return { query: 'needle', roots: [{ path: root, name: 'fixture' }],
    scope: { kind: 'workspace' }, maxFileSizeMiB: 0.001, ...overrides };
}

test('confirmed ZIP containers of any name or size do not make text results incomplete', async t => {
  const small = zipFixture(), large = zipFixture('needle '.repeat(600));
  const root = await fixture(t, {
    'archive.docx': small,
    'large.zip': large,
    'no-extension': small,
    'text.docx': 'needle',
    'text.zip': 'another needle'
  });
  const result = await new SearchEngine().search(request(root));
  assert.equal(result.truncated, false);
  assert.deepEqual(result.results.map(item => item.relativePath).sort(), ['text.docx', 'text.zip']);
  assert.equal(result.stats.skippedFiles, 3);
  assert.equal(result.stats.skipped.binary, 3);
  assert.equal(result.stats.excludedBinaryFiles, 3);
  assert.equal(result.stats.blockingSkippedFiles, 0);
  assert.ok(result.stats.skippedDetails.every(detail => !detail.blocking && detail.format === 'ZIP'));
  assert.deepEqual(await fs.readFile(path.join(root, 'archive.docx')), small);
  assert.deepEqual(await fs.readFile(path.join(root, 'large.zip')), large);
});

test('large ZIP inspection reads bounded metadata rather than the archive body', async () => {
  const bytes = zipFixture('x'.repeat(3 * 1024 * 1024));
  let read = 0;
  const handle = { async read(buffer, offset, length, position) {
    read += length;
    const bytesRead = bytes.copy(buffer, offset, position, position + length);
    return { bytesRead, buffer };
  } };
  assert.equal(await isConfirmedZip(handle, bytes.length), true);
  assert.ok(read < 100000, `expected bounded metadata reads, read ${read} bytes`);
});

test('NUL binaries are excluded while UTF-16, invalid UTF-8 and large text remain blocking', async t => {
  const malformed = Buffer.from(zipFixture());
  const central = malformed.readUInt32LE(malformed.length - 22 + 16);
  malformed.writeUInt32LE(0, central);
  const mismatched = Buffer.from(zipFixture());
  mismatched.writeUInt32LE(1, 18); // Local and central compressed sizes disagree.
  const utf16le = Buffer.from('needle', 'utf16le');
  const utf16be = Buffer.from(utf16le).swap16();
  const root = await fixture(t, {
    'valid.zip': zipFixture(),
    'prefix.docx': Buffer.from([0x50, 0x4b, 3, 4, 0, 0]),
    'malformed.zip': malformed,
    'mismatched.zip': mismatched,
    'unknown.bin': Buffer.from('needle\0rest'),
    'utf16le.txt': utf16le,
    'utf16be.txt': utf16be,
    'utf16bom.txt': Buffer.concat([Buffer.from([0xff, 0xfe]), utf16le]),
    'invalid.txt': Buffer.from([0x61, 0xff, 0x62]),
    'large.txt': 'needle'.repeat(400),
    'normal.txt': 'needle'
  });
  const result = await new SearchEngine().search(request(root));
  assert.equal(result.results.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.stats.excludedBinaryFiles, 5);
  assert.equal(result.stats.blockingSkippedFiles, 5);
  const reasons = new Map(result.stats.skippedDetails.map(item => [item.relativePath, item]));
  for (const filename of ['prefix.docx', 'malformed.zip', 'mismatched.zip', 'unknown.bin'])
    assert.equal(reasons.get(filename).blocking, false, filename);
  for (const filename of ['utf16le.txt', 'utf16be.txt']) {
    assert.equal(reasons.get(filename).blocking, true, filename);
    assert.equal(reasons.get(filename).reason, 'encoding', filename);
  }
  assert.equal(reasons.get('utf16bom.txt').reason, 'encoding');
  assert.equal(reasons.get('invalid.txt').reason, 'encoding');
  assert.equal(reasons.get('large.txt').reason, 'tooLarge');
});

test('skip diagnostics remain bounded, retain a blocker, and identify workspace roots', async t => {
  const archives = Object.fromEntries(Array.from({ length: 22 }, (_, index) => [`zip-${index}.bin`, zipFixture()]));
  const first = await fixture(t, archives);
  const second = await fixture(t, { 'bad-encoding.txt': Buffer.from([0x6e, 0xff, 0x65]) });
  const result = await new SearchEngine().search(request(first, { roots: [
    { path: first, name: 'same' }, { path: second, name: 'same' }
  ] }));
  assert.equal(result.truncated, true);
  assert.equal(result.stats.skippedFiles, 23);
  assert.equal(result.stats.excludedBinaryFiles, 22);
  assert.equal(result.stats.blockingSkippedFiles, 1);
  assert.equal(result.stats.skippedDetails.length, 20);
  assert.equal(result.stats.skippedDetailsOmitted, 3);
  const blocker = result.stats.skippedDetails.find(detail => detail.blocking);
  assert.equal(blocker.relativePath, 'bad-encoding.txt');
  assert.equal(blocker.rootPath, second);
  assert.ok(result.stats.skippedDetails.some(detail => detail.rootPath === first));
});

test('enumeration errors stay incomplete and identify the affected root', async t => {
  const root = await fixture(t, { 'file.txt': 'needle' });
  // Node rejects ripgrep's --files argument and exits nonzero on every platform.
  const result = await new SearchEngine({ rgPath: process.execPath }).search(request(root));
  assert.equal(result.truncated, true);
  assert.equal(result.stats.blockingSkippedFiles, 1);
  assert.equal(result.stats.skippedDetails[0].kind, 'enumeration');
  assert.equal(result.stats.skippedDetails[0].path, root);
  assert.ok(result.stats.errors.length);
});

test('unreadable files remain blocking and report their path', async t => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    t.skip('POSIX permission bits do not reliably deny this process access');
    return;
  }
  const root = await fixture(t, { 'closed.txt': 'needle', 'normal.txt': 'needle' });
  const filename = path.join(root, 'closed.txt');
  await fs.chmod(filename, 0);
  t.after(() => fs.chmod(filename, 0o600).catch(() => {}));
  const result = await new SearchEngine().search(request(root));
  assert.equal(result.truncated, true);
  assert.equal(result.stats.blockingSkippedFiles, 1);
  assert.equal(result.stats.skipped.unreadable, 1);
  assert.equal(result.stats.skippedDetails[0].path, filename);
  assert.equal(result.stats.skippedDetails[0].reason, 'unreadable');
});
