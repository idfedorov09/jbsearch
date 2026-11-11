'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requestFingerprint, documentFingerprint, knownDiskBaseline, sameOccurrences, samePlans } = require('../src/replace-preflight');
const { completePreflight, validWorkerCompletion } = require('../src/search/diagnostics');

function match(offset = 0, extra = {}) {
  return { id: `file:///a:${offset}`, uri: 'file:///a', offset, length: 3, matchText: 'cat',
    range: { start: { line: 0, character: offset }, end: { line: 0, character: offset + 3 } },
    captures: ['cat', undefined], groups: { word: 'cat', optional: undefined }, ...extra };
}

test('preflight compares occurrence identity and capture semantics, not output order or row IDs', () => {
  const first = match(), second = match(5);
  assert.equal(sameOccurrences([first, second], [{ ...second, id: 'other' }, { ...first, id: 'new' }]), true);
  assert.equal(sameOccurrences([first], [first, second]), false);
  assert.equal(sameOccurrences([first, second], [first]), false);
  assert.equal(sameOccurrences([first], [match(1)]), false);
  assert.equal(sameOccurrences([first], [match(0, { captures: ['cat', ''] })]), false);
  assert.equal(sameOccurrences([first], [match(0, { groups: { word: 'cat' } })]), false);
  assert.equal(sameOccurrences([first], [match(0, { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } } })]), false);
  assert.equal(sameOccurrences([first, first], [first, second]), false);
  assert.equal(sameOccurrences([first, first], [first, first]), false);
  assert.equal(sameOccurrences([first, second], [first, { ...second, id: first.id }]), false);
  assert.equal(sameOccurrences([first], [{ ...first, uri: 'FILE:///a' }], uri => uri.toLowerCase()), true);
});

test('preflight compares large snapshots without per-file or per-location scans', () => {
  const count = 50000;
  const old = Array.from({ length: count }, (_, index) => match(index * 4));
  const fresh = old.map(value => ({ ...value, id: `fresh-${value.offset}` })).reverse();
  assert.equal(sameOccurrences(old, fresh), true);
  fresh[0] = { ...fresh[0], captures: ['different'] };
  assert.equal(sameOccurrences(old, fresh), false);
});

test('zero-width occurrences in different files or positions are distinct', () => {
  const first = match(0, { id: 'a:0', length: 0, matchText: '',
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } });
  const sameFileNext = match(1, { id: 'a:1', length: 0, matchText: '',
    range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } } });
  const otherFile = { ...first, id: 'b:0', uri: 'file:///b' };
  assert.equal(sameOccurrences([first, sameFileNext, otherFile], [otherFile, first, sameFileNext]), true);
  assert.equal(sameOccurrences([first, { ...first, id: 'ambiguous' }], [first, { ...first, id: 'new' }]), false);
});

test('search fingerprints include scope and open editor membership, not document contents or preserve case', () => {
  const base = { query: 'cat', scope: { kind: 'openEditors' }, preserveCase: false,
    roots: [{ path: '/one', exclude: { a: true, b: true } }],
    documents: [{ uri: 'file:///a', version: 1, text: 'cat' }] };
  assert.equal(requestFingerprint(base), requestFingerprint({ ...base, preserveCase: true,
    roots: [{ exclude: { b: true, a: true }, path: '/one' }], documents: [{ uri: 'file:///a', version: 2, text: 'new' }] }));
  assert.notEqual(requestFingerprint(base), requestFingerprint({ ...base, documents: [] }));
  assert.notEqual(requestFingerprint(base), requestFingerprint({ ...base, roots: [] }));
  assert.notEqual(documentFingerprint(base), documentFingerprint({ ...base, documents: [{ uri: 'file:///a', version: 2, text: 'cat' }] }));
  assert.notEqual(documentFingerprint(base), documentFingerprint({ ...base, documents: [{ uri: 'file:///a', version: 1, text: 'dog' }] }));
  const utf8 = { ...base, documents: [{ uri: 'file:///a', version: 1, text: 'cat', encoding: 'utf8' }] };
  const utf16 = { ...base, documents: [{ uri: 'file:///a', version: 1, text: 'cat', encoding: 'utf16le' }] };
  assert.notEqual(documentFingerprint(utf8), documentFingerprint(utf16));
  const loneHigh = { ...base, documents: [{ uri: 'file:///a', version: 1, text: '\ud800' }] };
  const loneLow = { ...base, documents: [{ uri: 'file:///a', version: 1, text: '\udc00' }] };
  const replacementCharacter = { ...base, documents: [{ uri: 'file:///a', version: 1, text: '\ufffd' }] };
  assert.notEqual(documentFingerprint(loneHigh), documentFingerprint(loneLow));
  assert.notEqual(documentFingerprint(loneHigh), documentFingerprint(replacementCharacter));
});

test('replacement plan comparisons include final text and range', () => {
  const a = { uri: 'file:///a', range: match().range, replacement: 'x' };
  const b = { uri: 'file:///b', range: match().range, replacement: 'x' };
  assert.equal(samePlans([a, b], [b, a]), true);
  assert.equal(samePlans([a], [{ ...a, replacement: 'y' }]), false);
});

test('effective document fingerprint ignores clean cache admission but retains dirty and Open Editors authority', () => {
  const request = { sourcePolicy: 'disk-clean-buffers-dirty', scope: { kind: 'workspace' },
    roots: [{ path: '/project' }], documents: [] };
  const document = { uri: 'file:///project/a', fsPath: '/project/a', isDirty: false,
    encoding: 'utf8', version: 1 };
  assert.equal(documentFingerprint(request), documentFingerprint({ ...request, documents: [document] }));
  const dirty = { ...document, isDirty: true, text: 'unsaved' };
  assert.notEqual(documentFingerprint(request), documentFingerprint({ ...request, documents: [dirty] }));
  assert.notEqual(documentFingerprint({ ...request, documents: [dirty] }),
    documentFingerprint({ ...request, documents: [{ ...dirty, text: 'changed' }] }));
  assert.equal(documentFingerprint(request), documentFingerprint({ ...request,
    documents: [{ ...dirty, uri: 'file:///outside/a', fsPath: '/outside/a' }] }));
  const editors = { ...request, scope: { kind: 'openEditors' } };
  assert.notEqual(requestFingerprint(editors), requestFingerprint({ ...editors, documents: [document] }));
});

test('recorded disk admission requires origin, exact URI, full raw hash and explicit safe link policy', () => {
  const baseline = { origin: 'disk', uri: 'file:///source', byteHash: 'a'.repeat(64),
    fileSize: 3, mtimeMs: 1, ctimeMs: 2, dev: 3, ino: 4, linkPolicy: 'no-follow' };
  assert.equal(knownDiskBaseline(baseline, baseline.uri), true);
  assert.equal(knownDiskBaseline({ ...baseline, linkPolicy: 'identity-validated' }, baseline.uri), true);
  assert.equal(knownDiskBaseline(baseline, 'FILE:///SOURCE', value => value.toLowerCase()), true);
  assert.equal(knownDiskBaseline(baseline, 'file:///other'), false);
  for (const field of Object.keys(baseline)) {
    const incomplete = { ...baseline }; delete incomplete[field];
    assert.equal(knownDiskBaseline(incomplete, baseline.uri), false, field);
  }
  for (const patch of [{ origin: 'buffer' }, { uri: '' }, { byteHash: 'partial' },
    { byteHash: 'g'.repeat(64) }, { fileSize: -1 }, { fileSize: 1.5 },
    { mtimeMs: Infinity }, { ctimeMs: NaN }, { dev: '3' }, { ino: undefined },
    { linkPolicy: 'unsafe-follow' }])
    assert.equal(knownDiskBaseline({ ...baseline, ...patch }, baseline.uri), false, JSON.stringify(patch));
});

test('preflight and raw worker completion require consistent, complete statistics', () => {
  const result = match();
  const good = { results: [result], truncated: false, stats: {
    filesScanned: 1, filesMatched: 1, matches: 1, skippedFiles: 0,
    excludedBinaryFiles: 0, blockingSkippedFiles: 0,
    skipped: { tooLarge: 0, binary: 0, encoding: 0, unreadable: 0 },
    skippedDetails: [], skippedDetailsOmitted: 0, errors: [], cancelled: false, timedOut: false
  } };
  assert.equal(completePreflight(good), true);
  assert.equal(validWorkerCompletion({ type: 'done', ...good }, 1), true);
  const variants = [
    value => { delete value.stats.skippedFiles; },
    value => { delete value.stats.excludedBinaryFiles; },
    value => { delete value.stats.blockingSkippedFiles; },
    value => { delete value.stats.skipped.unreadable; },
    value => { delete value.stats.skippedDetails; },
    value => { value.stats.skipped.unreadable = 1; },
    value => { value.stats.matches = 10; },
    value => { value.stats.filesScanned = 0; },
    value => { value.stats.skippedDetailsOmitted = 1; },
    value => { value.reason = 'limit'; },
    value => { value.reason = 'unknown'; },
    value => { value.truncated = true; },
    value => { value.stats.cancelled = true; },
    value => { value.stats.timedOut = true; }
  ];
  for (const mutate of variants) {
    const value = structuredClone(good);
    mutate(value);
    assert.equal(completePreflight(value), false, mutate.toString());
  }
  const noTruncationFlag = { type: 'done', stats: good.stats };
  assert.equal(validWorkerCompletion(noTruncationFlag, 1), false);
  const noStats = { type: 'done', truncated: false, stats: { ...good.stats } };
  delete noStats.stats.skippedFiles;
  assert.equal(validWorkerCompletion(noStats, 1), false);
  const binary = structuredClone(good);
  Object.assign(binary.stats, { skippedFiles: 1, excludedBinaryFiles: 1,
    skipped: { ...binary.stats.skipped, binary: 1 },
    skippedDetails: [{ reason: 'binary', blocking: false }] });
  assert.equal(completePreflight(binary), true, 'an explicitly excluded binary remains outside text scope');
});
