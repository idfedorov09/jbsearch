'use strict';

const { diskBaselineFor } = require('./disk-baseline');
const { readDocumentSnapshot } = require('./document-snapshot');

// Enumerable symbols survive object spreads in the controller while remaining
// absent from JSON sent to a webview. History contains coordinates, never a copy
// of a document. Sharing it between a file's rows keeps undo tracking bounded.
const tracking = Symbol('jbsearch.findResultTracking');
const historyLimit = 128;
// Bound synchronous work in the extension host for very large multi-edits.
const maxTrackedChangePairs = 1000000;

function compareText(left, right) {
  left = String(left ?? '');
  right = String(right ?? '');
  return left < right ? -1 : left > right ? 1 : 0;
}

function uriString(value) {
  return typeof value === 'string' ? value : value?.toString() || '';
}

function nextRevision(result) {
  return (Number.isSafeInteger(result.resultRevision) ? result.resultRevision : 0) + 1;
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

function identitySnapshot(results, state) {
  const unknown = new Uint8Array(state.ids.length);
  for (const result of results) {
    const index = state.index.get(result.id);
    if (index !== undefined && result.identityUnknown) unknown[index] = 1;
  }
  return unknown;
}

// Precompute the union once per event; large multi-cursor edits must not sort
// all changes separately for every occurrence.
function removedIntervals(changes) {
  const sorted = changes.filter(change => change.removed > 0)
    .map(change => [change.offset, change.offset + change.removed])
    .sort((a, b) => a[0] - b[0]);
  const intervals = [];
  for (const [left, right] of sorted) {
    const last = intervals.at(-1);
    if (last && left <= last[1]) last[1] = Math.max(last[1], right);
    else intervals.push([left, right]);
  }
  return intervals;
}

function destroysRange(result, removals) {
  const start = numeric(result.offset);
  const end = start + Math.max(0, numeric(result.length));
  let low = 0, high = removals.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (removals[middle][0] <= start) low = middle + 1;
    else high = middle;
  }
  const interval = removals[low - 1];
  return Boolean(interval && interval[1] >= end);
}

function markUnknown(result, reason, cause = 'ambiguous') {
  return {
    ...result,
    resultRevision: nextRevision(result),
    identityUnknown: true,
    identityUnknownCause: result.identityUnknownCause === 'external' ? 'external' : cause,
    invalid: true,
    invalidReason: reason
  };
}

function markDocumentIdentityUnknown(results, uri, reason = 'The original occurrence cannot be tracked. Rerun Search.') {
  uri = uriString(uri);
  return results.map(result => uriString(result.uri) === uri
    ? { ...markUnknown(result, reason, 'external'), pending: false }
    : result);
}

// Mark every known occurrence participating in an overlapping mapped range.
// Unknown tombstones do not poison another occurrence which still has a known
// continuous anchor. Sorting a copy keeps the snapshot's UI order unchanged.
function markCollisions(updated) {
  const candidates = [...updated.values()].filter(result => !result.identityUnknown)
    .sort((a, b) => a.offset - b.offset || b.length - a.length);
  let active;
  for (const result of candidates) {
    const end = result.offset + result.length;
    if (active && (result.offset < active.end ||
        (result.offset === active.end && (!result.length || !active.result.length)))) {
      updated.set(result.id, markUnknown(result,
        'Several occurrences mapped to the same area. Rerun Search.'));
      updated.set(active.result.id, markUnknown(updated.get(active.result.id),
        'Several occurrences mapped to the same area. Rerun Search.'));
    }
    if (!active || end > active.end) active = { result, end };
  }
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
 * Only an immediate, version-contiguous Undo/Redo with inverse geometry and the
 * prior full-document hash can restore a known anchor after its destruction.
 * Cached hashes can suggest coordinates for an unknown anchor, but cannot prove
 * its identity. The bounded history stores coordinates, not document contents.
 */
function trackDocumentChanges(results, event, { maxBytes } = {}) {
  const uri = uriString(event.document?.uri);
  const changes = changesFor(event);
  if (!uri || !changes.length) return results.slice();
  const affected = results.filter((result) => uriString(result.uri) === uri);
  if (!affected.length) return results.slice();
  if (changes.length * affected.length > maxTrackedChangePairs)
    return markDocumentIdentityUnknown(results, uri,
      'This edit is too large to track safely. Rerun Search.');
  let text, hash;
  try { ({ text, contentHash: hash } = readDocumentSnapshot(event.document, maxBytes)); } catch (error) {
    return markDocumentIdentityUnknown(results, uri, error.message);
  }
  const removals = removedIntervals(changes);
  const insertionOffsets = new Set(changes.filter(change => change.inserted > 0).map(change => change.offset));
  const previous = stateFor(affected);
  const before = snapshot(affected, previous);
  const beforeUnknown = identitySnapshot(affected, previous);
  const beforeHash = affected[0]?.trackedContentHash || affected[0]?.contentHash;
  // An exact immediate Undo/Redo with matching text and inverse geometry can
  // restore known anchors. Hash equality alone is not an identity guarantee.
  const undoRestored = (event.reason === 1 || event.reason === 2) &&
    hash === previous.transition?.beforeHash &&
    isInverse(changes, previous.transition?.inverse)
    ? previous.transition : undefined;
  const approximateRestored =
    previous.snapshots.get(hash) ||
    (isInverse(changes, previous.transition?.inverse) ? previous.transition.before : undefined);
  const updated = new Map();
  for (const result of affected) {
    const index = previous.index.get(result.id) * 2;
    let offset = result.offset;
    let length = result.length;
    // A hash-only cache hit can improve an unknown row's displayed position,
    // but must never move a known anchor or restore its identity by itself.
    const restored = undoRestored?.before || (result.identityUnknown ? approximateRestored : undefined);
    if (restored && Number.isFinite(restored[index])) {
      offset = restored[index];
      length = restored[index + 1];
    } else {
      for (const change of changes) [offset, length] = moveRange(offset, length, change);
    }
    let next = {
      ...withCoordinates(result, event.document, text, offset, length),
      resultRevision: nextRevision(result),
      pending: true,
      trackedDocumentVersion: event.document.version,
      trackedContentHash: hash
    };
    const expectedVersion = result.trackedDocumentVersion ?? result.documentVersion;
    // A delta can only move an old anchor when it follows the document version
    // that anchor was tied to. Disk results are bound through validation before
    // the first edit; a missing or skipped version is not evidence of continuity.
    if (!Number.isSafeInteger(expectedVersion) || !Number.isSafeInteger(event.document.version) ||
        event.document.version !== expectedVersion + 1) {
      next = markUnknown(next, 'The document edit history is incomplete. Rerun Search.', 'external');
    } else if (undoRestored && result.identityUnknownCause !== 'external') {
      const oldIndex = previous.index.get(result.id);
      if (!undoRestored.beforeUnknown[oldIndex]) {
        next.identityUnknown = false;
        next.identityUnknownCause = undefined;
        next.invalidReason = undefined;
      } else next = markUnknown(next, 'The original occurrence was removed. Rerun Search.', 'destroyed');
    } else if (!result.identityUnknown && !result.length && insertionOffsets.has(result.offset)) {
      next = markUnknown(next, 'An insertion at this zero-width occurrence is ambiguous. Rerun Search.');
    } else if (!result.identityUnknown && destroysRange(result, removals)) {
      next = markUnknown(next, 'The original occurrence was removed. Rerun Search.', 'destroyed');
    }
    updated.set(result.id, next);
  }
  markCollisions(updated);
  const state = {
    ...previous,
    snapshots: new Map(previous.snapshots),
    transition: { inverse: inverseOf(changes), before, beforeUnknown, beforeHash }
  };
  // Refresh an existing cache entry's recency, except for the pinned initial
  // state. Repeated Undo/Redo must not evict a recently visited document state.
  const initialHash = state.snapshots.keys().next().value;
  if (hash !== initialHash) state.snapshots.delete(hash);
  state.snapshots.set(hash, snapshot([...updated.values()], state));
  while (state.snapshots.size > historyLimit + 1) {
    // Retain the initial coordinate hint alongside the recent bounded history;
    // it cannot by itself restore an unknown occurrence's identity.
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
function reconcileDocumentResults(results, uri, freshMatches, document, { snapshot } = {}) {
  uri = uriString(uri);
  const { text, contentHash: hash } = snapshot || readDocumentSnapshot(document);
  const matchesByRange = new Map();
  const baselines = new Map();
  for (const match of freshMatches) {
    if (match.uri && uriString(match.uri) !== uri) continue;
    const key = `${match.offset}:${match.length}`;
    if (!matchesByRange.has(key)) matchesByRange.set(key, []);
    matchesByRange.get(key).push(match);
  }
  return results.map((result) => {
    if (uriString(result.uri) !== uri) return result;
    const expectedHash = result.trackedContentHash || result.contentHash;
    const expectedVersion = result.trackedDocumentVersion ?? result.documentVersion;
    if (result.identityUnknown || !expectedHash || expectedHash !== hash ||
        !Number.isSafeInteger(document.version) ||
        (expectedVersion !== undefined && expectedVersion !== document.version)) {
      const reason = result.identityUnknown ? result.invalidReason ||
        'The original occurrence cannot be tracked. Rerun Search.' :
        'The file changed without a reliable edit history. Rerun Search.';
      return {
        ...markUnknown(result, reason, result.identityUnknownCause || 'external'),
        pending: false
      };
    }
    const key = `${result.offset}:${result.length}`;
    const match = matchesByRange.get(key)?.shift();
    const diskBaseline = diskBaselineFor(result);
    const merged = match ? { ...result, ...match } : result;
    const next = withCoordinates(merged, document, text, result.offset, result.length);
    // Worker metadata may use a narrower scope for revalidation; the original
    // tree's root/path, identity and ordering must remain unchanged.
    for (const field of ['id', 'uri', 'fsPath', 'relativePath', 'rootName', 'label', 'initialOrder'])
      if (Object.hasOwn(result, field)) next[field] = result[field];
    if (diskBaseline) {
      const key = JSON.stringify(diskBaseline);
      if (!baselines.has(key)) baselines.set(key, Object.freeze({ ...diskBaseline }));
      next.diskBaseline = baselines.get(key);
    }
    next.pending = false;
    next.resultRevision = nextRevision(result);
    next.invalid = !match || Boolean(result.diskBaselineUnavailable);
    next.invalidReason = result.diskBaselineUnavailable || (match ? undefined : 'The text no longer matches this search.');
    next.unavailable = Boolean(result.diskBaselineUnavailable);
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
          resultRevision: nextRevision(result),
          pending: false,
          invalid: true,
          unavailable: true,
          identityUnknown: true,
          identityUnknownCause: 'external',
          invalidReason: 'File is unavailable.'
        }
      : result
  );
}

module.exports = {
  sortResults,
  trackDocumentChanges,
  reconcileDocumentResults,
  markDocumentUnavailable,
  markDocumentIdentityUnknown
};
