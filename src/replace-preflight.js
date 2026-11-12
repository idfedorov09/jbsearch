'use strict';

const { contentHash } = require('./content-hash');
const { isDeepStrictEqual, types } = require('node:util');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { isPathWithin, acceptsFile } = require('./search/matcher');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

// Document contents and versions vary during editing; Open Editors membership,
// however, is part of its effective scope. Preserve Case affects replacement,
// not the discovery request, and is checked separately by the operation.
function requestFingerprint(request) {
  const { documents = [], preserveCase, ...search } = request;
  if (search.scope?.kind === 'openEditors')
    search.openEditors = documents.map(document => document.uri).sort();
  return JSON.stringify(stable(search));
}

function authoritativeDocument(request, document) {
  const file = String(document.uri).startsWith('file:');
  if (file && document.isDirty === false && request.sourcePolicy !== 'buffer-validation' &&
      ['utf8', 'utf8bom', undefined].includes(document.encoding)) return false;
  const scope = request.scope || {};
  if (scope.kind === 'openEditors') return true;
  if (!file) return false; // Untitled buffers belong only to Open Editors.
  try {
    const filePath = document.fsPath || fileURLToPath(document.uri);
    let roots = (request.roots || []).filter(root => isPathWithin(filePath, root.path));
    if (scope.kind === 'folder') {
      const selected = scope.rootPath || scope.path || scope.folder || scope.rootUri;
      roots = roots.filter(root => selected ? path.resolve(root.path) === path.resolve(
        String(selected).startsWith('file:') ? fileURLToPath(selected) : selected) :
        request.roots.indexOf(root) === scope.rootIndex);
    } else roots.sort((a, b) => b.path.length - a.path.length);
    const root = roots[0];
    if (!root) return false;
    if (scope.kind === 'directory' && !isPathWithin(filePath,
      path.resolve(root.path, scope.directory || scope.path))) return false;
    return acceptsFile(path.relative(root.path, filePath).replace(/\\/g, '/'), request, root);
  } catch { return true; } // Uncertain membership must never hide an input.
}

function documentFingerprint(request) {
  // Loading an unchanged clean file only admits it to VS Code's document
  // cache; disk remains its search authority. Dirty/untitled inputs (including
  // clean -> dirty transitions) still change the effective buffer authority.
  // Open Editors membership is independently part of requestFingerprint().
  return JSON.stringify((request.documents || []).filter(document => authoritativeDocument(request, document)).map(document =>
    document.isDirty === false && request.sourcePolicy !== 'buffer-validation' && String(document.uri).startsWith('file:')
      ? { uri: document.uri, encoding: document.encoding, cleanDiskCodec: true } : ({
    uri: document.uri,
    version: document.version,
    isDirty: document.isDirty,
    encoding: document.encoding,
    eol: document.eol,
    snapshotUnavailable: document.snapshotUnavailable,
    // Hash UTF-16 code units rather than UTF-8's replacement of lone surrogates.
    contentHash: contentHash(String(document.text ?? ''))
  })).sort((a, b) => String(a.uri) < String(b.uri) ? -1 : String(a.uri) > String(b.uri) ? 1 : 0));
}

function knownDiskBaseline(value, expectedUri, canonicalUri = value => value) {
  return Boolean(value && value.origin === 'disk' &&
    typeof value.uri === 'string' && value.uri &&
    (expectedUri === undefined || canonicalUri(value.uri) === canonicalUri(expectedUri)) &&
    typeof value.byteHash === 'string' && /^[\da-f]{64}$/i.test(value.byteHash) &&
    Number.isSafeInteger(value.fileSize) && value.fileSize >= 0 &&
    ['mtimeMs', 'ctimeMs', 'dev', 'ino'].every(field => Number.isFinite(value[field])) &&
    ['no-follow', 'identity-validated'].includes(value.linkPolicy));
}

function knownProvenance(match) {
  if (!match || typeof match.contentHash !== 'string' || !/^[\da-f]{64}$/i.test(match.contentHash))
    return false;
  if (match.source === 'snapshot')
    return Number.isSafeInteger(match.documentVersion) && match.documentVersion >= 0;
  if (match.source === 'disk')
    return Number.isFinite(match.mtimeMs) && Number.isSafeInteger(match.fileSize) && match.fileSize >= 0;
  return false;
}

function sameOccurrences(oldResults, freshResults, canonicalUri = value => value) {
  if (!Array.isArray(oldResults) || !Array.isArray(freshResults) || oldResults.length !== freshResults.length)
    return false;
  const byLocation = new Map(), freshIds = new Set(), oldIds = new Set();
  const key = match => JSON.stringify([canonicalUri(match.uri), match.offset, match.length]);
  for (const match of freshResults) {
    const id = key(match);
    if (typeof match.id !== 'string' || !match.id || freshIds.has(match.id) || byLocation.has(id))
      return false;
    freshIds.add(match.id);
    byLocation.set(id, match);
  }
  for (const old of oldResults) {
    if (typeof old.id !== 'string' || !old.id || oldIds.has(old.id)) return false;
    oldIds.add(old.id);
    const id = key(old), fresh = byLocation.get(id);
    if (!fresh || old.matchText !== fresh.matchText || !isDeepStrictEqual(old.range, fresh.range) ||
        !isDeepStrictEqual(old.captures || [], fresh.captures || []) ||
        !isDeepStrictEqual(old.groups || {}, fresh.groups || {})) return false;
    byLocation.delete(id);
  }
  return byLocation.size === 0;
}

function samePlans(oldPlans, freshPlans) {
  const normalized = plans => {
    // Cache the ordering key, not the plan or the equality decision. Computing
    // it lazily preserves Array#sort's treatment of undefined and sparse rows.
    const values = plans.map(plan => stable(plan));
    const visiting = new WeakSet();
    const plainData = value => {
      if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return false;
      if (!value || typeof value !== 'object') return true;
      if (types.isProxy(value) || visiting.has(value)) return false;
      visiting.add(value);
      try {
        // Looking up toJSON directly can itself execute a stateful getter, even
        // on a prototype. Detect serializers without invoking them and leave
        // the original comparator to perform all observable accesses.
        for (let current = value; current; current = Object.getPrototypeOf(current)) {
          if (types.isProxy(current)) return false;
          const serializer = Object.getOwnPropertyDescriptor(current, 'toJSON');
          if (serializer) {
            if (!Object.hasOwn(serializer, 'value') || typeof serializer.value === 'function') return false;
            break;
          }
        }
        // stable() normally produces data properties. If a customized array map
        // or object constructor produced accessors, avoid evaluating them here.
        for (const key of Object.keys(value)) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || !plainData(descriptor.value)) return false;
        }
        // JSON.stringify reads inherited array indices at holes, which can be
        // stateful. Do not cache such arrays, including the outer sort input.
        if (Array.isArray(value)) {
          for (let index = 0; index < value.length; index++) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
            if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
          }
        }
        return true;
      } finally { visiting.delete(value); }
    };
    let cacheable = Array.isArray(values) && !types.isProxy(values) && values.length > 1;
    for (let index = 0; cacheable && index < values.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !plainData(descriptor.value)) cacheable = false;
    }
    const keys = new Map();
    const key = plan => {
      if (!cacheable) return JSON.stringify(plan);
      if (!keys.has(plan)) keys.set(plan, JSON.stringify(plan));
      return keys.get(plan);
    };
    return values.sort((a, b) => {
      const left = key(a), right = key(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  };
  return isDeepStrictEqual(normalized(oldPlans), normalized(freshPlans));
}

module.exports = { requestFingerprint, documentFingerprint, knownProvenance, knownDiskBaseline, sameOccurrences, samePlans };
