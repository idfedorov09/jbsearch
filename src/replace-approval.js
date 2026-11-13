'use strict';

const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual, types } = require('node:util');
const { replacementMeaning } = require('./replace');

// A token names the entire immutable client model, never the currently visible
// virtual rows or a mutable provider revision. It is not a paint/read receipt.
function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

// The fast path below never calls user code while inspecting a model. If it
// encounters an accessor, proxy, buffer view, sparse array or non-plain
// prototype, it abandons its private partial copy and runs the original
// traversal exactly once.
// Capture the helpers used for inspection: the legacy copy depends on the
// current traversal intrinsics, so check those separately before taking the
// fast path rather than silently changing their observable behavior.
const object = Object, array = Array, objectPrototype = Object.prototype,
  arrayPrototype = Array.prototype, rootGlobal = globalThis;
const describe = Object.getOwnPropertyDescriptor, ownNames = Object.getOwnPropertyNames,
  keys = Object.keys, hasOwn = Object.hasOwn, getPrototype = Object.getPrototypeOf,
  define = Object.defineProperty, isArray = Array.isArray, isProxy = types.isProxy,
  isArrayBufferView = types.isArrayBufferView,
  apply = Reflect.apply, functionText = Function.prototype.toString;
const ownValue = (target, key) => {
  const descriptor = describe(target, key);
  return descriptor && hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};
const ownGetter = (target, key) => {
  const descriptor = describe(target, key);
  return descriptor && hasOwn(descriptor, 'get') ? descriptor.get : undefined;
};
// Native traversal uses the well-known symbols internally; avoid consulting a
// possibly replaced global Symbol while merely deciding whether to optimize.
const symbol = ownValue(rootGlobal, 'Symbol');
const symbolSource = typeof symbol === 'function' && !isProxy(symbol) ? symbol : undefined;
const iteratorSymbol = symbolSource && ownValue(symbolSource, 'iterator');
const speciesSymbol = symbolSource && ownValue(symbolSource, 'species');
const arrayMap = ownValue(arrayPrototype, 'map');
const arrayIterator = iteratorSymbol && ownValue(arrayPrototype, iteratorSymbol);
const arraySpecies = speciesSymbol && ownGetter(array, speciesSymbol);
const objectEntries = ownValue(object, 'entries'), objectFromEntries = ownValue(object, 'fromEntries'),
  objectValues = ownValue(object, 'values'), objectIsFrozen = ownValue(object, 'isFrozen'),
  objectFreeze = ownValue(object, 'freeze');
const weakMap = WeakMap, weakMapPrototype = WeakMap.prototype;
const weakGet = ownValue(weakMapPrototype, 'get'), weakSet = ownValue(weakMapPrototype, 'set');
const nativeFunction = (value, name) => typeof value === 'function' && !isProxy(value) &&
  apply(functionText, value, []) === `function ${name}() { [native code] }`;
const helperNatives = nativeFunction(describe, 'getOwnPropertyDescriptor') &&
  nativeFunction(ownNames, 'getOwnPropertyNames') && nativeFunction(keys, 'keys') &&
  nativeFunction(hasOwn, 'hasOwn') && nativeFunction(getPrototype, 'getPrototypeOf') &&
  nativeFunction(define, 'defineProperty') && nativeFunction(isArray, 'isArray') && nativeFunction(isProxy, '') &&
  nativeFunction(isArrayBufferView, 'isView') &&
  nativeFunction(apply, 'apply') && nativeFunction(functionText, 'toString') &&
  nativeFunction(weakMap, 'WeakMap') && nativeFunction(weakGet, 'get') && nativeFunction(weakSet, 'set') &&
  nativeFunction(symbolSource, 'Symbol') && typeof iteratorSymbol === 'symbol' && typeof speciesSymbol === 'symbol';
const nativeTraversal = nativeFunction(arrayMap, 'map') &&
  nativeFunction(arrayIterator, 'values') && nativeFunction(arraySpecies, 'get [Symbol.species]') &&
  nativeFunction(objectEntries, 'entries') && nativeFunction(objectFromEntries, 'fromEntries') &&
  nativeFunction(objectValues, 'values') && nativeFunction(objectIsFrozen, 'isFrozen') &&
  nativeFunction(objectFreeze, 'freeze');
const iteratorPrototype = nativeTraversal ? getPrototype(apply(arrayIterator, [], [])) : undefined;
const iteratorNext = iteratorPrototype && ownValue(iteratorPrototype, 'next');
const nativeIterator = nativeFunction(iteratorNext, 'next');

function standardCopyEnvironment() {
  if (!helperNatives || !nativeTraversal || !nativeIterator ||
      ownValue(rootGlobal, 'Object') !== object || ownValue(rootGlobal, 'Array') !== array ||
      ownValue(object, 'entries') !== objectEntries || ownValue(object, 'fromEntries') !== objectFromEntries ||
      ownValue(object, 'values') !== objectValues || ownValue(object, 'isFrozen') !== objectIsFrozen ||
      ownValue(object, 'freeze') !== objectFreeze ||
      ownValue(array, 'isArray') !== isArray || ownValue(arrayPrototype, 'map') !== arrayMap ||
      ownValue(arrayPrototype, 'constructor') !== array || ownValue(arrayPrototype, iteratorSymbol) !== arrayIterator ||
      ownGetter(array, speciesSymbol) !== arraySpecies || ownValue(iteratorPrototype, 'next') !== iteratorNext ||
      ownValue(weakMapPrototype, 'get') !== weakGet || ownValue(weakMapPrototype, 'set') !== weakSet ||
      getPrototype(arrayPrototype) !== objectPrototype || getPrototype(objectPrototype) !== null) return false;

  // Direct property assignment below must act like CreateDataProperty, without
  // invoking an inherited setter or hitting an inherited non-writable value.
  // __proto__ is defined explicitly instead of assigned.
  const objectProperties = ownNames(objectPrototype);
  for (let index = 0; index < objectProperties.length; index++) {
    const key = objectProperties[index], descriptor = describe(objectPrototype, key);
    if (key !== '__proto__' && (!hasOwn(descriptor, 'value') || !descriptor.writable)) return false;
  }
  const arrayProperties = ownNames(arrayPrototype);
  for (let index = 0; index < arrayProperties.length; index++) {
    const key = arrayProperties[index], number = +key;
    if (number >= 0 && number < 0xffffffff && number % 1 === 0 && '' + number === key) return false;
  }
  return true;
}

// Replicas are shared only inside one approval, never with the mutable input.
// Until the whole input is known to be plain data no replica escapes to user
// code; therefore falling back after a late accessor does not repeat effects.
function copyApproval(value, binding) {
  // freeze() visits the binding before the model. Object-valued binding fields
  // could invoke user code there, after the private copy has been constructed.
  const mayRunDuringFreeze = item => item !== null && typeof item === 'object';
  if (!standardCopyEnvironment() || mayRunDuringFreeze(binding.sessionId) ||
      mayRunDuringFreeze(binding.generation) || mayRunDuringFreeze(binding.requestFingerprint) ||
      mayRunDuringFreeze(binding.resultRevision) || mayRunDuringFreeze(binding.scopeEventRevision) ||
      mayRunDuringFreeze(binding.snapshotToken)) return copy(value);
  const replicas = new weakMap(), inProgress = {}, unsafe = {};
  function visit(current) {
    if (!current || typeof current !== 'object') return current;
    // A view can keep a plain prototype while another worker changes its
    // shared backing storage. Reusing its replica would collapse two legacy
    // observations into one, so always fall back for views.
    if (isProxy(current) || isArrayBufferView(current)) throw unsafe;
    const prior = replicas.get(current);
    if (prior === inProgress) throw unsafe;
    if (prior) return prior;
    const prototype = getPrototype(current), arrayInput = isArray(current);
    if (arrayInput ? prototype !== arrayPrototype || hasOwn(current, 'map') || hasOwn(current, 'constructor') :
      prototype !== objectPrototype && prototype !== null) throw unsafe;
    replicas.set(current, inProgress);
    let replica;
    if (arrayInput) {
      replica = [];
      replica.length = current.length;
      for (let index = 0; index < current.length; index++) {
        const descriptor = describe(current, '' + index);
        if (!descriptor || !hasOwn(descriptor, 'value')) throw unsafe;
        replica[index] = visit(descriptor.value);
      }
    } else {
      replica = {};
      const properties = keys(current);
      for (let index = 0; index < properties.length; index++) {
        const key = properties[index], descriptor = describe(current, key);
        if (!descriptor || !hasOwn(descriptor, 'value')) throw unsafe;
        const item = visit(descriptor.value);
        if (key === '__proto__') define(replica, key, { value: item, writable: true, enumerable: true, configurable: true });
        else replica[key] = item;
      }
    }
    replicas.set(current, replica);
    return replica;
  }
  try { return visit(value); }
  catch (error) {
    if (error !== unsafe) throw error;
    return copy(value);
  }
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
  if (session.mode === 'find' || session.searching || session.error || !session.query || !session.results.length ||
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
  return session.replaceApproval = freeze({ binding, model: copyApproval(model, binding) });
}
function assertApproval(session, incoming, { checkModel = true } = {}) {
  const approval = session.replaceApproval;
  if (session.mode === 'find' || !incoming || !approval || !isDeepStrictEqual(incoming, approval.binding) ||
      (checkModel && !isDeepStrictEqual(modelFor(session), approval.model)))
    throw new Error('The replacement action belongs to an older search snapshot or replacement plan. Rerun Search or review the current results before replacing.');
  return approval;
}

module.exports = { approvalFor, assertApproval, modelFor, copy, freeze };
