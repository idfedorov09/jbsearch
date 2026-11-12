'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { approvalFor, assertApproval, copy, freeze, modelFor } = require('../src/replace-approval');
const { SearchController } = require('../src/controller');
const { FindTree } = require('../src/find-tree');

function session() {
  return {
    id: 'approval', mode: 'replace', layout: 'findWindow', generation: 3,
    query: '(cat)', replacement: '$1 dog', options: { regex: true },
    scope: { kind: 'workspace' }, searchRequestFingerprint: 'scope',
    selectedId: 'one', results: [{
      id: 'one', uri: 'file:///workspace/one.js', relativePath: 'one.js', label: 'one.js',
      rootName: 'workspace', offset: 0, length: 3, matchText: 'cat',
      lineText: 'cat', previewMatchStart: 0, previewMatchEnd: 3, resultRevision: 1,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
      captures: ['cat'], groups: {}
    }]
  };
}

class Uri {
  constructor(value) { this.value = new URL(value); this.path = decodeURIComponent(this.value.pathname); }
  static parse(value) { return new Uri(value); }
  static joinPath(base, ...parts) { return base.with({ path: path.posix.join(base.path, ...parts) }); }
  with(change) { const value = new URL(this.value); value.pathname = change.path; return new Uri(value.href); }
  toString() { return this.value.href; }
}
class EventEmitter {
  event = () => ({ dispose() {} });
  fire() {}
  dispose() {}
}
class ThemeIcon {}
const vscode = {
  Uri, EventEmitter, ThemeIcon,
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => {} },
  window: { createTreeView: () => ({ onDidChangeSelection: () => ({ dispose() {} }), dispose() {} }) }
};

function controllerSnapshot(value) {
  return SearchController.prototype.snapshot.call({ configuration: () => ({ get: () => [] }) }, value);
}

test('Find creates no approval and retires a Replace token even for lightweight checks', () => {
  const value = session(), before = approvalFor(value), old = structuredClone(before.binding);
  value.mode = 'find';
  // Admission must fail even before the next presentation clears the old model.
  assert.throws(() => assertApproval(value, old, { checkModel: false }), /older search snapshot/);
  assert.equal(approvalFor(value), undefined);
  assert.equal(value.replaceApproval, undefined);
  value.mode = 'replace';
  assert.throws(() => assertApproval(value, old), /older search snapshot/);
  const after = approvalFor(value);
  assert.notEqual(after.binding.snapshotToken, old.snapshotToken);
  assert.throws(() => assertApproval(value, old), /older search snapshot/);
  assert.equal(assertApproval(value, after.binding), after);

  value.mode = 'find';
  value.reviewOnly = true;
  value.reviewApproval = before;
  assert.equal(approvalFor(value), before, 'an existing frozen review keeps its own approval');
});

test('Find skips result inspection while navigation remains usable across mode transitions', async t => {
  const value = session();
  const selected = [], actions = [];
  const tree = new FindTree(vscode, {
    onSelect: (...args) => selected.push(args),
    onAction: (...args) => actions.push(args)
  });
  t.after(() => tree.dispose());
  const before = controllerSnapshot(value);
  tree.update(before);
  const old = tree.sessions.get(value.id).tree.byResultId.get('one');

  value.mode = 'find';
  tree.update(controllerSnapshot(value));
  const findNode = tree.sessions.get(value.id).tree.byResultId.get('one');
  assert.equal(tree.state.actionBinding, null);
  assert.equal(await tree.activate(old.action), false);
  assert.equal(await tree.activate(findNode.action), true);
  assert.equal(await tree.action('replace', findNode), false);

  value.mode = 'replace';
  const after = controllerSnapshot(value);
  tree.update(after);
  const replaceNode = tree.sessions.get(value.id).tree.byResultId.get('one');
  assert.notEqual(after.actionBinding.snapshotToken, before.actionBinding.snapshotToken);
  assert.equal(await tree.activate(findNode.action), false);
  assert.equal(await tree.action('replace', old), false);
  assert.equal(await tree.action('replace', replaceNode), true);
  assert.equal(selected.length, 1);
  assert.equal(actions[0][1].actionBinding.snapshotToken, after.actionBinding.snapshotToken);

  value.mode = 'find';
  Object.defineProperty(value.results[0], 'shouldNotRead', { enumerable: true,
    get() { throw new Error('Find should not build an approval model'); } });
  assert.equal(approvalFor(value), undefined);
});

test('shared replica objects are frozen, isolated and checked after source mutation', () => {
  const value = session(), row = value.results[0];
  const baseline = { hash: 'first', size: 14 }, captures = ['cat', undefined];
  row.diskBaseline = baseline;
  row.captures = captures;
  value.results.push({ ...row, id: 'two', offset: 10, diskBaseline: baseline, captures });
  const first = approvalFor(value), [one, two] = first.model.results;
  assert.equal(one.diskBaseline, two.diskBaseline);
  assert.equal(one.captures, two.captures);
  assert.equal(one.range, first.model.replacementMeaning[0].range);
  assert.notEqual(one.diskBaseline, baseline);
  assert.notEqual(one.captures, captures);
  assert.ok(Object.isFrozen(one.diskBaseline));
  assert.ok(Object.isFrozen(one.captures));
  assert.ok(Object.isFrozen(one.range.start));
  assert.throws(() => { one.diskBaseline.hash = 'changed'; }, TypeError);
  baseline.hash = 'changed';
  captures[0] = 'dog';
  assert.equal(one.diskBaseline.hash, 'first');
  assert.equal(one.captures[0], 'cat');
  assert.throws(() => assertApproval(value, first.binding), /older search snapshot/);
  const second = approvalFor(value);
  assert.notEqual(second.binding.snapshotToken, first.binding.snapshotToken);
  assert.notEqual(second.model.results[0].diskBaseline, one.diskBaseline,
    'separate approvals cannot share their owned replicas');
});

test('a typed-array view with a plain prototype keeps independent legacy copies', () => {
  const value = session();
  const view = new Uint8Array(new SharedArrayBuffer(2));
  view[0] = 3;
  view[1] = 7;
  Object.setPrototypeOf(view, Object.prototype);
  value.results[0].meta = { first: view, second: view };
  const expected = copy(modelFor(value));
  const actual = approvalFor(value).model;
  assert.deepEqual(actual, expected);
  assert.notEqual(actual.results[0].meta.first, actual.results[0].meta.second);
});

test('sparse arrays, undefined and special property keys preserve legacy copy values', () => {
  const value = session();
  const sparse = Array(5);
  sparse[1] = undefined;
  sparse[3] = 'cat';
  const special = Object.create(null);
  Object.defineProperty(special, '__proto__', { enumerable: true, value: { safe: true } });
  special.constructor = 'value';
  special.prototype = undefined;
  special.sparse = sparse;
  special.number = -0;
  special.nan = NaN;
  const ignored = Symbol('ignored');
  special[ignored] = 'not enumerable by Object.entries';
  value.results[0].meta = special;
  const expected = copy(modelFor(value));
  const approval = approvalFor(value), actual = approval.model;
  assert.deepEqual(actual, expected);
  assert.equal(Object.getPrototypeOf(actual.results[0].meta), Object.prototype);
  assert.equal(Object.hasOwn(actual.results[0].meta, '__proto__'), true);
  assert.equal(actual.results[0].meta.__proto__.safe, true);
  assert.equal(Object.hasOwn(actual.results[0].meta, 'prototype'), true);
  assert.equal(Object.hasOwn(actual.results[0].meta, ignored), false);
  const result = actual.results[0].meta.sparse;
  assert.equal(result.length, 5);
  assert.equal(0 in result, false);
  assert.equal(1 in result, true);
  assert.equal(result[1], undefined);
  assert.equal(2 in result, false);
  assert.equal(4 in result, false);
  assert.equal(Object.is(actual.results[0].meta.number, -0), true);
  assert.equal(Number.isNaN(actual.results[0].meta.nan), true);
});

test('getters run on each legacy encounter and cannot cause stale shared replicas', () => {
  const value = session(), shared = { count: 0 };
  let reads = 0;
  const changing = { get current() { return ++reads; } };
  const effect = { get update() { shared.count++; return 'done'; } };
  value.results[0].meta = { before: shared, effect, after: shared, first: changing, second: changing };
  const approval = approvalFor(value), meta = approval.model.results[0].meta;
  assert.equal(meta.before.count, 0);
  assert.equal(meta.after.count, 1);
  assert.notEqual(meta.before, meta.after);
  assert.equal(meta.first.current, 1);
  assert.equal(meta.second.current, 2);
  assert.notEqual(meta.first, meta.second);
  assert.equal(reads, 2);
});

test('proxy and custom-array behavior keeps legacy traversal and side effects', () => {
  function source() {
    const calls = [];
    const shared = { number: 0 };
    const proxy = new Proxy({ value: 7 }, {
      ownKeys(target) { calls.push('keys'); shared.number++; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) { calls.push(`descriptor:${key}`); return Reflect.getOwnPropertyDescriptor(target, key); },
      get(target, key, receiver) { calls.push(`get:${key}`); return Reflect.get(target, key, receiver); }
    });
    const custom = [1, 2];
    custom.map = function (callback) { calls.push('map'); return Array.prototype.map.call(this, callback).concat(3); };
    const value = session();
    value.results[0].meta = { before: shared, proxy, after: shared, first: custom, second: custom };
    return { value, calls };
  }
  const expected = source(), actual = source();
  const expectedModel = copy(modelFor(expected.value));
  const approval = approvalFor(actual.value);
  assert.deepEqual(approval.model, expectedModel);
  assert.deepEqual(actual.calls, expected.calls);
  assert.equal(approval.model.results[0].meta.before.number, 0);
  assert.equal(approval.model.results[0].meta.after.number, 1);
  assert.deepEqual(approval.model.results[0].meta.first, [1, 2, 3]);
  assert.deepEqual(approval.model.results[0].meta.second, [1, 2, 3]);
});

test('an accessor changing Array#map cannot cause a cached copy to skip legacy calls', () => {
  function run(optimized) {
    const original = Array.prototype.map;
    let calls = 0;
    const shared = { key: 'same' };
    const value = session();
    value.results[0].meta = {
      before: shared,
      effect: { get patch() {
        Array.prototype.map = function (...args) { calls++; return original.apply(this, args); };
        return 'patched';
      } },
      after: shared
    };
    try {
      return { model: optimized ? approvalFor(value).model : copy(modelFor(value)), calls };
    } finally {
      Array.prototype.map = original;
    }
  }
  const expected = run(false), actual = run(true);
  assert.deepEqual(actual.model, expected.model);
  assert.equal(actual.calls, expected.calls);
  assert.ok(actual.calls > 0);
});

test('an inherited sparse-array accessor retains map traversal and side effects', () => {
  function source() {
    let reads = 0;
    const inherited = Object.create(Array.prototype);
    Object.defineProperty(inherited, '0', { get() { reads++; return 'from prototype'; } });
    const array = Array(3);
    array[2] = undefined;
    Object.setPrototypeOf(array, inherited);
    const value = session();
    value.results[0].meta = { first: array, second: array };
    return { value, reads: () => reads };
  }
  const expected = source(), actual = source();
  const expectedModel = copy(modelFor(expected.value));
  const approval = approvalFor(actual.value);
  assert.deepEqual(approval.model, expectedModel);
  assert.equal(actual.reads(), expected.reads());
  assert.equal(actual.reads(), 2);
  const [first, second] = [approval.model.results[0].meta.first, approval.model.results[0].meta.second];
  assert.equal(first[0], 'from prototype');
  assert.equal(1 in first, false);
  assert.equal(2 in first, true);
  assert.notEqual(first, second);
});

test('deterministic shared-graph copies match legacy values and accessor order', () => {
  function source(seed) {
    let state = seed, reads = 0;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
    const leaves = Array.from({ length: 5 }, (_, index) => ({ index, value: next() % 31 }));
    const groups = Array.from({ length: 8 }, () => {
      const leaf = leaves[next() % leaves.length];
      return { leaf, items: [leaf, undefined, next() % 10] };
    });
    const effect = { get current() { reads++; leaves[seed % leaves.length].value++; return reads; } };
    const value = session();
    value.results[0].meta = { groups, before: leaves[seed % leaves.length], effect,
      after: leaves[seed % leaves.length], duplicate: groups[next() % groups.length] };
    return { value, reads: () => reads };
  }
  for (let seed = 1; seed <= 100; seed++) {
    const expected = source(seed), actual = source(seed);
    const expectedModel = copy(modelFor(expected.value));
    const approval = approvalFor(actual.value);
    assert.deepEqual(approval.model, expectedModel, `copy differs for seed ${seed}`);
    assert.equal(actual.reads(), expected.reads(), `getter count differs for seed ${seed}`);
  }
});

test('a late getter changing Object.fromEntries preserves independent legacy copies', () => {
  function run(optimized) {
    const original = Object.fromEntries, shared = { value: 1 }, value = session();
    value.results[0].meta = {
      effect: { get patch() {
        Object.fromEntries = entries => {
          const first = entries.find(([key]) => key === 'first');
          if (first) first[1].value = 99;
          return original(entries);
        };
        return 'patched';
      } },
      after: { first: shared, second: shared }
    };
    try { return optimized ? approvalFor(value).model : copy(modelFor(value)); }
    finally { Object.fromEntries = original; }
  }
  const expected = run(false), actual = run(true);
  assert.deepEqual(actual, expected);
  assert.equal(actual.results[0].meta.after.first.value, 99);
  assert.equal(actual.results[0].meta.after.second.value, 1);
  assert.notEqual(actual.results[0].meta.after.first, actual.results[0].meta.after.second);
});

test('an already customized array iterator retains legacy copy side effects', () => {
  function run(optimized) {
    const original = Array.prototype[Symbol.iterator], value = session();
    let calls = 0;
    try {
      Array.prototype[Symbol.iterator] = function () { calls++; return original.call(this); };
      const model = optimized ? approvalFor(value).model : freeze({ binding: {
        sessionId: value.id, generation: value.generation, requestFingerprint: value.searchRequestFingerprint,
        resultRevision: 1, scopeEventRevision: 0, snapshotToken: 'token'
      }, model: copy(modelFor(value)) }).model;
      return { model, calls };
    } finally { Array.prototype[Symbol.iterator] = original; }
  }
  const expected = run(false), actual = run(true);
  assert.deepEqual(actual.model, expected.model);
  assert.equal(actual.calls, expected.calls);
  assert.ok(actual.calls > 0);
});

test('inherited setters cannot observe or prevent plain approval property creation', () => {
  const key = 'jbSearchApprovalSetterTest', value = session();
  const meta = Object.create(null);
  meta[key] = 'safe';
  value.results[0].meta = meta;
  let calls = 0;
  Object.defineProperty(Object.prototype, key, { configurable: true, set() { calls++; throw new Error('inherited setter'); } });
  try {
    const expected = copy(modelFor(value));
    const actual = approvalFor(value).model;
    assert.deepEqual(actual, expected);
    assert.equal(actual.results[0].meta[key], 'safe');
    assert.equal(calls, 0);
  } finally { delete Object.prototype[key]; }
});

test('custom freeze operations cannot observe shared approval replicas', () => {
  for (const method of ['values', 'freeze', 'isFrozen']) {
    function run(optimized) {
      const original = Object[method], isFrozen = Object.isFrozen;
      const shared = { tagged: true, value: 1 }, value = session();
      value.results[0].meta = { first: shared, second: shared };
      let calls = 0;
      Object[method] = item => {
        if (item?.tagged && !isFrozen(item)) item.value = 40 + ++calls;
        return original(item);
      };
      try {
        const model = optimized ? approvalFor(value).model : freeze(copy(modelFor(value)));
        return { calls, first: model.results[0].meta.first.value, second: model.results[0].meta.second.value };
      } finally { Object[method] = original; }
    }
    const expected = run(false), actual = run(true);
    assert.deepEqual(actual, expected, method);
    assert.deepEqual(actual, { calls: 2, first: 41, second: 42 }, method);
  }
});

test('a binding getter cannot expose shared replicas while approval is frozen', () => {
  function run(optimized) {
    const original = Object.values, shared = { value: 1 }, value = session();
    value.results[0].meta = { first: shared, second: shared };
    value.scopeEventRevision = { get patch() {
      Object.values = item => {
        if (item?.first && item?.second) item.first.value = 99;
        return original(item);
      };
      return 1;
    } };
    try {
      const model = optimized ? approvalFor(value).model : freeze({
        binding: { scopeEventRevision: value.scopeEventRevision }, model: copy(modelFor(value))
      }).model;
      return { first: model.results[0].meta.first.value, second: model.results[0].meta.second.value };
    } finally { Object.values = original; }
  }
  const expected = run(false), actual = run(true);
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual, { first: 99, second: 1 });
});

test('intrinsic guards do not invoke inherited descriptor getters', () => {
  for (const variant of ['accessor-value', 'data-get']) {
    function run(optimized) {
      const value = session(), shared = { count: 1 };
      value.results[0].meta = { first: shared, second: shared };
      const target = variant === 'accessor-value' ? Object : Array;
      const property = variant === 'accessor-value' ? 'freeze' : Symbol.species;
      const inherited = variant === 'accessor-value' ? 'value' : 'get';
      const original = Object.getOwnPropertyDescriptor(target, property);
      const originalInherited = Object.getOwnPropertyDescriptor(Object.prototype, inherited);
      let descriptorReads = 0;
      if (variant === 'accessor-value') {
        const builtin = Object.freeze;
        Object.defineProperty(target, property, { get() { return builtin; }, configurable: true });
      } else {
        Object.defineProperty(target, property, { value: Array, configurable: true });
      }
      Object.defineProperty(Object.prototype, inherited, {
        get() { descriptorReads++; return undefined; }, configurable: true
      });
      try {
        if (optimized) approvalFor(value);
        else freeze({ binding: {
          sessionId: value.id, generation: value.generation, requestFingerprint: value.searchRequestFingerprint,
          resultRevision: 1, scopeEventRevision: 0, snapshotToken: 'token'
        }, model: copy(modelFor(value)) });
        return descriptorReads;
      } finally {
        delete Object.prototype[inherited];
        Object.defineProperty(target, property, original);
        if (originalInherited) Object.defineProperty(Object.prototype, inherited, originalInherited);
      }
    }
    assert.equal(run(false), 0, variant);
    assert.equal(run(true), 0, variant);
  }
});

test('intrinsic guards do not consult a replaced global Symbol', () => {
  function run(optimized) {
    const value = session(), original = globalThis.Symbol;
    let reads = 0;
    globalThis.Symbol = new Proxy(original, { get(target, key, receiver) {
      if (key === 'iterator' || key === 'species') reads++;
      return Reflect.get(target, key, receiver);
    } });
    try {
      if (optimized) approvalFor(value);
      else freeze({ binding: {
        sessionId: value.id, generation: value.generation, requestFingerprint: value.searchRequestFingerprint,
        resultRevision: 1, scopeEventRevision: 0, snapshotToken: 'token'
      }, model: copy(modelFor(value)) });
      return reads;
    } finally { globalThis.Symbol = original; }
  }
  assert.equal(run(false), 0);
  assert.equal(run(true), 0);
});
