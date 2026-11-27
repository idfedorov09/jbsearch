'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { SearchEngine } = require('../src/search');

async function fixture(t, files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-prefilter-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(directory, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
  return directory;
}

function requestFor(directory, overrides = {}) {
  return {
    query: 'needle',
    roots: [{ path: directory, name: 'fixture' }],
    scope: { kind: 'workspace' },
    respectExcludes: true,
    ...overrides
  };
}

async function search(t, request) {
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  return engine.search(request);
}

// Volatile disk identity (timestamps, inode) is not part of the comparison.
const comparable = (output) =>
  output.results
    .map(({ relativePath, offset, length, line, character, matchText, preview, contentHash, diskByteHash }) =>
      ({ relativePath, offset, length, line, character, matchText, preview, contentHash, diskByteHash }))
    .sort((a, b) => `${a.relativePath}:${a.offset}`.localeCompare(`${b.relativePath}:${b.offset}`));

const corpus = {
  'src/a.js': 'const needle = 1;\nNEEDLE again\n',
  'src/b.txt': 'nothing to see here\n',
  'src/c.php': '<?php\nfirst line\nsecond needle line\n',
  'src/deep/d.md': 'Needle in a heading\r\nand a needle\r\n',
  'src/e.txt': 'first line\r\nsecond needle line\r\n'
};

for (const [label, overrides] of [
  ['case-insensitive literal', {}],
  ['case-sensitive literal', { caseSensitive: true }],
  ['whole-word literal', { wholeWord: true }],
  ['multi-line literal on LF and CRLF files', { query: 'first line\nsecond needle' }]
]) {
  test(`ripgrep prefilter returns the full-scan results for a ${label}`, async (t) => {
    const directory = await fixture(t, corpus);
    const full = await search(t, requestFor(directory, overrides));
    const prefiltered = await search(t, requestFor(directory, { ...overrides, ripgrepPrefilter: true }));
    assert.ok(full.results.length > 0);
    assert.deepEqual(comparable(prefiltered), comparable(full));
    assert.equal(prefiltered.truncated, full.truncated);
    assert.equal(prefiltered.stats.filesMatched, full.stats.filesMatched);
  });
}

test('ripgrep prefilter reads only candidate files', async (t) => {
  const directory = await fixture(t, corpus);
  const full = await search(t, requestFor(directory));
  const output = await search(t, requestFor(directory, { ripgrepPrefilter: true }));
  // 4 of the 5 files contain "needle"; src/b.txt is never read.
  assert.equal(full.stats.filesScanned, 5);
  assert.equal(output.stats.filesScanned, 4);
  assert.equal(output.stats.filesMatched, 4);
});

test('ripgrep prefilter still searches unsaved buffers whose disk text has no match', async (t) => {
  const directory = await fixture(t, { 'dirty.js': 'saved text\n', 'clean.js': 'nothing\n' });
  const fsPath = path.join(directory, 'dirty.js');
  const document = { fsPath, uri: pathToFileURL(fsPath).toString(), text: 'edited needle\n', version: 2, isDirty: true };
  const output = await search(t, requestFor(directory, { ripgrepPrefilter: true, documents: [document] }));
  assert.deepEqual(output.results.map((result) => [result.relativePath, result.source]), [['dirty.js', 'snapshot']]);
});

test('ripgrep prefilter keeps ignore rules for unsaved buffers', async (t) => {
  const directory = await fixture(t, { '.gitignore': 'ignored.js\n', 'ignored.js': 'saved\n', 'kept.js': 'needle\n' });
  const fsPath = path.join(directory, 'ignored.js');
  const document = { fsPath, uri: pathToFileURL(fsPath).toString(), text: 'needle\n', version: 2, isDirty: true };
  const output = await search(t, requestFor(directory, { ripgrepPrefilter: true, documents: [document] }));
  assert.deepEqual(output.results.map((result) => result.relativePath), ['kept.js']);
});

test('ripgrep prefilter honors excludes and ignore files like the full scan', async (t) => {
  const directory = await fixture(t, {
    '.gitignore': 'ignored/\n',
    'ignored/a.js': 'needle\n',
    'excluded/b.js': 'needle\n',
    'kept/c.js': 'needle\n'
  });
  const roots = [{ path: directory, name: 'fixture', exclude: { '**/excluded': true } }];
  for (const useIgnoreFiles of [true, false]) {
    const request = requestFor(directory, { roots: roots.map((root) => ({ ...root, useIgnoreFiles })) });
    const full = await search(t, request);
    const prefiltered = await search(t, { ...request, ripgrepPrefilter: true });
    assert.deepEqual(comparable(prefiltered), comparable(full));
  }
});

test('ripgrep prefilter is not used for regex queries', async (t) => {
  // A non-matching oversized file is reported as a blocking skip by the full scan only.
  const directory = await fixture(t, { 'big.txt': 'x'.repeat(2048), 'small.txt': 'needle\n' });
  const regex = await search(t, requestFor(directory, {
    query: 'need(le)', regex: true, ripgrepPrefilter: true, maxFileSizeMiB: 0.001
  }));
  assert.equal(regex.results.length, 1);
  assert.equal(regex.stats.skipped.tooLarge, 1);
  assert.equal(regex.truncated, true);
});

test('ripgrep prefilter trade-off: only matching unreadable inputs block completeness', async (t) => {
  const directory = await fixture(t, {
    'big-without-match.txt': 'x'.repeat(2048),
    'big-with-match.txt': `${'x'.repeat(2048)} needle`,
    'small.txt': 'needle\n'
  });
  const request = requestFor(directory, { ripgrepPrefilter: true, maxFileSizeMiB: 0.001 });
  const output = await search(t, request);
  assert.deepEqual(output.results.map((result) => result.relativePath), ['small.txt']);
  assert.equal(output.stats.skipped.tooLarge, 1);
  assert.equal(output.truncated, true);

  await fs.rm(path.join(directory, 'big-with-match.txt'));
  const complete = await search(t, request);
  assert.equal(complete.stats.skipped.tooLarge, 0);
  assert.equal(complete.truncated, false);
});

test('without the setting the full scan behavior is unchanged', async (t) => {
  const directory = await fixture(t, { 'big.txt': 'x'.repeat(2048), 'small.txt': 'needle\n' });
  const output = await search(t, requestFor(directory, { maxFileSizeMiB: 0.001 }));
  assert.equal(output.stats.skipped.tooLarge, 1);
  assert.equal(output.truncated, true);
});
