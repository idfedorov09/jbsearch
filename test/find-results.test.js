'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { iterateMatches } = require('../src/search');
const {
  sortResults,
  trackDocumentChanges,
  reconcileDocumentResults,
  markDocumentUnavailable
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
        contentHash: createHash('sha256').update(text).digest('hex'),
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
  tracked = trackDocumentChanges(tracked, undo);
  tracked = reconcileDocumentResults(tracked, uri, matches(text), undo.document);
  assert.deepEqual(coordinates(tracked), [[7, 3]]);
  assert.equal(tracked[0].invalid, false);
  const redo = edit(text, [{ rangeOffset: 0, rangeLength: text.length, text: '' }], 4);
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

test('zero-width occurrences keep their anchors and are restored after deleting their line', () => {
  const text = 'a\nb';
  const query = '(?=b)';
  const original = matches(text, query, {}, { regex: true });
  const insertion = edit(text, [{ rangeOffset: 2, rangeLength: 0, text: '😀' }]);
  let tracked = trackDocumentChanges(original, insertion);
  assert.deepEqual(coordinates(tracked), [[4, 0]]);
  assert.equal(tracked[0].range.start.character, 2);
  tracked = reconcileDocumentResults(tracked, uri, matches(insertion.document.getText(), query, {}, { regex: true }), insertion.document);
  assert.equal(tracked[0].invalid, false);
  const removal = edit(insertion.document.getText(), [{ rangeOffset: 0, rangeLength: 5, text: '' }], 3);
  tracked = trackDocumentChanges(tracked, removal);
  tracked = reconcileDocumentResults(tracked, uri, [], removal.document);
  assert.equal(tracked[0].invalid, true);
  const undo = edit('', [{ rangeOffset: 0, rangeLength: 0, text: insertion.document.getText() }], 4);
  tracked = trackDocumentChanges(tracked, undo);
  assert.deepEqual(coordinates(tracked), [[4, 0]]);
  assert.equal(tracked[0].id, original[0].id);
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
  assert.deepEqual(reconciled.map((result) => result.invalid), [false, true]);
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

test('unavailable documents keep invalid rows and can recover once the file returns', () => {
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
  assert.equal(restored[0].invalid, false);
  assert.equal(restored[0].unavailable, false);
  assert.equal(restored[0].invalidReason, undefined);
});

test('combined Undo restores an earlier complete document state after several edits', () => {
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
  assert.deepEqual(coordinates(tracked), coordinates(original));
  assert.ok(tracked.every((result) => !result.invalid));
  assert.deepEqual(tracked.map((result) => result.id), original.map((result) => result.id));
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
