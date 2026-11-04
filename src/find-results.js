'use strict';

const { createHash } = require('node:crypto');

// Enumerable symbols survive object spreads in the controller while remaining
// absent from JSON sent to a webview. History contains coordinates, never a copy
// of a document. Sharing it between a file's rows keeps undo tracking bounded.
const tracking = Symbol('jbsearch.findResultTracking');
const historyLimit = 128;

function compareText(left, right) {
  left = String(left ?? '');
  right = String(right ?? '');
  return left < right ? -1 : left > right ? 1 : 0;
}

function uriString(value) {
  return typeof value === 'string' ? value : value?.toString() || '';
}

function pathKey(result) {
  const uri = uriString(result.uri).replaceAll('\\', '/');
  const slash = uri.lastIndexOf('/');
  return [slash === -1 ? '' : uri.slice(0, slash), uri || result.relativePath || ''];
}

function numeric(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Freeze the initial deterministic tree order. Code-unit comparisons deliberately
 * do not depend on the OS locale, case folding, or ripgrep's enumeration order.
 * Call this for a newly completed search, not after each document edit.
 */
function sortResults(results) {
  return results
    .map((result, index) => ({ result, index, path: pathKey(result) }))
    .sort((left, right) => {
      const a = left.result;
      const b = right.result;
      return (
        compareText(a.rootName, b.rootName) ||
        compareText(left.path[0], right.path[0]) ||
        compareText(left.path[1], right.path[1]) ||
        numeric(a.offset, Number.MAX_SAFE_INTEGER) -
          numeric(b.offset, Number.MAX_SAFE_INTEGER) ||
        numeric(a.range?.start?.line, numeric(a.line)) -
          numeric(b.range?.start?.line, numeric(b.line)) ||
        numeric(a.range?.start?.character, numeric(a.character)) -
          numeric(b.range?.start?.character, numeric(b.character)) ||
        compareText(a.id, b.id) ||
        left.index - right.index
      );
    })
    .map(({ result }, index) => ({ ...result, initialOrder: result.initialOrder ?? index }));
}

function changesFor(event) {
  // VS Code reports all ranges in the document before this event. Applying them
  // from right to left prevents one edit from shifting another edit's offset.
  return (event.contentChanges || [])
    .map((change, index) => ({
      offset: Math.max(0, numeric(change.rangeOffset)),
      removed: Math.max(0, numeric(change.rangeLength)),
      inserted: String(change.text ?? '').length,
      index
    }))
    .filter((change) => change.removed || change.inserted)
    .sort((a, b) => b.offset - a.offset || b.index - a.index);
}

function moveRange(offset, length, change) {
  const start = change.offset;
  const end = start + change.removed;
  const after = offset + length;
  const delta = change.inserted - change.removed;
  if (change.removed === 0) {
    // Insertions at a nonempty occurrence's edges stay outside it. A zero-width
    // marker uses the right affinity, like a cursor immediately after typing.
    if (start <= offset) return [offset + delta, length];
    if (start >= after) return [offset, length];
    return [offset, length + delta];
  }
  if (end <= offset) return [offset + delta, length];
  if (start >= after && length) return [offset, length];
  if (!length && start > offset) return [offset, length];
  const movedStart = offset < start ? offset : start;
  const movedEnd = after > end ? after + delta : start + change.inserted;
  return [movedStart, Math.max(0, movedEnd - movedStart)];
}

function snapshot(results, state) {
  const coordinates = new Float64Array(state.ids.length * 2);
  coordinates.fill(Number.NaN);
  for (const result of results) {
    const index = state.index.get(result.id);
    if (index === undefined) continue;
    coordinates[index * 2] = numeric(result.offset);
    coordinates[index * 2 + 1] = Math.max(0, numeric(result.length));
  }
  return coordinates;
}

function stateFor(results) {
  const previous = results[0]?.[tracking];
  if (
    previous &&
    previous.ids.length === results.length &&
    results.every((result) => previous.index.has(result.id))
  )
    return previous;
  const ids = results.map((result) => result.id);
  const state = {
    ids,
    index: new Map(ids.map((id, index) => [id, index])),
    snapshots: new Map()
  };
  const hash = results[0]?.contentHash;
  if (hash && results.every((result) => result.contentHash === hash))
    state.snapshots.set(hash, snapshot(results, state));
  return state;
}

function inverseOf(changes) {
  let delta = 0;
  return changes
    .slice()
    .reverse()
    .map((change) => {
      const inverse = {
        offset: change.offset + delta,
        removed: change.inserted,
        inserted: change.removed
      };
      delta += change.inserted - change.removed;
      return inverse;
    });
}

function isInverse(changes, expected) {
  if (!expected || changes.length !== expected.length) return false;
  return changes
    .slice()
    .reverse()
    .every((change, index) => {
      const inverse = expected[index];
      return (
        change.offset === inverse.offset &&
        change.removed === inverse.removed &&
        change.inserted === inverse.inserted
      );
    });
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function plainPosition(document, offset) {
  const position = document.positionAt(offset);
  return { line: position.line, character: position.character };
}

function withCoordinates(result, document, text, offset, length) {
  offset = Math.min(text.length, Math.max(0, numeric(offset)));
  length = Math.min(text.length - offset, Math.max(0, numeric(length)));
  const start = plainPosition(document, offset);
  const end = plainPosition(document, offset + length);
  const lineStart = offset - start.character;
  let lineEnd = text.indexOf('\n', lineStart);
  if (lineEnd === -1) lineEnd = text.length;
  if (text.charCodeAt(lineEnd - 1) === 13) lineEnd -= 1;
  const lineText = text.slice(lineStart, lineEnd);
  const previewStart = Math.max(0, start.character - 160);
  const preview = lineText.slice(
    previewStart,
    Math.max(previewStart + 500, Math.min(start.character + length + 160, previewStart + 2000))
  );
  return {
    ...result,
    offset,
    length,
    range: { start, end },
    line: start.line,
    character: start.character,
    endLine: end.line,
    endCharacter: end.character,
    preview,
    lineText: preview,
    previewStart,
    previewMatchStart: start.character - previewStart,
    previewMatchEnd: Math.min(preview.length, start.character - previewStart + length)
  };
}

/**
 * Track a TextDocumentChangeEvent without evaluating the search expression. Rows
 * stay in their original array order and retain their IDs. Every row in the file
 * becomes pending: even an edit outside a range can affect a regex lookaround.
 * The caller must validate pending rows through the search worker before replace.
 *
 * Recent document hashes restore exact old coordinates on Undo/Redo, including a
 * fully deleted occurrence and edits covering its surrounding text. Only compact
 * coordinate snapshots are retained (128 recent states plus the initial state).
 * An inverse-edit tombstone also supports the first Undo when a synthetic result
 * has no contentHash. Older uncached states still use normal range tracking.
 */
function trackDocumentChanges(results, event) {
  const uri = uriString(event.document?.uri);
  const changes = changesFor(event);
  if (!uri || !changes.length) return results.slice();
  const affected = results.filter((result) => uriString(result.uri) === uri);
  if (!affected.length) return results.slice();
  const text = event.document.getText();
  const hash = hashText(text);
  const previous = stateFor(affected);
  const before = snapshot(affected, previous);
  const restored =
    previous.snapshots.get(hash) ||
    (isInverse(changes, previous.transition?.inverse) ? previous.transition.before : undefined);
  const updated = new Map();
  for (const result of affected) {
    const index = previous.index.get(result.id) * 2;
    let offset = result.offset;
    let length = result.length;
    if (restored && Number.isFinite(restored[index])) {
      offset = restored[index];
      length = restored[index + 1];
    } else {
      for (const change of changes) [offset, length] = moveRange(offset, length, change);
    }
    updated.set(result.id, {
      ...withCoordinates(result, event.document, text, offset, length),
      pending: true,
      trackedDocumentVersion: event.document.version,
      trackedContentHash: hash
    });
  }
  const state = {
    ...previous,
    snapshots: new Map(previous.snapshots),
    transition: { inverse: inverseOf(changes), before }
  };
  // Refresh an existing cache entry's recency, except for the pinned initial
  // state. Repeated Undo/Redo must not evict a recently visited document state.
  const initialHash = state.snapshots.keys().next().value;
  if (hash !== initialHash) state.snapshots.delete(hash);
  state.snapshots.set(hash, snapshot([...updated.values()], state));
  while (state.snapshots.size > historyLimit + 1) {
    // Keep the original document forever so restoring an entire long editing
    // session can still restore every original occurrence exactly.
    const keys = state.snapshots.keys();
    keys.next();
    state.snapshots.delete(keys.next().value);
  }
  for (const result of updated.values()) result[tracking] = state;
  return results.map((result) => updated.get(result.id) || result);
}

/**
 * Revalidate only existing rows against fresh worker matches for this document.
 * The controller must discard worker responses for an older document version.
 * No new occurrences enter this frozen snapshot; Refresh creates a new snapshot.
 */
function reconcileDocumentResults(results, uri, freshMatches, document) {
  uri = uriString(uri);
  const text = document.getText();
  const hash = hashText(text);
  const matchesByRange = new Map();
  for (const match of freshMatches) {
    if (match.uri && uriString(match.uri) !== uri) continue;
    const key = `${match.offset}:${match.length}`;
    if (!matchesByRange.has(key)) matchesByRange.set(key, []);
    matchesByRange.get(key).push(match);
  }
  return results.map((result) => {
    if (uriString(result.uri) !== uri) return result;
    const key = `${result.offset}:${result.length}`;
    const match = matchesByRange.get(key)?.shift();
    const merged = match ? { ...result, ...match } : result;
    const next = withCoordinates(merged, document, text, result.offset, result.length);
    // Worker metadata may use a narrower scope for revalidation; the original
    // tree's root/path, identity and ordering must remain unchanged.
    for (const field of ['id', 'uri', 'fsPath', 'relativePath', 'rootName', 'label', 'initialOrder'])
      if (Object.hasOwn(result, field)) next[field] = result[field];
    next.pending = false;
    next.invalid = !match;
    next.invalidReason = match ? undefined : 'The text no longer matches this search.';
    next.unavailable = false;
    next.contentHash = hash;
    next.documentVersion = document.version ?? match?.documentVersion ?? result.documentVersion;
    next.trackedDocumentVersion = document.version;
    next.trackedContentHash = hash;
    return next;
  });
}

function markDocumentUnavailable(results, uri) {
  uri = uriString(uri);
  return results.map((result) =>
    uriString(result.uri) === uri
      ? {
          ...result,
          pending: false,
          invalid: true,
          unavailable: true,
          invalidReason: 'File is unavailable.'
        }
      : result
  );
}

module.exports = {
  sortResults,
  trackDocumentChanges,
  reconcileDocumentResults,
  markDocumentUnavailable
};
