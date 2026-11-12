'use strict';

const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const test = require('node:test');
const { samePlans } = require('../src/replace-preflight');

// The previous comparison is retained here as a behavior oracle: the cached
// keys order plans, but they must never replace the original deep comparison.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function previousSamePlans(oldPlans, freshPlans) {
  const normalized = plans => plans.map(stable).sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return isDeepStrictEqual(normalized(oldPlans), normalized(freshPlans));
}
function outcome(fn, left, right) {
  try { return { value: fn(left, right) }; }
  catch (error) { return { error: error.name, message: error.message }; }
}

test('plan comparisons retain deep equality for colliding JSON keys and special values', () => {
  const cases = [
    [[{ value: undefined }], [{}]],
    [[{ value: -0 }], [{ value: 0 }]],
    [[{ value: NaN }], [{ value: null }]],
    [[{ value: undefined }, {}], [{}, { value: undefined }]],
    [[undefined, { range: [1, undefined] }], [{ range: [1, null] }, undefined]],
    [[{ value: 1n }], [{ value: 1n }]],
    [[{ value: 1n }, {}], [{ value: 1n }, {}]],
    [[, { value: 2 }], [{ value: 2 }, ,]],
  ];
  for (const [left, right] of cases)
    assert.deepEqual(outcome(samePlans, left, right), outcome(previousSamePlans, left, right));
});

test('cached-key plan comparison agrees with the previous comparator on deterministic cases', () => {
  let seed = 0x42a5c71;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  const scalars = [undefined, null, false, true, '', 'x', 0, -0, 1, NaN, Infinity];
  const plan = () => ({
    uri: `file:///fixture/${random(8)}.js`,
    range: { start: { line: random(6), character: random(3) }, end: { line: random(6), character: random(3) } },
    replacement: scalars[random(scalars.length)],
    detail: random(2) ? { value: scalars[random(scalars.length)] } : undefined
  });
  for (let iteration = 0; iteration < 2000; iteration++) {
    const left = Array.from({ length: random(9) }, plan);
    const right = structuredClone(left);
    for (let i = right.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [right[i], right[j]] = [right[j], right[i]];
    }
    if (right.length && random(2)) right[random(right.length)].replacement = scalars[random(scalars.length)];
    assert.deepEqual(outcome(samePlans, left, right), outcome(previousSamePlans, left, right), `case ${iteration}`);
  }
});

test('plans containing stateful serializers retain the prior comparator behavior', () => {
  function scenario(compare) {
    let calls = 0;
    const item = value => ({ value, toJSON() { calls++; return { value: this.value, call: calls }; } });
    const result = outcome(compare, [item(1), item(2), item(3)], [item(1), item(2), item(3)]);
    return { result, calls };
  }
  assert.deepEqual(scenario(samePlans), scenario(previousSamePlans));
});

test('an inherited toJSON getter is not invoked while checking cacheability', () => {
  function scenario(compare) {
    const original = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
    let calls = 0;
    Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, get() {
      const call = ++calls;
      return function () { return { key: (this.z || 0) + (call % 3) }; };
    } });
    try {
      const result = outcome(compare,
        [{ z: 1 }, { z: 2 }, { z: 3 }, { z: 4 }],
        [{ z: 1 }, { z: 3 }, { z: 4 }, { z: 2 }]);
      return { result, calls };
    } finally {
      if (original) Object.defineProperty(Object.prototype, 'toJSON', original);
      else delete Object.prototype.toJSON;
    }
  }
  assert.deepEqual(scenario(samePlans), scenario(previousSamePlans));
});

test('cyclic values returned by a customized map use the previous comparator', () => {
  function plans() {
    const cycle = {};
    cycle.self = cycle;
    const result = [];
    result.map = () => [cycle, {}];
    return result;
  }
  assert.deepEqual(outcome(samePlans, plans(), plans()), outcome(previousSamePlans, plans(), plans()));
});

test('each normalized plan has its sort key serialized at most once per side', () => {
  const left = Array.from({ length: 1200 }, (_, index) => ({
    uri: `file:///fixture/${index % 11}.js`, range: { start: { line: index, character: 0 } }, replacement: 'x'
  }));
  const right = [...left].reverse();
  const original = JSON.stringify;
  let calls = 0;
  JSON.stringify = function (...args) { calls++; return original.apply(this, args); };
  try {
    assert.equal(samePlans(left, right), true);
    assert.ok(calls <= left.length + right.length, `${calls} keys for ${left.length + right.length} plans`);
  } finally {
    JSON.stringify = original;
  }
});
