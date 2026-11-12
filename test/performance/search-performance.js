'use strict';

// Optional synthetic benchmark; this is not a native VS Code/Remote test.
// Usage: node --expose-gc test/performance/search-performance.js [source-root]
// For a baseline root outside the repository, make its dependencies resolvable
// with NODE_PATH=<this repository>/node_modules or a local node_modules link.
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
if (!global.gc) throw new Error('Run with node --expose-gc.');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../..'));
const moduleAt = relative => require(path.join(root, 'src', relative));
const { SearchController } = moduleAt('controller');
const { FindTree } = moduleAt('find-tree');
const { approvalFor, modelFor } = moduleAt('replace-approval');
const { samePlans } = moduleAt('replace-preflight');

class Uri {
  constructor(value) { this.value = new URL(value); this.path = decodeURIComponent(this.value.pathname); }
  static parse(value) { return new Uri(value); }
  static joinPath(base, ...parts) { return base.with({ path: path.posix.join(base.path, ...parts) }); }
  with(change) { const next = new URL(this.value); next.pathname = change.path; return new Uri(next.href); }
  toString() { return this.value.href; }
}
class EventEmitter { event = () => ({ dispose() {} }); fire() {} dispose() {} }
class ThemeIcon {}
const vscode = {
  Uri, EventEmitter, ThemeIcon,
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => {} },
  window: { createTreeView: () => ({ onDidChangeSelection: () => ({ dispose() {} }), dispose() {} }) }
};
const preview = `needle ${'x'.repeat(193)}`;
const count = 5000, perFile = 50;
const sharedBaselines = new Map();
const results = Array.from({ length: count }, (_, index) => {
  const file = Math.floor(index / perFile), uri = `file:///workspace/src/file-${file}.js`;
  if (!sharedBaselines.has(uri)) sharedBaselines.set(uri, { origin: 'disk', uri,
    byteHash: 'a'.repeat(64), mtimeMs: 1, ctimeMs: 1, fileSize: 1000, dev: 1, ino: file,
    linkPolicy: 'no-follow' });
  return { id: `${uri}:${index}:6`, uri, fsPath: `/workspace/src/file-${file}.js`,
    relativePath: `src/file-${file}.js`, label: `file-${file}.js`, rootName: 'workspace',
    source: 'disk', contentHash: 'b'.repeat(64), diskBaseline: sharedBaselines.get(uri),
    lineText: preview, previewMatchStart: 0, previewMatchEnd: 6,
    range: { start: { line: index % perFile, character: 0 }, end: { line: index % perFile, character: 6 } },
    offset: index, length: 6, matchText: 'needle', captures: [], resultRevision: 0 };
});
const stats = { filesScanned: 100, filesMatched: 100, matches: count, skippedFiles: 0,
  excludedBinaryFiles: 0, blockingSkippedFiles: 0, skippedDetails: [], errors: [],
  timedOut: false, cancelled: false };
const request = { query: 'needle', roots: [], documents: [], scope: { kind: 'workspace' },
  maxResults: count, maxFileSizeMiB: 2, timeoutMs: 10000 };
function session() {
  return { id: 'benchmark', generation: 1, mode: 'find', layout: 'findWindow', query: 'needle',
    replacement: '', options: { regex: false }, scope: { kind: 'workspace' },
    searchRequestFingerprint: 'synthetic-query', results: [], selectedId: null,
    panels: new Set(), searching: true, partial: false, patchAcks: new Map() };
}
function timed(fn) {
  const cpu = process.cpuUsage(), started = performance.now();
  const value = fn();
  const elapsed = performance.now() - started, usage = process.cpuUsage(cpu);
  return { value, wallMs: elapsed, cpuMs: (usage.user + usage.system) / 1000 };
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summarize = samples => ({ medianMs: median(samples.map(item => item.wallMs)),
  minMs: Math.min(...samples.map(item => item.wallMs)), maxMs: Math.max(...samples.map(item => item.wallMs)),
  medianCpuMs: median(samples.map(item => item.cpuMs)) });

async function streamOnce() {
  const controller = Object.create(SearchController.prototype), current = session();
  Object.assign(controller, { v: vscode, disposed: false, sessions: new Map([[current.id, current]]),
    findTree: new FindTree(vscode), configuration: () => ({ get: (_key, fallback) => fallback }),
    request: async () => request, selectAutomatic: () => {},
    engine: { async search(_request, { onBatch }) {
      for (let offset = 0; offset < results.length; offset += 80) {
        onBatch(results.slice(offset, offset + 80));
        await new Promise(resolve => setImmediate(resolve));
      }
      return { results, truncated: false, reason: undefined, stats };
    } } });
  const notify = controller.notify.bind(controller);
  let notifications = 0;
  controller.notify = value => { notifications++; return notify(value); };
  const usage = process.cpuUsage(), started = performance.now();
  await controller.search(current);
  const elapsed = performance.now() - started, cpu = process.cpuUsage(usage);
  assert.equal(current.results.length, count);
  assert.equal(current.searching, false);
  assert.equal(controller.findTree.sessions.get(current.id).tree.byResultId.size, count);
  // Scheduled intermediate work must not notify again after completion.
  const atCompletion = notifications;
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(notifications, atCompletion);
  controller.findTree.dispose();
  return { wallMs: elapsed, cpuMs: (cpu.user + cpu.system) / 1000, notifications };
}

(async () => {
  const samples = { streaming: [], findApproval: [], replaceApproval: [], planComparison: [] };
  const completed = { ...session(), searching: false, results };
  const replace = { ...completed, mode: 'replace', replacement: 'new' };
  const model = modelFor(replace);
  const plans = model.replacementMeaning, reversedPlans = [...plans].reverse();
  for (let round = 0; round < 7; round++) {
    global.gc();
    const stream = await streamOnce();
    global.gc();
    const find = timed(() => approvalFor({ ...completed, replaceApproval: undefined }));
    global.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cloned = timed(() => approvalFor({ ...replace, replaceApproval: undefined }));
    assert.deepEqual(cloned.value.model, model);
    global.gc();
    cloned.heapMiB = (process.memoryUsage().heapUsed - heapBefore) / 1048576;
    cloned.value = null;
    global.gc();
    const compared = timed(() => samePlans(plans, reversedPlans));
    assert.equal(compared.value, true);
    if (round >= 2) {
      samples.streaming.push(stream);
      samples.findApproval.push(find);
      samples.replaceApproval.push(cloned);
      samples.planComparison.push(compared);
    }
  }
  const report = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summarize(values)]));
  report.streaming.notifications = samples.streaming.map(value => value.notifications);
  report.findApproval.createsApproval = samples.findApproval.some(value => Boolean(value.value));
  report.replaceApproval.medianRetainedHeapMiB = median(samples.replaceApproval.map(value => value.heapMiB));
  console.log(JSON.stringify({ node: process.version, platform: `${process.platform}/${process.arch}`,
    cpu: os.cpus()[0]?.model, sourceRoot: root,
    fixture: `${count} synthetic rows, 100 files, shared 200-character preview and per-file baseline`,
    methodology: '2 warmups + 5 measured; GC outside timings; rapid 80-row batches with setImmediate',
    limitations: 'Fake engine, VS Code and TreeView; no filesystem, worker, native rendering, Remote or whole-editor RSS. Heap delta excludes fixture.',
    report }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
