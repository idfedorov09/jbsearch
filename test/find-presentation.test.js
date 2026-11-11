'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { captureActionBinding, sameActionBinding, rowActionKey, captureRowResult,
  requestPresentationKey } = require('../src/find-presentation');

const descriptor = () => ({ sessionId: 'search', generation: 2,
  requestFingerprint: 'immutable-request', resultRevision: 3,
  scopeEventRevision: 4, snapshotToken: 'opaque-token' });

test('presentation captures exact immutable descriptors and never invents an approval token', () => {
  const source = descriptor(), copy = captureActionBinding(source);
  assert.deepEqual(copy, source);
  assert.notEqual(copy, source);
  assert.equal(Object.isFrozen(copy), true);
  assert.equal(sameActionBinding(copy, captureActionBinding(source)), true);
  source.snapshotToken = 'different';
  assert.equal(copy.snapshotToken, 'opaque-token');
  assert.equal(sameActionBinding(copy, source), false);
  for (const input of [null, {}, { ...descriptor(), snapshotToken: '' },
    { ...descriptor(), generation: -1 }, { ...descriptor(), resultRevision: NaN },
    { ...descriptor(), scopeEventRevision: Number.MAX_SAFE_INTEGER + 1 }])
    assert.equal(captureActionBinding(input), null);
});

test('row and request keys capture action semantics rather than mutable object references or status', () => {
  const row = { id: 'one', uri: 'file:///a.js', resultRevision: 0,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } };
  const before = rowActionKey(row), captured = captureRowResult(row);
  assert.equal(rowActionKey({ ...row, pending: true, invalidReason: 'Checking' }), before);
  row.range.end.character = 2;
  assert.notEqual(rowActionKey(row), before);
  assert.equal(captured.range.end.character, 1);
  assert.equal(Object.isFrozen(captured.range.end), true);
  const state = { id: 'search', generation: 2, query: 'a', replacement: 'b',
    mode: 'replace', options: {}, scope: { kind: 'workspace' } };
  const request = requestPresentationKey(state);
  assert.equal(requestPresentationKey({ ...state, notice: 'Status', scopeStale: true }), request);
  state.options.regex = true;
  assert.notEqual(requestPresentationKey(state), request);
});
