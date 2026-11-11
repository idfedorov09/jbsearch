'use strict';

// Optional synthetic provider benchmark, NOT a native workbench/Remote test.
// Run: node --expose-gc test/performance/find-tree.js
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const { FindTree } = require('../../src/find-tree');

class Uri {
  constructor(value) { this.value = new URL(value); this.path = decodeURIComponent(this.value.pathname); }
  static parse(value) { return new Uri(value); }
  static joinPath(base, ...parts) { return base.with({ path: path.posix.join(base.path, ...parts) }); }
  with(change) { const copy = new URL(this.value); copy.pathname = change.path; return new Uri(copy.href); }
  toString() { return this.value.href; }
}
class EventEmitter {
  event = () => ({ dispose() {} });
  fire(value) { this.last = value; this.count = (this.count || 0) + 1; }
  dispose() { this.last = undefined; }
}
class ThemeIcon {}
const vscode = {
  Uri, EventEmitter, ThemeIcon,
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => {} },
  window: { createTreeView: () => ({ onDidChangeSelection: () => ({ dispose() {} }), dispose() {} }) }
};

if (!global.gc) throw new Error('Run this benchmark with node --expose-gc.');
const preview = `needle ${'x'.repeat(1993)}`;
const results = Array.from({ length: 50000 }, (_, index) => ({
  id: `match-${index}`, uri: `file:///workspace/src/file-${Math.floor(index / 50)}.js`,
  relativePath: `src/file-${Math.floor(index / 50)}.js`, label: `file-${Math.floor(index / 50)}.js`,
  rootName: 'workspace', lineText: preview, previewMatchStart: 0, previewMatchEnd: 6,
  range: { start: { line: index % 50, character: 0 }, end: { line: index % 50, character: 6 } },
  resultRevision: 0
}));
const actionBinding = Object.freeze({ sessionId: 'benchmark', generation: 1,
  requestFingerprint: 'synthetic-query', resultRevision: 0, scopeEventRevision: 0, snapshotToken: 'snapshot-one' });
const base = { id: 'benchmark', generation: 1, mode: 'replace', query: 'needle', replacement: 'new',
  options: {}, scope: { kind: 'workspace' }, selectedId: 'match-25000', results, actionBinding };
const variants = {
  unchanged: { ...base, results: results.map(row => ({ ...row })), notice: 'Status only' },
  statusOnly: { ...base, results: results.map((row, index) => index === 25000 ? { ...row, pending: true } : row) },
  rowActionRevision: { ...base, results: results.map((row, index) => index === 25000
    ? { ...row, resultRevision: 1, range: { start: { line: 90, character: 0 }, end: { line: 90, character: 6 } } } : row) },
  manifestRevision: { ...base, actionBinding: { ...actionBinding, resultRevision: 1, snapshotToken: 'snapshot-two' } },
  structural: { ...base, results: [...results].reverse() }
};
const names = Object.keys(variants), samples = Object.fromEntries(names.map(name => [name, []]));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function measure(name) {
  global.gc();
  const baseline = process.memoryUsage().heapUsed;
  const tree = new FindTree(vscode);
  tree.update(base);
  global.gc();
  const built = process.memoryUsage().heapUsed;
  let previous = new Map(tree.sessions.get(base.id).tree.byResultId);
  tree.changeEmitter.count = 0;
  tree.changeEmitter.last = undefined;
  const start = performance.now();
  tree.update(variants[name]);
  const elapsedMs = performance.now() - start;
  const current = tree.sessions.get(base.id).tree;
  assert.equal(current.byResultId.size, 50000);
  assert.equal(tree.state.selectedId, 'match-25000');
  assert.equal(current.roots[0].total, 50000);
  let reusedRows = 0;
  for (const [id, node] of current.byResultId) if (previous.get(id) === node) reusedRows++;
  const event = !tree.changeEmitter.count ? 'none' : tree.changeEmitter.last === undefined ? 'root' : 'targeted';
  assert.equal(event, name === 'unchanged' ? 'none' : name === 'structural' ? 'root' : 'targeted');
  assert.equal(reusedRows, ['unchanged', 'statusOnly'].includes(name) ? 50000 : name === 'rowActionRevision' ? 49999 : 0);
  const notified = tree.changeEmitter.last?.length || 0;
  previous = null;
  global.gc();
  const updated = process.memoryUsage().heapUsed;
  const output = { elapsedMs, initialTreeMiB: (built - baseline) / 1048576,
    updatedTreeMiB: (updated - baseline) / 1048576, event, notified, reusedRows };
  tree.dispose();
  return output;
}

for (let round = 0; round < 9; round++) {
  const rotated = [...names.slice(round % names.length), ...names.slice(0, round % names.length)];
  for (const name of rotated) {
    const sample = measure(name);
    if (round >= 2) samples[name].push(sample);
  }
}
const report = Object.fromEntries(names.map(name => [name, {
  medianMs: median(samples[name].map(value => value.elapsedMs)),
  minMs: Math.min(...samples[name].map(value => value.elapsedMs)),
  maxMs: Math.max(...samples[name].map(value => value.elapsedMs)),
  medianInitialTreeMiB: median(samples[name].map(value => value.initialTreeMiB)),
  medianUpdatedTreeMiB: median(samples[name].map(value => value.updatedTreeMiB)),
  event: samples[name][0].event, notified: samples[name][0].notified, reusedRows: samples[name][0].reusedRows
}]));
console.log(JSON.stringify({ node: process.version, platform: `${process.platform}/${process.arch}`,
  fixture: '50k rows, 1000 files; shared 2000-code-unit preview; source/variant fixtures excluded from heap delta',
  measured: 'FindTree.update only; 2 warmup + 7 measured rotated rounds, explicit GC outside timed interval',
  limitation: 'Provider mock only; rowActionRevision isolates a row change with a synthetic unchanged manifest. Real new full bindings use manifestRevision.',
  report }, null, 2));
