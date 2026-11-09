'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SearchEngine } = require('../src/search');
const { classifyBytes } = require('../src/search/binary');

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-binary-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) await fs.writeFile(path.join(root, name), contents);
  return root;
}

function request(root, options = {}) {
  return { query: 'needle', roots: [{ path: root, name: 'fixture' }],
    scope: { kind: 'workspace' }, maxFileSizeMiB: 2, ...options };
}

function utf32(value, littleEndian) {
  const bytes = Buffer.alloc(value.length * 4);
  for (let index = 0; index < value.length; index += 1)
    if (littleEndian) bytes.writeUInt32LE(value.charCodeAt(index), index * 4);
    else bytes.writeUInt32BE(value.charCodeAt(index), index * 4);
  return bytes;
}

test('NUL data and binary signatures are excluded before searching even without a ZIP format', async t => {
  const files = {
    'text.txt': 'needle',
    'text.png': 'needle in an ordinary text file',
    'binary.bin': Buffer.from('needle\0outside text search'),
    'late.bin': Buffer.from(`${'x'.repeat(9000)}needle\0data`),
    'image.png': Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('needle')]),
    'photo.jpg': Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('needle')]),
    'document.pdf': '%PDF-1.7\nneedle\n%%EOF'
  };
  const root = await fixture(t, files);
  const result = await new SearchEngine().search(request(root));
  assert.equal(result.truncated, false);
  assert.deepEqual(result.results.map(item => item.relativePath).sort(), ['text.png', 'text.txt']);
  assert.equal(result.stats.excludedBinaryFiles, 5);
  assert.equal(result.stats.blockingSkippedFiles, 0);
  assert.ok(result.stats.skippedDetails.every(item => item.reason === 'binary' && !item.blocking));
  for (const name of ['binary.bin', 'late.bin', 'image.png', 'photo.jpg', 'document.pdf'])
    assert.deepEqual(await fs.readFile(path.join(root, name)), Buffer.from(files[name]));
});

test('large recognized binaries do not block, but unclassified oversized text still does', async t => {
  const root = await fixture(t, {
    'large.pdf': `%PDF-1.7\n${'needle '.repeat(500)}`,
    'large.bin': Buffer.concat([Buffer.from([1, 0, 2, 0, 3]), Buffer.alloc(3000, 1)]),
    'text.txt': 'needle',
    'large.txt': 'needle '.repeat(500)
  });
  const result = await new SearchEngine().search(request(root, { maxFileSizeMiB: 0.001 }));
  assert.equal(result.results.length, 1);
  assert.equal(result.stats.excludedBinaryFiles, 2);
  assert.equal(result.stats.blockingSkippedFiles, 1);
  assert.equal(result.stats.skipped.tooLarge, 1);
  assert.equal(result.truncated, true);
});

test('UTF-16/32 BOMs, likely BOM-less wide text and invalid UTF-8 remain blocking', async t => {
  const le16 = Buffer.from('needle', 'utf16le'), be16 = Buffer.from(le16).swap16();
  const le32 = utf32('needle', true), be32 = utf32('needle', false);
  const unicode16 = Buffer.from('\u041f\u0440\u0438\u0432\u0435\u0442', 'utf16le');
  const unicode32 = utf32('\u4f60\u597d\u4e16\u754c', true);
  const root = await fixture(t, {
    'utf16le.txt': le16, 'utf16be.txt': be16,
    'utf16le-bom.txt': Buffer.concat([Buffer.from([0xff, 0xfe]), le16]),
    'utf16be-bom.txt': Buffer.concat([Buffer.from([0xfe, 0xff]), be16]),
    'utf32le.txt': le32, 'utf32be.txt': be32,
    'utf16le-cyrillic.txt': unicode16, 'utf16be-cyrillic.txt': Buffer.from(unicode16).swap16(),
    'utf32le-cjk.txt': unicode32,
    'utf32le-bom.txt': Buffer.concat([Buffer.from([0xff, 0xfe, 0, 0]), le32]),
    'utf32be-bom.txt': Buffer.concat([Buffer.from([0, 0, 0xfe, 0xff]), be32]),
    'unknown-encoding.txt': Buffer.from([0x61, 0xff, 0x62]),
    'normal.txt': 'needle'
  });
  const result = await new SearchEngine().search(request(root));
  assert.equal(result.truncated, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.stats.excludedBinaryFiles, 0);
  assert.equal(result.stats.blockingSkippedFiles, 12);
  assert.ok(result.stats.skippedDetails.every(item => item.blocking && item.reason === 'encoding'));
});

test('mixed-script UTF-16 without BOM remains blocking in both byte orders', async t => {
  const samples = [
    'A\u4f60', '\u{1f642}a', '\u4f60\u597d needle',
    '\u4f60\u597d\u4e16\u754c needle', 'a\u736d needle'
  ];
  const files = { 'normal.txt': 'needle', 'binary.bin': Buffer.from('hello\0world\0foo\0bar\0') };
  for (let index = 0; index < samples.length; index += 1) {
    const littleEndian = Buffer.from(samples[index], 'utf16le');
    files[`wide-${index}-le.txt`] = littleEndian;
    files[`wide-${index}-be.txt`] = Buffer.from(littleEndian).swap16();
  }
  const root = await fixture(t, files);
  const result = await new SearchEngine().search(request(root));
  assert.deepEqual(result.results.map(item => item.relativePath), ['normal.txt']);
  assert.equal(result.truncated, true);
  assert.equal(result.stats.blockingSkippedFiles, samples.length * 2);
  assert.equal(result.stats.excludedBinaryFiles, 1);
  assert.equal(result.stats.skipped.encoding, samples.length * 2);
});

test('incomplete PDF/GIF prefixes do not exclude text; recognized binary headers still do', async t => {
  const wasm = Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x3b]);
  const root = await fixture(t, {
    'pdf-prefix.txt': '%PDF- is a prefix; needle',
    'gif-prefix.txt': 'GIF89a is a GIF version; needle',
    'image.gif': Buffer.concat([gif, Buffer.from('needle')]),
    'module.wasm': Buffer.concat([wasm, Buffer.from('needle')])
  });
  const result = await new SearchEngine().search(request(root));
  assert.deepEqual(result.results.map(item => item.relativePath).sort(), ['gif-prefix.txt', 'pdf-prefix.txt']);
  assert.equal(result.truncated, false);
  assert.equal(result.stats.excludedBinaryFiles, 2);
  assert.deepEqual(classifyBytes(wasm), { kind: 'binary', format: 'WebAssembly' });
  assert.deepEqual(classifyBytes(gif), { kind: 'binary', format: 'GIF' });
});

test('decoded open-editor snapshots containing NUL are excluded; ordinary snapshots remain searchable', async () => {
  const result = await new SearchEngine().search({ query: 'needle', roots: [],
    scope: { kind: 'openEditors' }, documents: [
      { uri: 'untitled:binary', displayName: 'binary', text: 'needle\0needle', version: 1 },
      { uri: 'untitled:text', displayName: 'text', text: 'needle', version: 1 }
    ] });
  assert.equal(result.truncated, false);
  assert.deepEqual(result.results.map(item => item.uri), ['untitled:text']);
  assert.equal(result.stats.excludedBinaryFiles, 1);
  assert.equal(result.stats.skippedDetails[0].path, 'untitled:binary');
});
