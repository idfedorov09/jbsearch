'use strict';

const { readDocumentSnapshot } = require('./document-snapshot');

/**
 * Reject an occurrence when its identity or editor range cannot be trusted.
 * The caller still owns the whole-document hash, query/generation, and race
 * checks; a text match at these coordinates does not itself prove identity.
 */
function assertReplaceableMatch(match, document, text = readDocumentSnapshot(document).text) {
  if (match.pending || match.invalid || match.unavailable || match.identityUnknown)
    throw new Error('This result is INVALID or still being checked. Rerun Search before replacing.');
  if (document.isClosed)
    throw new Error('The search document was closed. Rerun Search before replacing.');
  if (!match.uri || !document.uri || String(match.uri) !== document.uri.toString())
    throw new Error('The search document changed. Rerun Search before replacing.');
  if (!Number.isSafeInteger(document.version) ||
      (match.documentVersion !== undefined && document.version !== match.documentVersion))
    throw new Error('A file changed since validation. Rerun Search before replacing.');
  const start = match.offset;
  const end = start + match.length;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(match.length) ||
      start < 0 || match.length < 0 || end > text.length ||
      text.slice(start, end) !== match.matchText)
    throw new Error('The search result is stale. Rerun Search before replacing.');
  if (typeof document.positionAt !== 'function' || typeof document.offsetAt !== 'function')
    throw new Error('The editor cannot verify this result range. Rerun Search before replacing.');
  const insidePair = offset => {
    if (offset <= 0 || offset >= text.length) return false;
    const left = text.charCodeAt(offset - 1), right = text.charCodeAt(offset);
    return (left === 13 && right === 10) ||
      (left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff);
  };
  const same = (a, b) => a && b && a.line === b.line && a.character === b.character;
  const from = document.positionAt(start), to = document.positionAt(end);
  if (insidePair(start) || insidePair(end) ||
      document.offsetAt(from) !== start || document.offsetAt(to) !== end ||
      !same(from, match.range?.start) || !same(to, match.range?.end))
    throw new Error('This match range cannot be represented exactly in the editor. Rerun Search or change the query.');
}

module.exports = { assertReplaceableMatch };
