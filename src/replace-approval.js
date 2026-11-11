'use strict';

const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { replacementMeaning } = require('./replace');

// A token names the entire immutable client model, never the currently visible
// virtual rows or a mutable provider revision. It is not a paint/read receipt.
function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function modelFor(session) {
  const model = {
    sessionId: session.id, generation: session.generation,
    requestFingerprint: session.searchRequestFingerprint || null,
    query: session.query, replacement: session.replacement, mode: session.mode,
    options: session.options, scope: session.scope, partial: Boolean(session.partial),
    // Ignore private tracking symbols, but compare nested values against the
    // frozen copy. Status echoes need not deep-copy 50,000 rows just to prove
    // that the already issued token still names the same model.
    results: session.results.map(result => Object.fromEntries(Object.entries(result)))
  };
  model.replacementMeaning = replacementMeaning(model.results, {
    replacement: model.replacement, regex: model.options?.regex, preserveCase: model.options?.preserveCase
  });
  return model;
}
function approvalFor(session) {
  if (session.reviewOnly) return session.reviewApproval;
  if (session.searching || session.error || !session.query || !session.results.length ||
      typeof session.searchRequestFingerprint !== 'string' || !session.searchRequestFingerprint) {
    session.replaceApproval = undefined;
    return undefined;
  }
  const model = modelFor(session);
  if (session.replaceApproval && isDeepStrictEqual(model, session.replaceApproval.model))
    return session.replaceApproval;
  session.resultRevision = (session.resultRevision || 0) + 1;
  const binding = {
    sessionId: session.id, generation: session.generation,
    requestFingerprint: session.searchRequestFingerprint || null,
    resultRevision: session.resultRevision,
    scopeEventRevision: session.scopeEventRevision || 0,
    snapshotToken: randomUUID()
  };
  return session.replaceApproval = freeze({ binding, model: copy(model) });
}
function assertApproval(session, incoming, { checkModel = true } = {}) {
  const approval = session.replaceApproval;
  if (!incoming || !approval || !isDeepStrictEqual(incoming, approval.binding) ||
      (checkModel && !isDeepStrictEqual(modelFor(session), approval.model)))
    throw new Error('The replacement action belongs to an older search snapshot or replacement plan. Rerun Search or review the current results before replacing.');
  return approval;
}

module.exports = { approvalFor, assertApproval, modelFor, copy, freeze };
