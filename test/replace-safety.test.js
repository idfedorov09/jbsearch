'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertReplaceableMatch } = require('../src/replace-safety');
const { iterateMatches } = require('../src/search/matcher');

function documentFor(text, version = 1) {
  const lines = text.split('\r\n');
  const starts = [];
  let cursor = 0;
  for (const line of lines) { starts.push(cursor); cursor += line.length + 2; }
  return {
    uri: { toString: () => 'file:///safe' },
    version,
    getText: () => text,
    positionAt(offset) {
      let line = 0;
      while (line + 1 < starts.length && starts[line + 1] <= offset) line++;
      return { line, character: Math.min(offset - starts[line], lines[line].length) };
    },
    offsetAt(position) { return starts[position.line] + position.character; }
  };
}
function occurrences(text, query, regex = true) {
  return [...iterateMatches(text, { query, regex }, { uri: 'file:///safe', documentVersion: 1 })];
}

test('rejects CRLF interior boundaries while allowing whole line endings and zero-width endpoints', () => {
  const text = 'x\r\ny', document = documentFor(text);
  for (const query of ['(?=\\n)', '\\n', '\\r']) {
    const [match] = occurrences(text, query);
    assert.throws(() => assertReplaceableMatch(match, document), /cannot be represented/);
  }
  assert.doesNotThrow(() => assertReplaceableMatch(occurrences(text, '\\r\\n')[0], document));
  assert.doesNotThrow(() => assertReplaceableMatch(occurrences(text, '(?=y)')[0], document));
  assert.doesNotThrow(() => assertReplaceableMatch(occurrences(text, '$')[0], document));
});

test('rejects surrogate interiors, stale ranges, versions and unknown states', () => {
  const text = '\ud83d\ude00cat', document = documentFor(text);
  const [match] = occurrences(text, 'cat');
  assert.doesNotThrow(() => assertReplaceableMatch(match, document));
  const inside = { ...match, offset: 1, length: 0, matchText: '',
    range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } } };
  assert.throws(() => assertReplaceableMatch(inside, document), /cannot be represented/);
  assert.throws(() => assertReplaceableMatch({ ...match, identityUnknown: true }, document), /INVALID/);
  assert.throws(() => assertReplaceableMatch({ ...match, pending: true }, document), /checked/);
  assert.throws(() => assertReplaceableMatch({ ...match, invalid: true }, document), /INVALID/);
  assert.throws(() => assertReplaceableMatch(match, documentFor(text, 2)), /changed/);
  assert.throws(() => assertReplaceableMatch(match, { ...document, version: undefined }), /changed/);
  assert.throws(() => assertReplaceableMatch(match, { ...document,
    uri: { toString: () => 'file:///other' } }), /changed/);
  assert.throws(() => assertReplaceableMatch({ ...match, range: { ...match.range,
    start: { line: 0, character: 0 } } }, document), /cannot be represented/);
  assert.throws(() => assertReplaceableMatch(match, { ...document, isClosed: true }), /closed/);
});
