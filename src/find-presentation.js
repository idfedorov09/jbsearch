'use strict';

// Presentation may copy a backend descriptor, but must never mint its token or
// infer approval from a current provider element, selection, or refresh event.
const bindingFields = ['sessionId', 'generation', 'requestFingerprint',
  'resultRevision', 'scopeEventRevision', 'snapshotToken'];

function captureActionBinding(value) {
  if (!value || !['sessionId', 'requestFingerprint', 'snapshotToken'].every(
    key => typeof value[key] === 'string' && value[key]) ||
    !['generation', 'resultRevision', 'scopeEventRevision'].every(
      key => Number.isSafeInteger(value[key]) && value[key] >= 0)) return null;
  return Object.freeze(Object.fromEntries(bindingFields.map(key => [key, value[key]])));
}

function sameActionBinding(left, right) {
  return Boolean(left && right && bindingFields.every(key => left[key] === right[key]));
}

function requestPresentationKey(state) {
  return JSON.stringify([state.id, state.generation, state.mode, state.query,
    state.replacement, state.options, state.scope, state.requestFingerprint]);
}

// Store primitives, not references to input ranges/captures which a caller may
// mutate before its next notification. This is navigation identity, not a
// replacement preflight or a substitute for the backend's full manifest.
function rowActionKey(result) {
  return JSON.stringify([result.id, String(result.uri || ''), result.resultRevision,
    result.range?.start?.line, result.range?.start?.character,
    result.range?.end?.line, result.range?.end?.character,
    result.offset, result.length, result.matchText, result.captures, result.groups,
    result.documentVersion, result.contentHash, result.trackedDocumentVersion,
    result.trackedContentHash, result.identityUnknown, result.unavailable]);
}

function captureRowResult(result) {
  const range = result.range && Object.freeze({
    start: result.range.start && Object.freeze({ ...result.range.start }),
    end: result.range.end && Object.freeze({ ...result.range.end })
  });
  return Object.freeze({ ...result, range });
}

function sameRowPresentationData(left, right) {
  // Ranges are compared by the action key. All remaining fields are scalar
  // display data or references retained only for presentation, never approval.
  for (const key in left) if (key !== 'range' && (!(key in right) || left[key] !== right[key])) return false;
  for (const key in right) if (!(key in left)) return false;
  return true;
}

module.exports = { captureActionBinding, sameActionBinding, requestPresentationKey,
  rowActionKey, captureRowResult, sameRowPresentationData };
