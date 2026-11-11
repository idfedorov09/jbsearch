'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { contentHash } = require('../src/content-hash');
const { iterateMatches } = require('../src/search');
const {
  sortResults,
  trackDocumentChanges,
  reconcileDocumentResults,
  markDocumentUnavailable,
  markDocumentIdentityUnknown
} = require('../src/find-results');

const uri = 'file:///workspace/src/example.bl';
const otherUri = 'file:///workspace/src/other.bl';

function documentFor(text, version = 1, target = uri) {
  const lines = [];
  let start = 0;
  for (const ending of text.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ start, end: ending.index });
    start = ending.index + ending[0].length;
  }
  lines.push({ start, end: text.length });
  return {
    uri: { toString: () => target },
    version,
    getText: () => text,
    positionAt(offset) {
      offset = Math.min(text.length, Math.max(0, offset));
      let line = 0;
      while (line + 1 < lines.length && lines[line + 1].start <= offset) line += 1;
      return { line, character: Math.min(offset, lines[line].end) - lines[line].start };
    },
    offsetAt(position) {
      const line = lines[Math.max(0, Math.min(position.line, lines.length - 1))];
      return Math.min(line.end, line.start + Math.max(0, position.character));
    }
  };
}

function matches(text, query = 'cat', metadata = {}, request = {}) {
  return [
    ...iterateMatches(
      text,
      { query, ...request },
      {
        uri,
        rootName: 'workspace',
        relativePath: 'src/example.bl',
        label: 'example.bl',
        documentVersion: 1,
        contentHash: contentHash(text),
        ...metadata
      }
    )
  ];
}

function edit(text, contentChanges, version = 2, target = uri) {
  let changed = text;
  for (const change of contentChanges
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => b.rangeOffset - a.rangeOffset || b.index - a.index)) {
    changed =
      changed.slice(0, change.rangeOffset) +
      change.text +
      changed.slice(change.rangeOffset + change.rangeLength);
  }
  return { document: documentFor(changed, version, target), contentChanges };
}

function coordinates(results) {
  return results.map((result) => [result.offset, result.length]);
}

test('snapshot order uses roots, URI directories, files and offsets deterministically', () => {
  const input = [
    { id: 'z', rootName: 'alpha', uri: 'file:///root/z/file.bl', offset: 0 },
    { id: 'b', rootName: 'alpha', uri: 'file:///root/a/file.bl', offset: 9 },
    { id: 'c', rootName: 'alpha', uri: 'file:///root/a/file.bl', offset: 2 },
    { id: 'a', rootName: 'alpha', uri: 'file:///root/a/file.bl', offset: 2 },
    { id: 'upper', rootName: 'Beta', uri: 'file:///root/z.bl', offset: 0 },
    { id: 'root', rootName: 'alpha', uri: 'file:///root/z.bl', offset: 0 }
  ];
  const sorted = sortResults(input);
  assert.deepEqual(sorted.map((result) => result.id), ['upper', 'root', 'a', 'c', 'b', 'z']);
  assert.deepEqual(sorted.map((result) => result.initialOrder), [0, 1, 2, 3, 4, 5]);
  assert.equal(input[0].id, 'z');
  assert.equal(input[0].initialOrder, undefined);
  assert.notEqual(sorted[0], input[4]);
  assert.deepEqual(sortResults([...input].reverse()).map((result) => result.id), sorted.map((result) => result.id));
});

test('snapshot sorting falls back to positions and retains existing provenance', () => {
  const results = sortResults([
    { id: 'b', uri: 'untitled:buffer', line: 2, character: 1 },
    { id: 'a', uri: 'untitled:buffer', line: 2, character: 0, initialOrder: 42 },
    { id: 'c', uri: 'untitled:buffer', range: { start: { line: 1, character: 6 } } }
  ]);
  assert.deepEqual(results.map((result) => result.id), ['c', 'a', 'b']);
  assert.equal(results[1].initialOrder, 42);
});

test('inserting before an occurrence moves coordinates and snippets without reordering rows', () => {
  const text = 'cat\ncat';
  const original = sortResults(matches(text));
  const other = matches('cat', 'cat', { uri: otherUri })[0];
  const event = edit(text, [{ rangeOffset: 0, rangeLength: 0, text: 'heading\n' }]);
  const tracked = trackDocumentChanges([...original, other], event);
  assert.deepEqual(coordinates(tracked.slice(0, 2)), [[8, 3], [12, 3]]);
  assert.deepEqual(tracked.slice(0, 2).map((result) => result.line), [1, 2]);
  assert.deepEqual(tracked.slice(0, 2).map((result) => result.id), original.map((result) => result.id));
  assert.deepEqual(tracked.slice(0, 2).map((result) => result.initialOrder), [0, 1]);
  assert.ok(tracked.slice(0, 2).every((result) => result.pending && result.trackedDocumentVersion === 2));
  assert.equal(tracked[2], other);
  assert.equal(original[0].offset, 0);
  assert.equal(original[0].pending, undefined);
});

test('insertions at either edge stay outside adjacent occurrences', () => {
  const original = matches('catcat');
  const event = edit('catcat', [{ rangeOffset: 3, rangeLength: 0, text: '!' }]);
  const tracked = trackDocumentChanges(original, event);
  assert.deepEqual(coordinates(tracked), [[0, 3], [4, 3]]);
  const reconciled = reconcileDocumentResults(tracked, uri, matches('cat!cat'), event.document);
  assert.ok(reconciled.every((result) => !result.invalid && !result.pending));
});

test('an edit inside a result invalidates it and Undo restores the same identity', () => {
  const text = 'a cat z';
  const original = sortResults(matches(text));
  const event = edit(text, [{ rangeOffset: 3, rangeLength: 0, text: 'X' }]);
  let tracked = trackDocumentChanges(original, event);
  assert.deepEqual(coordinates(tracked), [[2, 4]]);
  assert.equal(tracked[0].lineText, 'a cXat z');
  tracked = reconcileDocumentResults(tracked, uri, [], event.document);
  assert.equal(tracked[0].invalid, true);
  assert.equal(tracked[0].pending, false);
  const undo = edit(event.document.getText(), [{ rangeOffset: 3, rangeLength: 1, text: '' }], 3);
  tracked = trackDocumentChanges(tracked, undo);
  tracked = reconcileDocumentResults(tracked, uri, matches(text), undo.document);
  assert.deepEqual(coordinates(tracked), [[2, 3]]);
  assert.equal(tracked[0].id, original[0].id);
  assert.equal(tracked[0].initialOrder, 0);
  assert.equal(tracked[0].invalid, false);
  assert.equal(tracked[0].documentVersion, 3);
});

test('deleted occurrences retain tombstones and survive deleting surrounding text, Undo and Redo', () => {
  const text = 'prefix cat suffix';
  const original = sortResults(matches(text));
  const removal = edit(text, [{ rangeOffset: 0, rangeLength: text.length, text: '' }]);
  let tracked = trackDocumentChanges(original, removal);
  tracked = reconcileDocumentResults(tracked, uri, [], removal.document);
  assert.equal(tracked.length, 1);
  assert.deepEqual(coordinates(tracked), [[0, 0]]);
  assert.equal(tracked[0].invalid, true);
  const undo = edit('', [{ rangeOffset: 0, rangeLength: 0, text }], 3);
  undo.reason = 1;
  tracked = trackDocumentChanges(tracked, undo);
  tracked = reconcileDocumentResults(tracked, uri, matches(text), undo.document);
  assert.deepEqual(coordinates(tracked), [[7, 3]]);
  assert.equal(tracked[0].invalid, false);
  const redo = edit(text, [{ rangeOffset: 0, rangeLength: text.length, text: '' }], 4);
  redo.reason = 2;
  tracked = trackDocumentChanges(tracked, redo);
  tracked = reconcileDocumentResults(tracked, uri, [], redo.document);
  assert.deepEqual(coordinates(tracked), [[0, 0]]);
  assert.equal(tracked[0].invalid, true);
  assert.equal(tracked[0].id, original[0].id);
});

test('inverse edits can restore a deletion even when initial contentHash is absent', () => {
  const text = 'xx cat yy';
  const original = matches(text, 'cat', { contentHash: undefined });
  const removal = edit(text, [{ rangeOffset: 1, rangeLength: 7, text: '!' }]);
  let tracked = trackDocumentChanges(original, removal);
  tracked = reconcileDocumentResults(tracked, uri, [], removal.document);
  const undo = edit(removal.document.getText(), [{ rangeOffset: 1, rangeLength: 1, text: text.slice(1, 8) }], 3);
  tracked = trackDocumentChanges(tracked, undo);
  assert.deepEqual(coordinates(tracked), [[3, 3]]);
  assert.equal(tracked[0].pending, true);
});

test('simultaneous edits use original coordinates regardless of event array order', () => {
  const text = 'cat one cat two cat';
  const original = matches(text);
  const changes = [
    { rangeOffset: 0, rangeLength: 0, text: 'start\n' },
    { rangeOffset: 5, rangeLength: 1, text: 'NN' },
    { rangeOffset: 16, rangeLength: 3, text: '' }
  ];
  const event = edit(text, changes);
  const forward = trackDocumentChanges(original, event);
  const reverse = trackDocumentChanges(original, { ...event, contentChanges: changes.slice().reverse() });
  assert.deepEqual(coordinates(forward), [[6, 3], [15, 3], [23, 0]]);
  assert.deepEqual(coordinates(reverse), coordinates(forward));
  const undo = edit(event.document.getText(), [
    { rangeOffset: 6, rangeLength: 0, text: '' },
    { rangeOffset: 0, rangeLength: 6, text: '' },
    { rangeOffset: 11, rangeLength: 2, text: 'n' },
    { rangeOffset: 23, rangeLength: 0, text: 'cat' }
  ], 3);
  const restored = trackDocumentChanges(forward, undo);
  assert.equal(undo.document.getText(), text);
  assert.deepEqual(coordinates(restored), coordinates(original));
});

test('multiline ranges, CRLF and Unicode keep UTF-16 editor positions', () => {
  const text = '😀\r\ncat\r\n猫 cat\r\nend';
  const query = 'cat\n猫 cat';
  const original = matches(text, query);
  assert.equal(original[0].offset, 4);
  const event = edit(text, [{ rangeOffset: 0, rangeLength: 0, text: '🦊\r\n' }]);
  let tracked = trackDocumentChanges(original, event);
  assert.equal(tracked[0].offset, 8);
  assert.deepEqual(tracked[0].range, {
    start: { line: 2, character: 0 },
    end: { line: 3, character: 5 }
  });
  assert.equal(tracked[0].preview, 'cat');
  tracked = reconcileDocumentResults(tracked, uri, matches(event.document.getText(), query), event.document);
  assert.equal(tracked[0].invalid, false);
  const inside = edit(event.document.getText(), [{ rangeOffset: 8, rangeLength: 0, text: '🙂' }], 3);
  const moved = trackDocumentChanges(tracked, inside);
  assert.equal(moved[0].offset, 10);
  assert.equal(moved[0].range.start.character, 2);
});

test('zero-width insertions at an anchor stay unverified despite a fresh match', () => {
  const text = 'a\nb';
  const query = '(?=b)';
  const original = matches(text, query, {}, { regex: true });
  const insertion = edit(text, [{ rangeOffset: 2, rangeLength: 0, text: '😀' }]);
  let tracked = trackDocumentChanges(original, insertion);
  assert.deepEqual(coordinates(tracked), [[4, 0]]);
  assert.equal(tracked[0].range.start.character, 2);
  tracked = reconcileDocumentResults(tracked, uri, matches(insertion.document.getText(), query, {}, { regex: true }), insertion.document);
  assert.equal(tracked[0].invalid, true);
  assert.equal(tracked[0].identityUnknown, true);
  const removal = edit(insertion.document.getText(), [{ rangeOffset: 0, rangeLength: 5, text: '' }], 3);
  tracked = trackDocumentChanges(tracked, removal);
  tracked = reconcileDocumentResults(tracked, uri, [], removal.document);
  assert.equal(tracked[0].invalid, true);
  const undo = edit('', [{ rangeOffset: 0, rangeLength: 0, text: insertion.document.getText() }], 4);
  tracked = trackDocumentChanges(tracked, undo);
  assert.deepEqual(coordinates(tracked), [[4, 0]]);
  assert.equal(tracked[0].id, original[0].id);
});

test('zero-width lookbehind and lookahead do not adopt a match created at the anchor', () => {
  for (const [query, inserted] of [['(?<=a)', 'a'], ['(?=b)', 'b']]) {
    const text = 'ab';
    const original = matches(text, query, {}, { regex: true });
    const event = edit(text, [{ rangeOffset: 1, rangeLength: 0, text: inserted }]);
    let tracked = trackDocumentChanges(original, event);
    tracked = reconcileDocumentResults(tracked, uri,
      matches(event.document.getText(), query, {}, { regex: true }), event.document);
    assert.equal(tracked[0].id, original[0].id);
    assert.equal(tracked[0].identityUnknown, true);
    assert.equal(tracked[0].invalid, true);

    const undo = edit(event.document.getText(), [{ rangeOffset: 1, rangeLength: 1, text: '' }], 3);
    undo.reason = 1;
    tracked = trackDocumentChanges(tracked, undo);
    tracked = reconcileDocumentResults(tracked, uri, original, undo.document);
    assert.equal(tracked[0].identityUnknown, false);
    assert.equal(tracked[0].invalid, false);
    const redo = edit(text, [{ rangeOffset: 1, rangeLength: 0, text: inserted }], 4);
    redo.reason = 2;
    tracked = trackDocumentChanges(tracked, redo);
    tracked = reconcileDocumentResults(tracked, uri,
      matches(redo.document.getText(), query, {}, { regex: true }), redo.document);
    assert.equal(tracked[0].identityUnknown, true);
    assert.equal(tracked[0].invalid, true);
  }
});

test('a deletion ending at a zero-width anchor makes identity unknown', () => {
  const original = matches('ab', '(?<=a)', {}, { regex: true });
  const event = edit('ab', [{ rangeOffset: 0, rangeLength: 1, text: 'a' }]);
  const tracked = trackDocumentChanges(original, event);
  assert.equal(tracked[0].identityUnknown, true);
});

test('a huge batch of edit deltas fails closed without quadratic host work', () => {
  const atLimit = matches('cat '.repeat(1000));
  const changes = Array.from({ length: 1000 }, (_, i) =>
    ({ rangeOffset: 4 * i + 3, rangeLength: 0, text: '!' }));
  const exact = trackDocumentChanges(atLimit, {
    contentChanges: changes, document: documentFor('cat! '.repeat(1000), 2)
  });
  assert.ok(exact.every(result => !result.identityUnknown && result.pending),
    'exactly one million row/change pairs still use normal tracking');
  const original = matches('cat '.repeat(1001));
  const event = { contentChanges: changes, document: {
    uri: { toString: () => uri }, version: 2,
    getText() { assert.fail('The bounded fallback must not read or map the whole document'); }
  } };
  const tracked = trackDocumentChanges(original, event);
  assert.equal(tracked.length, original.length);
  assert.deepEqual(tracked.map(result => result.id), original.map(result => result.id));
  assert.ok(tracked.every(result => result.identityUnknown && result.invalid));
});

test('UTF-16 hashes distinguish unpaired surrogate code units', () => {
  for (const [first, second] of [['\ud800 cat', '\ud801 cat'], ['\udc00 cat', '\udc01 cat']]) {
    assert.notEqual(contentHash(first), contentHash(second));
    assert.notEqual(contentHash(first), contentHash('\ufffd cat'));
    const original = matches(first);
    const updated = reconcileDocumentResults(original, uri, matches(second), documentFor(second));
    assert.equal(updated[0].identityUnknown, true);
    assert.equal(updated[0].invalid, true);
  }
});

test('validation updates captures and snapshots without changing tree provenance or adding new rows', () => {
  const query = '(?<word>c\\w{2})';
  const text = 'cat';
  const original = sortResults(matches(text, query, {}, { regex: true }));
  const event = edit(text, [{ rangeOffset: 1, rangeLength: 2, text: 'ow' }]);
  const tracked = trackDocumentChanges(original, event);
  const fresh = matches('cow', query, {
    uri,
    rootName: 'different validation scope',
    relativePath: 'example.bl',
    documentVersion: 2,
    source: 'snapshot'
  }, { regex: true });
  const reconciled = reconcileDocumentResults(tracked, uri, [...fresh, ...matches('cat', query, { uri: otherUri }, { regex: true })], event.document);
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].id, original[0].id);
  assert.equal(reconciled[0].initialOrder, original[0].initialOrder);
  assert.equal(reconciled[0].rootName, 'workspace');
  assert.equal(reconciled[0].relativePath, 'src/example.bl');
  assert.equal(reconciled[0].source, 'snapshot');
  assert.equal(reconciled[0].matchText, 'cow');
  assert.deepEqual(reconciled[0].captures, ['cow']);
  assert.deepEqual(reconciled[0].groups, { word: 'cow' });
  assert.equal(reconciled[0].contentHash, fresh[0].contentHash);
  assert.equal(reconciled[0].documentVersion, 2);
  assert.equal(original[0].matchText, 'cat');
});

test('one fresh occurrence cannot silently validate several collapsed original rows', () => {
  const text = 'catcat';
  const original = sortResults(matches(text));
  const event = edit(text, [{ rangeOffset: 0, rangeLength: 6, text: 'cat' }]);
  const tracked = trackDocumentChanges(original, event);
  assert.deepEqual(coordinates(tracked), [[0, 3], [0, 3]]);
  const reconciled = reconcileDocumentResults(tracked, uri, matches('cat'), event.document);
  assert.deepEqual(reconciled.map((result) => result.invalid), [true, true]);
  assert.deepEqual(reconciled.map((result) => result.identityUnknown), [true, true]);
  assert.deepEqual(reconciled.map((result) => result.id), original.map((result) => result.id));
});

test('unrelated edits still require worker validation for contextual expressions', () => {
  const text = 'cat tail';
  const original = matches(text, 'cat(?= tail)', {}, { regex: true });
  const event = edit(text, [{ rangeOffset: 4, rangeLength: 4, text: 'head' }]);
  const tracked = trackDocumentChanges(original, event);
  assert.deepEqual(coordinates(tracked), [[0, 3]]);
  assert.equal(tracked[0].pending, true);
  const reconciled = reconcileDocumentResults(tracked, uri, [], event.document);
  assert.equal(reconciled[0].invalid, true);
});

test('unavailable documents retain unknown identity even when the file returns', () => {
  const original = sortResults(matches('cat'));
  const other = matches('cat', 'cat', { uri: otherUri })[0];
  const missing = markDocumentUnavailable([...original, other], uri);
  assert.equal(missing.length, 2);
  assert.equal(missing[0].invalid, true);
  assert.equal(missing[0].pending, false);
  assert.equal(missing[0].unavailable, true);
  assert.match(missing[0].invalidReason, /unavailable/i);
  assert.equal(missing[0].id, original[0].id);
  assert.equal(missing[1], other);
  const restored = reconcileDocumentResults(missing, uri, matches('cat'), documentFor('cat', 3));
  assert.equal(restored[0].invalid, true);
  assert.equal(restored[0].identityUnknown, true);
  assert.equal(restored[0].unavailable, true);
});

test('combined edits do not restore an unproven identity from a matching document hash', () => {
  const text = 'prefix cat middle cat suffix';
  const original = sortResults(matches(text));
  const first = edit(text, [{ rangeOffset: 0, rangeLength: 14, text: 'new ' }]);
  let tracked = trackDocumentChanges(original, first);
  tracked = reconcileDocumentResults(tracked, uri, matches(first.document.getText()), first.document);
  const second = edit(first.document.getText(), [{ rangeOffset: 0, rangeLength: 5, text: 'x' }], 3);
  tracked = trackDocumentChanges(tracked, second);
  const third = edit(second.document.getText(), [{ rangeOffset: 0, rangeLength: 0, text: 'another\n' }], 4);
  tracked = trackDocumentChanges(tracked, third);
  const undo = edit(third.document.getText(), [{ rangeOffset: 0, rangeLength: third.document.getText().length, text }], 5);
  tracked = trackDocumentChanges(tracked, undo);
  tracked = reconcileDocumentResults(tracked, uri, matches(text), undo.document);
  assert.ok(tracked.every(result => result.offset >= 0 && result.offset + result.length <= text.length));
  assert.ok(tracked.some((result) => result.identityUnknown && result.invalid));
  assert.deepEqual(tracked.map((result) => result.id), original.map((result) => result.id));
});

test('external duplicate at an old offset never restores unknown identity', () => {
  const old = matches('catX');
  const changed = 'cat catX';
  const marked = markDocumentIdentityUnknown(old, uri);
  const reconciled = reconcileDocumentResults(marked, uri, matches(changed), documentFor(changed, 2));
  assert.equal(reconciled[0].id, old[0].id);
  assert.equal(reconciled[0].offset, 0);
  assert.equal(reconciled[0].invalid, true);
  assert.equal(reconciled[0].identityUnknown, true);
  const directlyReconciled = reconcileDocumentResults(old, uri, matches(changed), documentFor(changed, 2));
  assert.equal(directlyReconciled[0].identityUnknown, true, 'changed content without a delta is untrusted');
});

test('a new document version without a tracked delta is not proven by equal text', () => {
  const original = matches('cat');
  const reconciled = reconcileDocumentResults(original, uri, matches('cat'), documentFor('cat', 2));
  assert.equal(reconciled[0].identityUnknown, true);
  assert.equal(reconciled[0].invalid, true);
});

test('worker reconciliation fails closed without a document hash or version', () => {
  const original = matches('cat');
  const missingHash = [{ ...original[0], contentHash: undefined }];
  const noHash = reconcileDocumentResults(missingHash, uri, matches('cat'), documentFor('cat'));
  assert.equal(noHash[0].identityUnknown, true);
  assert.equal(noHash[0].invalid, true);
  const noVersion = reconcileDocumentResults(original, uri, matches('cat'),
    { ...documentFor('cat'), version: undefined });
  assert.equal(noVersion[0].identityUnknown, true);
  assert.equal(noVersion[0].invalid, true);
});

test('a missing or skipped document version makes the first edit untrackable', () => {
  const disk = matches('catX', 'cat', { documentVersion: undefined, source: 'disk' });
  const first = edit('catX', [{ rangeOffset: 4, rangeLength: 0, text: '!' }], 2);
  const unbound = trackDocumentChanges(disk, first);
  assert.equal(unbound[0].identityUnknown, true);
  assert.equal(unbound[0].identityUnknownCause, 'external');
  const versioned = matches('catX');
  const skipped = edit('catX', [{ rangeOffset: 4, rangeLength: 0, text: '!' }], 3);
  assert.equal(trackDocumentChanges(versioned, skipped)[0].identityUnknown, true);
});

test('multiple changes which jointly destroy an occurrence are ambiguous', () => {
  const original = matches('cat');
  const event = edit('cat', [
    { rangeOffset: 0, rangeLength: 1, text: 'b' },
    { rangeOffset: 1, rangeLength: 2, text: 'og' }
  ]);
  const tracked = trackDocumentChanges(original, event);
  assert.equal(tracked[0].identityUnknown, true);
  assert.equal(tracked[0].id, original[0].id);
});

test('deleting through a zero-width anchor invalidates its identity', () => {
  const original = matches('abc', '(?=b)', {}, { regex: true });
  const event = edit('abc', [{ rangeOffset: 0, rangeLength: 2, text: '' }]);
  const tracked = trackDocumentChanges(original, event);
  assert.equal(tracked[0].identityUnknown, true);
  assert.equal(tracked[0].invalid, true);
});

test('deleting one occurrence does not make its surviving neighbour unknown', () => {
  const old = sortResults(matches('catcat'));
  const event = edit('catcat', [{ rangeOffset: 0, rangeLength: 3, text: '' }]);
  const updated = reconcileDocumentResults(trackDocumentChanges(old, event), uri, matches('cat'), event.document);
  assert.equal(updated[0].identityUnknown, true);
  assert.equal(updated[0].invalid, true);
  assert.equal(updated[1].identityUnknown, undefined);
  assert.equal(updated[1].invalid, false);
  assert.deepEqual(updated.map(row => row.id), old.map(row => row.id));
});

test('manual recreation and untrusted Undo cannot revive a destroyed occurrence', () => {
  const old = matches('cat');
  const deletion = edit('cat', [{ rangeOffset: 0, rangeLength: 3, text: '' }]);
  let tracked = trackDocumentChanges(old, deletion);
  tracked = reconcileDocumentResults(tracked, uri, [], deletion.document);
  const recreation = edit('', [{ rangeOffset: 0, rangeLength: 0, text: 'cat' }], 3);
  tracked = trackDocumentChanges(tracked, recreation);
  tracked = reconcileDocumentResults(tracked, uri, matches('cat'), recreation.document);
  assert.equal(tracked[0].identityUnknown, true);
  assert.equal(tracked[0].invalid, true);
});

test('coordinate histories do not leak into webview JSON and initial state survives the cache bound', () => {
  const text = 'left cat right';
  let tracked = matches(text);
  let current = text;
  for (let index = 0; index < 140; index += 1) {
    const event = edit(current, [{ rangeOffset: 0, rangeLength: current.length, text: `edit ${index}` }], index + 2);
    tracked = trackDocumentChanges(tracked, event);
    current = event.document.getText();
  }
  const undo = edit(current, [{ rangeOffset: 0, rangeLength: current.length, text }], 142);
  tracked = trackDocumentChanges(tracked, undo);
  assert.deepEqual(coordinates(tracked), [[5, 3]]);
  assert.doesNotMatch(JSON.stringify(tracked), /snapshots|transition|coordinates|findResultTracking/);
});

test('empty changes and files outside a snapshot leave rows intact', () => {
  const original = matches('cat');
  const empty = trackDocumentChanges(original, { document: documentFor('cat'), contentChanges: [] });
  assert.notEqual(empty, original);
  assert.equal(empty[0], original[0]);
  const unrelated = trackDocumentChanges(original, edit('cat', [{ rangeOffset: 0, rangeLength: 0, text: 'x' }], 2, otherUri));
  assert.equal(unrelated[0], original[0]);
});
