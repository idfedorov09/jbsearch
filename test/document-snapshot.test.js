'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readDocumentSnapshot, snapshotByteLimit, MAX_SNAPSHOT_BYTES } = require('../src/document-snapshot');
const { contentHash } = require('../src/content-hash');

function documentFor(text) {
  return { version: 1, isClosed: false, encoding: 'utf8', getText: () => text,
    positionAt: offset => ({ line: 0, character: Math.min(offset, text.length) }),
    offsetAt: position => position.character };
}

test('snapshot checks UTF-16 length before getText and then bounds encoded bytes', () => {
  const enormous = documentFor('small');
  enormous.positionAt = () => ({ line: 0, character: 1000000000 });
  enormous.getText = () => assert.fail('oversized text must not be materialized');
  assert.throws(() => readDocumentSnapshot(enormous, 1024), /size limit/);
  assert.throws(() => readDocumentSnapshot(documentFor('\u00e9\u00e9'), 3), /size limit/);
  const text = '\ud800\r\n\ud83d\ude00';
  assert.equal(readDocumentSnapshot(documentFor(text), 100).contentHash, contentHash(text));
  assert.equal(snapshotByteLimit(Infinity), MAX_SNAPSHOT_BYTES);
  assert.equal(snapshotByteLimit(10 ** 12), MAX_SNAPSHOT_BYTES);
});

test('unbounded, closed and changing document adapters fail closed', () => {
  assert.throws(() => readDocumentSnapshot({ getText() { assert.fail(); } }), /cannot bound/);
  const document = documentFor('cat');
  document.isClosed = true;
  assert.throws(() => readDocumentSnapshot(document), /closed/);
  document.isClosed = false;
  document.getText = () => { document.version++; return 'cat'; };
  assert.throws(() => readDocumentSnapshot(document), /changed/);
});
