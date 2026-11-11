'use strict';

const { contentHash } = require('./content-hash');

const MAX_SNAPSHOT_BYTES = 128 * 1024 * 1024;

function snapshotByteLimit(value = MAX_SNAPSHOT_BYTES) {
  return Math.min(MAX_SNAPSHOT_BYTES, Math.max(1, Math.floor(Number(value) || MAX_SNAPSHOT_BYTES)));
}

/** Inspect length without first materializing an arbitrarily large buffer. */
function readDocumentSnapshot(document, maxBytes = MAX_SNAPSHOT_BYTES) {
  maxBytes = snapshotByteLimit(maxBytes);
  if (document.isClosed) throw new Error('The document was closed during validation.');
  if (typeof document.positionAt !== 'function' || typeof document.offsetAt !== 'function')
    throw new Error('The editor cannot bound this document snapshot. Rerun Search.');
  // positionAt clamps to EOF, including an empty last line. Unlike lineAt it
  // does not require allocating the entire text of one enormous last line.
  const length = document.offsetAt(document.positionAt(Number.MAX_SAFE_INTEGER));
  if (!Number.isSafeInteger(length) || length < 0)
    throw new Error('The editor cannot bound this document snapshot. Rerun Search.');
  if (length > maxBytes) throw new Error('The document exceeds the searchable size limit.');
  const version = document.version;
  const text = document.getText();
  if (text.length !== length || document.version !== version || document.isClosed)
    throw new Error('The document changed while its snapshot was being read.');
  if (Buffer.byteLength(text, 'utf8') > maxBytes)
    throw new Error('The document exceeds the searchable size limit.');
  return { text, version, contentHash: contentHash(text), encoding: document.encoding };
}

module.exports = { MAX_SNAPSHOT_BYTES, snapshotByteLimit, readDocumentSnapshot };
