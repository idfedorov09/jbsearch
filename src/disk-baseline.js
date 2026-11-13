'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { createHash } = require('node:crypto');
const { snapshotByteLimit } = require('./document-snapshot');

// Search results from disk carry the observed file identity separately from a
// later authoritative TextDocument snapshot. Never derive this baseline from a
// dirty buffer. An observed Save permits only a guarded state-equality rebase.
function diskBaselineFor(result) {
  if (result.diskBaseline) return result.diskBaseline;
  if (result.source !== 'disk') return undefined;
  return {
    origin: 'disk',
    mtimeMs: result.mtimeMs,
    fileSize: result.fileSize,
    ctimeMs: result.diskCtimeMs,
    dev: result.diskDevice,
    ino: result.diskInode,
    byteHash: result.diskByteHash,
    linkPolicy: result.diskLinkPolicy || 'no-follow'
  };
}

function commonDiskBaseline(results) {
  const baselines = results.map(diskBaselineFor).filter(Boolean);
  if (!baselines.length) return undefined;
  const fields = ['origin', 'mtimeMs', 'fileSize', 'ctimeMs', 'dev', 'ino', 'byteHash', 'linkPolicy'];
  if (baselines.length !== results.length ||
      baselines.some(baseline => fields.some(field => baseline[field] !== baselines[0][field])))
    throw new Error('A file has inconsistent search provenance. Rerun Search before replacing.');
  return baselines[0];
}

function sameFile(a, b) {
  return a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino &&
    a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

function metadataMatches(stat, baseline) {
  return stat.isFile() && stat.size === baseline.fileSize &&
    stat.mtimeMs === baseline.mtimeMs && stat.ctimeMs === baseline.ctimeMs &&
    stat.dev === baseline.dev && stat.ino === baseline.ino;
}

function validBaseline(baseline) {
  return baseline && typeof baseline.byteHash === 'string' &&
    Number.isSafeInteger(baseline.fileSize) && baseline.fileSize >= 0 &&
    ['mtimeMs', 'ctimeMs', 'dev', 'ino'].every(field => Number.isFinite(baseline[field])) &&
    (baseline.linkPolicy === undefined || ['no-follow', 'identity-validated'].includes(baseline.linkPolicy));
}

function diskChanged() {
  const error = new Error('A file changed on disk. Rerun Search before replacing.');
  error.code = 'DISK_BASELINE_CHANGED';
  return error;
}

const supportedEncodings = new Set(['utf8', 'utf8bom', 'utf16le', 'utf16be']);

function losslessDecoder(encoding) {
  if (!supportedEncodings.has(encoding))
    throw new Error(`Cannot verify saved text losslessly with encoding ${encoding || '(unknown)'}. Rerun Search.`);
  return new TextDecoder(encoding === 'utf8bom' ? 'utf-8' :
    encoding === 'utf8' ? 'utf-8' : encoding === 'utf16le' ? 'utf-16le' : 'utf-16be', { fatal: true });
}

function checkBom(bytes, encoding) {
  const utf8 = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const le = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const be = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
  if ((encoding === 'utf8' && (utf8 || le || be)) ||
      (encoding === 'utf8bom' && !utf8) ||
      (encoding === 'utf16le' && (be || utf8)) ||
      (encoding === 'utf16be' && (le || utf8)))
    throw new Error('The saved file encoding/BOM does not match the document. Rerun Search.');
}

/**
 * Stable, size-bounded regular-file read. O_NOFOLLOW protects the final path
 * component; parent-directory links and post-read writes are not a filesystem
 * transaction. The default strict policy fails closed without O_NOFOLLOW.
 * The explicitly selected identity-validated policy also checks the same
 * descriptor/path identity and hashes, but is NOT a no-follow guarantee on
 * platforms lacking this flag. It is used only for unchanged-baseline checks
 * and independent initial observations, not observed-Save rebases.
 * Fatal Unicode decoding hashes exactly the UTF-16 units exposed by VS Code;
 * no legacy decoder or replacement-character conversion is guessed.
 */
async function readStableDiskBaseline(uri, {
  signal, maxBytes, encoding, expectedBaseline, linkPolicy = 'no-follow'
} = {}) {
  const check = () => signal?.throwIfAborted();
  check();
  if (!uri?.fsPath) throw new Error('This source has no local file baseline.');
  if (!['no-follow', 'identity-validated'].includes(linkPolicy))
    throw new Error('Unknown disk baseline link policy.');
  const noFollow = Number.isInteger(constants.O_NOFOLLOW) && constants.O_NOFOLLOW !== 0;
  if (linkPolicy === 'no-follow' && !noFollow)
    throw new Error('This platform cannot safely open a disk baseline without following links. Rerun Search before replacing.');
  if (expectedBaseline && !validBaseline(expectedBaseline)) throw diskChanged();
  if (expectedBaseline && (expectedBaseline.linkPolicy || 'no-follow') === 'no-follow' && linkPolicy !== 'no-follow')
    throw new Error('A strict no-follow disk baseline cannot be downgraded to identity validation.');
  const decoder = encoding === undefined ? undefined : losslessDecoder(encoding);
  const limit = snapshotByteLimit(maxBytes);
  const initial = await fs.lstat(uri.fsPath);
  check();
  if (!initial.isFile() || (expectedBaseline && !metadataMatches(initial, expectedBaseline)))
    throw diskChanged();
  if (initial.size > limit) throw new Error('The file exceeds the searchable size limit.');
  const file = await fs.open(uri.fsPath, constants.O_RDONLY | (noFollow ? constants.O_NOFOLLOW : 0));
  try {
    check();
    const opened = await file.stat();
    check();
    if (!sameFile(initial, opened)) throw diskChanged();
    const bytes = createHash('sha256');
    const text = decoder && createHash('sha256');
    const buffer = Buffer.allocUnsafe(Math.min(65536, Math.max(4, opened.size)));
    let position = 0;
    // Complete the BOM prefix even on a short read, before streaming decoding.
    if (decoder) {
      const prefixLength = Math.min(4, opened.size);
      while (position < prefixLength) {
        const { bytesRead } = await file.read(buffer, position, prefixLength - position, position);
        check();
        if (!bytesRead) throw diskChanged();
        position += bytesRead;
      }
      const prefix = buffer.subarray(0, position);
      checkBom(prefix, encoding);
      bytes.update(prefix);
      text.update(decoder.decode(prefix, { stream: true }), 'utf16le');
    }
    while (position < opened.size) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, opened.size - position), position);
      check();
      if (!bytesRead) throw diskChanged();
      const chunk = buffer.subarray(0, bytesRead);
      bytes.update(chunk);
      if (decoder) text.update(decoder.decode(chunk, { stream: true }), 'utf16le');
      position += bytesRead;
    }
    if (decoder) text.update(decoder.decode(), 'utf16le');
    const extra = await file.read(buffer, 0, 1, position);
    check();
    const finalStat = await file.stat();
    check();
    const finalPath = await fs.lstat(uri.fsPath);
    check();
    const byteHash = bytes.digest('hex');
    if (extra.bytesRead || !sameFile(opened, finalStat) || !sameFile(opened, finalPath) ||
        (expectedBaseline && byteHash !== expectedBaseline.byteHash)) throw diskChanged();
    return Object.freeze({ origin: 'disk', mtimeMs: opened.mtimeMs, fileSize: opened.size,
      ctimeMs: opened.ctimeMs, dev: opened.dev, ino: opened.ino, byteHash,
      linkPolicy: noFollow ? 'no-follow' : 'identity-validated',
      ...(decoder ? { encoding, contentHash: text.digest('hex') } : {}) });
  } finally {
    await file.close();
  }
}

async function assertDiskBaseline(uri, baseline, { signal } = {}) {
  if (!validBaseline(baseline)) throw diskChanged();
  await readStableDiskBaseline(uri, { signal, maxBytes: baseline.fileSize || 1,
    expectedBaseline: baseline, linkPolicy: baseline.linkPolicy || 'no-follow' });
}

module.exports = { diskBaselineFor, commonDiskBaseline, assertDiskBaseline,
  readStableDiskBaseline, losslessDecoder, supportedEncodings };
