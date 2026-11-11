'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const test = require('node:test');
const { SearchController } = require('../src/controller');
const { SearchEngine } = require('../src/search');
const { trackDocumentChanges } = require('../src/find-results');
const { approvalFor } = require('../src/replace-approval');
const { knownProvenance } = require('../src/replace-preflight');
const { textDocument } = require('./text-document');
const { zipFixture } = require('./zip-fixture');

function uriFor(file) {
  const value = file.startsWith('file:') ? file : pathToFileURL(file).toString();
  return { scheme: 'file', fsPath: fileURLToPath(value), toString: () => value };
}

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-rooted-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const api = path.join(base, 'api');
  const web = path.join(base, 'web');
  const files = {
    'api/.gitignore': 'src/ignored.js\n',
    'api/src/main.js': 'needle api',
    'api/src/note.ts': 'needle typescript',
    'api/test/outside.js': 'needle outside included path',
    'api/src/dirty.js': 'old content',
    'api/src/ignored.js': 'needle ignored',
    'api/src/vendor/hidden.js': 'needle vendor',
    'api/src/nested/child.js': 'needle child',
    'api/src/nested/generated/hidden.js': 'needle nested generated',
    'web/src/main.js': 'needle web',
    'web/src/dirty.js': 'old content'
  };
  for (const [name, text] of Object.entries(files)) {
    const filename = path.join(base, name);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, text);
  }
  const roots = [
    { name: 'Web', uri: uriFor(web) },
    { name: 'API Alias', uri: uriFor(api) }
  ];
  const settings = { scopes: [{
    name: 'API sources', root: 'API Alias',
    include: ['src/**'], exclude: ['**/vendor/**', '**/generated/**']
  }] };
  const searchSettings = new Map();
  const edits = [], documents = new Map();
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  const controller = Object.create(SearchController.prototype);
  const config = { get: (key, fallback) => settings[key] ?? fallback };
  class Range {
    constructor(sl, sc, el, ec) {
      this.start = { line: sl, character: sc };
      this.end = { line: el, character: ec };
    }
  }
  class WorkspaceEdit {
    constructor() { this.entries = []; }
    replace(uri, range, replacement) { this.entries.push({ uri, range, replacement }); }
  }
  controller.v = {
    Uri: { parse: uriFor }, Range, WorkspaceEdit, EndOfLine: { CRLF: 2 },
    TabInputText: class TabInputText {},
    window: { tabGroups: { all: [] } },
    workspace: {
      workspaceFolders: roots,
      textDocuments: [],
      getConfiguration(section, uri) {
        return { get(key, fallback) {
          return searchSettings.get(`${section}:${uri.fsPath}:${key}`) ?? fallback;
        } };
      },
      async openTextDocument(uri) {
        if (!documents.has(uri.toString())) documents.set(uri.toString(),
          textDocument(uri, await fs.readFile(uri.fsPath, 'utf8')));
        return documents.get(uri.toString());
      },
      async applyEdit(edit) { edits.push(edit.entries); return true; }
    }
  };
  Object.assign(controller, {
    engine, sessions: new Map(), disposed: false,
    configuration: () => config,
    notify() {},
    selectAutomatic() {},
    updateNativePreview() {}
  });
  const session = {
    id: 'rooted', mode: 'replace', layout: 'findWindow', query: 'needle', replacement: 'replacement',
    options: { respectExcludes: true, maskEnabled: false, mask: '', include: '', exclude: '' },
    scope: { kind: 'custom', name: 'API sources' }, results: [], generation: 1,
    searching: true, panels: new Set(), previewRevision: 0, validations: new Map()
  };
  controller.sessions.set(session.id, session);
  return { api, web, base, roots, settings, searchSettings, edits, engine, controller, session };
}

function dirty(file, text) {
  return textDocument(uriFor(file), text, { isDirty: true, version: 4, languageId: 'javascript' });
}

function resultNames(output) {
  return [...new Set(output.results.map(result => `${result.rootName}/${result.relativePath}`))].sort();
}

async function revalidatedDiskFixture(t) {
  const f = await fixture(t);
  await f.controller.search(f.session);
  const row = f.session.results.find(result => result.source === 'disk');
  assert.ok(row);
  f.session.results = [row];
  const uri = uriFor(row.uri), text = await fs.readFile(uri.fsPath, 'utf8');
  const document = { uri, fileName: uri.fsPath, text, version: 1, eol: 1,
    isDirty: false, isClosed: false, getText() { return this.text; },
    positionAt(offset) { const lines = this.text.slice(0, offset).split('\n');
      return { line: lines.length - 1, character: lines.at(-1).length }; },
    offsetAt(position) { const lines = this.text.split('\n');
      return lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character; }
  };
  f.controller.v.workspace.openTextDocument = async () => document;
  const validate = async () => {
    f.controller.queueValidation(f.session, row.uri, 0);
    const entry = f.session.validations.get(row.uri);
    clearTimeout(entry.timer);
    await f.controller.validateDocument(f.session, row.uri, entry);
  };
  await validate();
  return { f, document, row, validate };
}

function replaceOne(f) {
  const row = f.session.results[0];
  return f.controller.replace(f.session, false, { id: row.id, generation: f.session.generation,
    actionBinding: approvalFor(f.session).binding, resultRevision: row.resultRevision ?? 0 });
}

test('scope contribution accepts an optional root and the README example is valid JSON', async () => {
  const manifest = require('../package.json');
  const scope = manifest.contributes.configuration.properties['jbsearch.scopes'].items;
  assert.equal(scope.properties.root.type, 'string');
  assert.equal(scope.properties.root.minLength, 1);
  assert.equal(scope.required.includes('root'), false);
  assert.equal(scope.additionalProperties, false);
  const readme = await fs.readFile(path.join(__dirname, '../README.md'), 'utf8');
  const example = readme.match(/## Configuration[\s\S]*?```json\n([\s\S]*?)\n```/);
  assert.ok(example);
  assert.equal(JSON.parse(example[1])['jbsearch.scopes'][1].root, 'api');
});

test('named scope resolves the exact workspace alias without altering session identity', async t => {
  const f = await fixture(t);
  const request = await f.controller.request(f.session);
  assert.deepEqual(f.session.scope, { kind: 'custom', name: 'API sources' });
  assert.equal(request.scope.kind, 'folder');
  assert.equal(request.scope.rootPath, f.api);
  assert.deepEqual(request.scope.include, ['src/**']);
  assert.deepEqual(request.scope.exclude, ['**/vendor/**', '**/generated/**']);
  assert.deepEqual(request.namedScopeBinding, {
    scopeName: 'API sources', rootName: 'API Alias', uri: uriFor(f.api).toString()
  });
  assert.equal(request.roots.length, 2);
  delete f.settings.scopes[0].root;
  const legacy = await f.controller.request(f.session);
  assert.equal(legacy.scope.kind, 'custom');
  assert.equal(legacy.namedScopeBinding, undefined);
  assert.equal(legacy.roots.length, 2);
});

test('invalid, missing, or ambiguous roots report an error before starting the worker', async t => {
  const f = await fixture(t);
  let calls = 0;
  f.controller.engine = { search: async () => { calls++; assert.fail('worker must not run'); } };
  for (const root of ['', '   ', null, undefined, 0, [], {}, 'api alias', 'missing']) {
    f.settings.scopes[0].root = root;
    f.session.searching = true;
    await f.controller.search(f.session);
    assert.match(f.session.error, /workspace folder|root/i, String(root));
    assert.deepEqual(f.session.results, []);
    assert.equal(calls, 0);
  }
  f.settings.scopes[0].root = 'API Alias';
  f.roots[0].name = 'API Alias';
  await f.controller.search(f.session);
  assert.match(f.session.error, /ambiguous/i);
  assert.equal(calls, 0);
  f.roots[0].name = ' API Alias ';
  f.settings.scopes[0].root = ' API Alias ';
  assert.equal((await f.controller.request(f.session)).scope.rootPath, f.web,
    'nonempty names are matched exactly, without trimming');
});

test('real worker limits rooted searches and preserves includes, excludes, ignores, masks, dirty files and symlink boundary', async t => {
  const f = await fixture(t);
  // Creating symlinks on Windows can require a separate OS privilege.
  if (process.platform !== 'win32')
    await fs.symlink(path.join(f.web, 'src'), path.join(f.api, 'src/link'), 'dir');
  f.controller.v.workspace.textDocuments = [
    dirty(path.join(f.api, 'src/dirty.js'), 'needle dirty needle'),
    dirty(path.join(f.web, 'src/dirty.js'), 'needle wrong root')
  ];
  f.session.options.maskEnabled = true;
  f.session.options.mask = '*.js';
  f.session.options.include = 'src/**';
  f.session.options.respectExcludes = false;
  const rooted = await f.engine.search(await f.controller.request(f.session));
  assert.ok(rooted.results.every(knownProvenance), 'worker provides metadata for both disk and dirty matches');
  assert.deepEqual(resultNames(rooted), [
    'API Alias/src/dirty.js', 'API Alias/src/ignored.js',
    'API Alias/src/main.js', 'API Alias/src/nested/child.js'
  ]);
  assert.equal(rooted.results.filter(result => result.relativePath === 'src/dirty.js').length, 2);
  assert.ok(rooted.results.filter(result => result.relativePath === 'src/dirty.js')
    .every(result => result.source === 'snapshot'));
  assert.ok(rooted.results.every(result => result.rootName === 'API Alias'));
  f.session.options.respectExcludes = true;
  const respecting = await f.engine.search(await f.controller.request(f.session));
  assert.ok(!resultNames(respecting).includes('API Alias/src/ignored.js'));
  assert.ok(!resultNames(respecting).some(name => name.includes('vendor') || name.includes('generated')));
  delete f.settings.scopes[0].root;
  const legacy = await f.engine.search(await f.controller.request(f.session));
  assert.ok(resultNames(legacy).includes('Web/src/main.js'));
  assert.ok(resultNames(legacy).includes('Web/src/dirty.js'));
  assert.ok(resultNames(legacy).includes('API Alias/src/main.js'));
});

test('real worker supplies replacement metadata in each supported filesystem scope', async t => {
  const f = await fixture(t);
  const document = dirty(path.join(f.api, 'src/dirty.js'), 'needle from buffer');
  f.controller.v.workspace.textDocuments = [document];
  const input = new f.controller.v.TabInputText();
  input.uri = document.uri;
  f.controller.v.window.tabGroups.all = [{ tabs: [{ input }] }];
  f.controller.v.workspace.openTextDocument = async () => document;
  for (const scope of [
    { kind: 'workspace' },
    { kind: 'folder', rootPath: f.api },
    { kind: 'directory', directory: path.join(f.api, 'src') },
    { kind: 'custom', name: 'API sources' },
    { kind: 'openEditors' }
  ]) {
    f.session.scope = scope;
    const result = await f.engine.search(await f.controller.request(f.session));
    assert.equal(result.truncated, false, scope.kind);
    assert.ok(result.results.length, scope.kind);
    assert.ok(result.results.every(knownProvenance), scope.kind);
    assert.ok(result.results.some(match => match.source === 'snapshot' &&
      match.documentVersion === document.version), scope.kind);
  }
});

test('rooted parent and child use the existing Folder policy in either root order', async t => {
  const f = await fixture(t);
  const nested = path.join(f.api, 'src/nested');
  const child = { name: 'Nested alias', uri: uriFor(nested) };
  f.searchSettings.set(`search:${nested}:exclude`, { '**/*.js': true });
  f.controller.v.workspace.textDocuments = [dirty(path.join(nested, 'child.js'), 'needle dirty nested')];
  for (const ordered of [[...f.roots, child], [child, ...f.roots]]) {
    f.controller.v.workspace.workspaceFolders = ordered;
    for (const [name, rootPath, include] of [
      ['API Alias', f.api, ['src/**']], ['Nested alias', nested, ['**/*.js']]
    ]) {
      f.settings.scopes[0].root = name;
      f.settings.scopes[0].include = include;
      f.session.options.respectExcludes = true;
      const namedRequest = await f.controller.request(f.session);
      const named = await f.engine.search(namedRequest);
      const folderRequest = {
        ...namedRequest, scope: { kind: 'folder', rootPath,
          include: namedRequest.scope.include, exclude: namedRequest.scope.exclude }
      };
      const folder = await f.engine.search(folderRequest);
      assert.deepEqual(resultNames(named), resultNames(folder));
      if (name === 'API Alias') {
        assert.ok(resultNames(named).includes('API Alias/src/nested/child.js'));
        assert.ok(named.results.some(result => result.source === 'snapshot' && result.relativePath === 'src/nested/child.js'));
      } else {
        assert.deepEqual(resultNames(named), [], 'the child folder exclusion is respected');
        f.session.options.respectExcludes = false;
        const childUnignored = await f.engine.search(await f.controller.request(f.session));
        assert.deepEqual(resultNames(childUnignored), ['Nested alias/child.js']);
      }
    }
  }
});

test('replacement blocks stale rooted snapshots before opening documents', async t => {
  const f = await fixture(t);
  await f.controller.search(f.session);
  assert.ok(f.session.results.length);
  const originalRoots = [...f.roots];
  const originalNames = f.roots.map(root => root.name);
  const originalUris = f.roots.map(root => root.uri);
  let opens = 0;
  f.controller.v.workspace.openTextDocument = async () => { opens++; assert.fail('stale snapshot must not open documents'); };
  const mutations = [
    () => { f.settings.scopes[0].root = 'missing'; },
    () => { f.settings.scopes[0].root = 'Web'; },
    () => { delete f.settings.scopes[0].root; },
    () => { f.settings.scopes[0].root = null; },
    () => { f.roots[1].name = 'Renamed'; },
    () => { f.roots[0].name = 'API Alias'; },
    () => { f.roots[1].uri = uriFor(f.web); },
    () => { f.controller.v.workspace.workspaceFolders = [f.roots[0]]; },
    () => { f.roots[1].name = 'Renamed'; f.settings.scopes[0].root = 'Renamed'; }
  ];
  for (const mutate of mutations) {
    f.settings.scopes[0].root = 'API Alias';
    originalRoots.forEach((root, index) => { root.name = originalNames[index]; root.uri = originalUris[index]; });
    f.controller.v.workspace.workspaceFolders = originalRoots;
    mutate();
    await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /Rerun Search/);
    assert.equal(opens, 0);
    assert.equal(f.edits.length, 0);
  }
});

test('replacement rechecks the root after asynchronous document validation', async t => {
  const f = await fixture(t);
  await f.controller.search(f.session);
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const open = f.controller.v.workspace.openTextDocument;
  f.controller.v.workspace.openTextDocument = async uri => {
    entered();
    await gate;
    return open(uri);
  };
  const replacing = f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding });
  await started;
  f.settings.scopes[0].root = 'Web';
  release();
  await assert.rejects(replacing, /Rerun Search/);
  assert.equal(f.edits.length, 0);
  assert.equal(f.session.replacing, false);
});

test('adding a root to an existing all-roots snapshot requires a fresh search before replacement', async t => {
  const f = await fixture(t);
  delete f.settings.scopes[0].root;
  await f.controller.search(f.session);
  assert.ok(f.session.results.some(result => result.rootName === 'Web'));
  assert.ok(f.session.results.some(result => result.rootName === 'API Alias'));
  f.settings.scopes[0].root = 'Web';
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /Rerun Search/);
  f.controller.resetSearch(f.session);
  await f.controller.search(f.session);
  assert.ok(f.session.results.length);
  assert.ok(f.session.results.every(result => result.rootName === 'Web'));
  f.controller.queueValidation = () => {};
  await f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding });
  assert.equal(f.edits.length, 1);
  assert.ok(f.edits[0].every(entry => entry.uri.fsPath.startsWith(`${f.web}${path.sep}`)));
});

test('rooted replacement retains partial, pending, invalid and changed-document safeguards', async t => {
  const f = await fixture(t);
  await f.controller.search(f.session);
  assert.ok(f.session.results.length);
  f.session.partial = true;
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /complete results/);
  f.session.partial = false;
  f.session.results[0].pending = true;
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /INVALID|checked/);
  f.session.results[0].pending = false;
  f.session.results[0].invalid = true;
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /INVALID|checked/);
  f.session.results[0].invalid = false;
  await fs.writeFile(f.session.results[0].fsPath, 'changed since searching');
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /changed/);
  assert.equal(f.edits.length, 0);
});

test('a new matching file requires rerun and never replaces an unseen occurrence', async t => {
  const f = await fixture(t);
  await f.controller.search(f.session);
  const shown = f.session.results;
  const ids = shown.map(result => result.id);
  await fs.writeFile(path.join(f.api, 'src/new.js'), 'needle new file');
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /results changed.*Rerun Search/);
  assert.equal(f.edits.length, 0);
  assert.equal(f.session.results, shown);
  assert.deepEqual(f.session.results.map(result => result.id), ids);
});

test('Replace All rejects a preflight whose second root enumerator is killed',
  { skip: process.platform === 'win32' }, async t => {
    const f = await fixture(t);
    const first = path.join(f.base, 'first'), second = path.join(f.base, 'second');
    await fs.mkdir(first);
    await fs.mkdir(second);
    await fs.writeFile(path.join(first, 'one.txt'), 'needle');
    f.controller.v.workspace.workspaceFolders = [
      { name: 'first', uri: uriFor(first) }, { name: 'second', uri: uriFor(second) }
    ];
    f.session.scope = { kind: 'workspace' };
    await f.controller.search(f.session);
    assert.equal(f.session.results.length, 1);
    const shown = f.session.results;
    await fs.writeFile(path.join(second, 'new.txt'), 'needle');
    const enumerator = path.join(f.base, 'fake-rg');
    await fs.writeFile(enumerator, `#!${process.execPath}\n` +
      `if (process.cwd() === ${JSON.stringify(first)}) process.stdout.write('one.txt\\0');\n` +
      `else process.kill(process.pid, 'SIGTERM');\n`, { mode: 0o755 });
    const failedEngine = new SearchEngine({ rgPath: enumerator });
    t.after(() => failedEngine.dispose());
    f.controller.engine = failedEngine;
    const check = await failedEngine.search(await f.controller.request(f.session));
    assert.equal(check.results.length, 1, 'the first root was scanned before the failure');
    assert.equal(check.truncated, true);
    assert.equal(check.stats.cancelled, false);
    assert.equal(check.stats.timedOut, false);
    assert.equal(check.stats.blockingSkippedFiles, 1);
    assert.equal(check.stats.skippedDetails[0].kind, 'enumeration');
    assert.equal(check.stats.skippedDetails[0].path, second);
    assert.match(check.stats.errors[0].message, /SIGTERM/);
    await assert.rejects(() => f.controller.replace(f.session, true,
      { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /incomplete.*Rerun Search/);
    assert.equal(f.edits.length, 0);
    assert.equal(f.session.results, shown);
  });

test('a changed unmatched dirty buffer is detected even if no event is delivered', async t => {
  const f = await fixture(t);
  const file = path.join(f.api, 'src/dirty.js');
  const buffer = textDocument(uriFor(file), 'no occurrences', { isDirty: true, version: 4, languageId: 'javascript' });
  f.controller.v.workspace.textDocuments = [buffer];
  await f.controller.search(f.session);
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const open = f.controller.v.workspace.openTextDocument;
  f.controller.v.workspace.openTextDocument = async uri => { entered(); await gate; return open(uri); };
  const replacing = f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding });
  await started;
  buffer.text = 'still no occurrences';
  buffer.version++;
  release();
  await assert.rejects(replacing, /open documents changed.*Rerun Search/);
  assert.equal(f.edits.length, 0);
});

test('named scope filter changes require rerun even when the root binding is unchanged', async t => {
  const f = await fixture(t);
  await f.controller.search(f.session);
  const shown = f.session.results;
  f.settings.scopes[0].exclude = [...f.settings.scopes[0].exclude, '**/unused/**'];
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding }), /scope or filters changed.*Rerun Search/);
  assert.equal(f.edits.length, 0);
  assert.equal(f.session.results, shown);
});

test('binary files do not block one unsaved workspace replacement and remain untouched', async t => {
  const f = await fixture(t);
  const archivePath = path.join(f.api, 'src/template.docx');
  const archive = zipFixture('needle inside a Word-like container');
  await fs.writeFile(archivePath, archive);
  const binaryPath = path.join(f.api, 'src/data.bin');
  const pdfPath = path.join(f.api, 'src/report.pdf');
  const binary = Buffer.from('needle\0binary');
  const pdf = Buffer.from('%PDF-1.7\nneedle\n%%EOF');
  await fs.writeFile(binaryPath, binary);
  await fs.writeFile(pdfPath, pdf);
  await f.controller.search(f.session);
  assert.equal(f.session.partial, false);
  assert.match(f.session.diagnostics, /template\.docx — ZIP container excluded/);
  assert.ok(f.session.results.length);
  assert.ok(f.session.results.every(item => ![archivePath, binaryPath, pdfPath].includes(item.fsPath)));

  const documents = new Map();
  for (const uri of new Set(f.session.results.map(result => result.uri))) {
    const parsed = uriFor(uri), original = await fs.readFile(parsed.fsPath, 'utf8');
    const document = textDocument(parsed, original);
    documents.set(uri, { document, original });
  }
  f.controller.v.workspace.openTextDocument = async uri => documents.get(uri.toString()).document;
  let editsApplied = 0;
  f.controller.v.workspace.applyEdit = async edit => {
    editsApplied++;
    for (const entry of edit.entries) {
      const document = documents.get(entry.uri.toString()).document;
      assert.equal(entry.range.start.line, 0);
      document.text = document.text.slice(0, entry.range.start.character) + entry.replacement +
        document.text.slice(entry.range.end.character);
      document.isDirty = true;
    }
    return true;
  };
  f.controller.queueValidation = () => {};
  await f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session)?.binding });
  assert.equal(editsApplied, 1, 'all replacements are submitted as one workspace edit');
  for (const { document, original } of documents.values()) {
    assert.equal(document.text, original.replace('needle', 'replacement'));
    assert.equal(document.isDirty, true);
    assert.equal(await fs.readFile(document.fileName, 'utf8'), original, 'disk content is not autosaved');
  }
  assert.deepEqual(await fs.readFile(archivePath), archive);
  assert.deepEqual(await fs.readFile(binaryPath), binary);
  assert.deepEqual(await fs.readFile(pdfPath), pdf);
});

test('disk-origin baseline survives revalidation and catches delayed external disk changes', async t => {
  const { f, document, row } = await revalidatedDiskFixture(t);
  const current = f.session.results[0];
  assert.equal(current.source, 'snapshot');
  assert.equal(current.diskBaseline.origin, 'disk');
  assert.equal(current.documentVersion, document.version);
  await fs.writeFile(row.fsPath, `${document.text} external change`);
  await assert.rejects(() => replaceOne(f), /changed on disk/);
  assert.equal(f.edits.length, 0);
});


test('disk-origin revalidation allows a known dirty buffer while the disk baseline is intact', async t => {
  const { f, document, validate } = await revalidatedDiskFixture(t);
  document.text = `prefix ${document.text}`;
  document.version++;
  document.isDirty = true;
  f.session.results = trackDocumentChanges(f.session.results, { document, contentChanges: [
    { rangeOffset: 0, rangeLength: 0, text: 'prefix ' }
  ] });
  await validate();
  const current = f.session.results[0];
  assert.equal(current.source, 'snapshot');
  assert.equal(current.trackedDocumentVersion, document.version);
  assert.ok(!current.invalid && !current.identityUnknown);
  f.controller.queueValidation = () => {};
  await replaceOne(f);
  assert.equal(f.edits.length, 1);
});


test('disk-origin Undo/Redo remains replaceable while its original disk baseline is intact', async t => {
  const { f, document, validate } = await revalidatedDiskFixture(t);
  const apply = async (change, reason) => {
    document.text = document.text.slice(0, change.rangeOffset) + change.text +
      document.text.slice(change.rangeOffset + change.rangeLength);
    document.version++;
    document.isDirty = true;
    f.session.results = trackDocumentChanges(f.session.results, { document, contentChanges: [change], reason });
    await validate();
  };
  await apply({ rangeOffset: 0, rangeLength: 0, text: 'prefix ' });
  await apply({ rangeOffset: 0, rangeLength: 7, text: '' }, 1);
  await apply({ rangeOffset: 0, rangeLength: 0, text: 'prefix ' }, 2);
  assert.ok(!f.session.results[0].invalid && !f.session.results[0].identityUnknown);
  f.controller.queueValidation = () => {};
  await replaceOne(f);
  assert.equal(f.edits.length, 1);
});


test('a changed disk baseline after an unobserved Save fails closed', async t => {
  const { f, document, row, validate } = await revalidatedDiskFixture(t);
  document.text = `prefix ${document.text}`;
  document.version++;
  document.isDirty = true;
  f.session.results = trackDocumentChanges(f.session.results, { document, contentChanges: [
    { rangeOffset: 0, rangeLength: 0, text: 'prefix ' }
  ] });
  await validate();
  await fs.writeFile(row.fsPath, document.text);
  document.isDirty = false;
  await assert.rejects(() => replaceOne(f), /changed on disk/);
  assert.equal(f.edits.length, 0);
});


test('a locally observed clean Save lazily rebases the independent disk baseline before replacing', async t => {
  const { f, document, row, validate } = await revalidatedDiskFixture(t);
  document.encoding = 'utf8';
  document.text = `prefix ${document.text}`;
  document.version++;
  document.isDirty = true;
  f.session.results = trackDocumentChanges(f.session.results, { document, contentChanges: [
    { rangeOffset: 0, rangeLength: 0, text: 'prefix ' }
  ] });
  await validate();
  const baseline = f.session.results[0].diskBaseline;
  await fs.writeFile(`${row.fsPath}.new`, document.text);
  await fs.rename(`${row.fsPath}.new`, row.fsPath);
  document.isDirty = false;
  f.controller.documentLifecycleChanged(document, 'save');
  await validate();
  assert.deepEqual(f.session.results[0].diskBaseline, baseline, 'Save does not eagerly read or rebase');
  f.controller.queueValidation = () => {};
  await replaceOne(f);
  assert.equal(f.edits.length, 1);
  assert.equal(f.session.results[0].diskBaseline.byteHash, baseline.byteHash, 'the approved source baseline remains immutable; a verified rebase is operation-local');
  assert.equal(f.session.results[0].documentVersion, document.version);
});


test('initial dirty production snapshots replace against an independent disk baseline without equating texts', async t => {
  const f = await fixture(t);
  const file = path.join(f.api, 'src/dirty.js');
  const document = dirty(file, 'unsaved needle');
  f.controller.v.workspace.textDocuments = [document];
  f.controller.v.workspace.openTextDocument = async () => document;
  await f.controller.search(f.session);
  f.session.results = f.session.results.filter(row => row.uri === document.uri.toString());
  assert.equal(f.session.results.length, 1);
  assert.ok(f.session.results[0].diskBaseline);
  f.controller.queueValidation = () => {};
  await replaceOne(f);
  assert.equal(f.edits.length, 1);
  assert.equal(await fs.readFile(file, 'utf8'), 'old content');
});


test('Open Editors request never reads a clean cached buffer or materializes an oversized dirty buffer', async t => {
  const f = await fixture(t);
  f.session.scope = { kind: 'openEditors' };
  const cleanUri = uriFor(path.join(f.api, 'src/main.js'));
  const hugeUri = uriFor(path.join(f.api, 'src/dirty.js'));
  f.controller.v.TabInputText = class { constructor(uri) { this.uri = uri; } };
  f.controller.v.window.tabGroups.all = [{ tabs: [cleanUri, hugeUri].map(uri => ({ input: new f.controller.v.TabInputText(uri) })) }];
  const clean = { uri: cleanUri, fileName: cleanUri.fsPath, version: 1, isDirty: false,
    encoding: 'utf8', getText() { assert.fail('clean cached text is not disk authority'); } };
  const huge = { uri: hugeUri, fileName: hugeUri.fsPath, version: 1, isDirty: true,
    positionAt: () => ({ line: 0, character: 1000000000 }), offsetAt: position => position.character,
    getText() { assert.fail('huge dirty text must not be materialized'); } };
  f.controller.v.workspace.openTextDocument = async uri => uri.toString() === cleanUri.toString() ? clean : huge;
  const request = await f.controller.request(f.session);
  assert.equal(request.documents[0].text, undefined);
  assert.match(request.documents[1].snapshotUnavailable, /size limit/);
  const output = await f.engine.search(request);
  assert.equal(output.truncated, true);
  assert.ok(output.results.some(row => row.uri === cleanUri.toString()));
});


test('a disk change while another file opens is caught by the final baseline check', async t => {
  const f = await fixture(t);
  await f.controller.search(f.session);
  const first = f.session.results[0];
  const second = f.session.results.find(result => result.uri !== first.uri);
  assert.ok(second);
  const open = f.controller.v.workspace.openTextDocument;
  const documents = new Map();
  for (const row of f.session.results) documents.set(row.uri, await open(uriFor(row.uri)));
  let calls = 0;
  f.controller.v.workspace.openTextDocument = async uri => {
    if (++calls === 2) await fs.writeFile(first.fsPath, 'external change after first check');
    return documents.get(uri.toString());
  };
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation, actionBinding: approvalFor(f.session).binding }), /changed on disk/);
  assert.equal(f.edits.length, 0);
});


test('a document version change during disk verification cannot reach applyEdit', async t => {
  const { f, document } = await revalidatedDiskFixture(t);
  const originalOpen = fs.open;
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  fs.open = async (...args) => { enter(); await gate; return originalOpen(...args); };
  t.after(() => { fs.open = originalOpen; release(); });
  const pending = replaceOne(f);
  await entered;
  document.version++;
  release();
  await assert.rejects(pending, /changed.*(?:before replacement|baseline was checked)/);
  assert.equal(f.edits.length, 0);
});


test('a stalled lstat times out, unlocks replacement and cannot apply late', async t => {
  const { f } = await revalidatedDiskFixture(t);
  const configuration = f.controller.configuration;
  f.controller.configuration = () => ({ get: (key, fallback) => key === 'replace.prepareTimeoutMs'
    ? 100 : configuration().get(key, fallback) });
  const original = fs.lstat;
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  fs.lstat = (...args) => { enter(); return gate.then(() => original(...args)); };
  t.after(() => { fs.lstat = original; release(); });
  const pending = replaceOne(f);
  await entered;
  await assert.rejects(pending, /timed out.*No edit was submitted/);
  assert.equal(f.session.replacing, false);
  assert.equal(f.edits.length, 0);
  fs.lstat = original;
  release();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.edits.length, 0);
});


test('a late disk open after cancellation closes its descriptor and never applies', async t => {
  const { f } = await revalidatedDiskFixture(t);
  const original = fs.open;
  let enter, release, closed;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const cleanup = new Promise(resolve => { closed = resolve; });
  fs.open = async (...args) => {
    enter();
    await gate;
    const handle = await original(...args), close = handle.close.bind(handle);
    handle.close = async () => { try { return await close(); } finally { closed(); } };
    return handle;
  };
  t.after(() => { fs.open = original; release(); });
  const pending = replaceOne(f);
  await entered;
  f.session.replacementAbort.abort(new Error('Replacement preparation was cancelled.'));
  await assert.rejects(pending, /cancelled|stopped/);
  assert.equal(f.session.replacing, false);
  assert.equal(f.edits.length, 0);
  fs.open = original;
  release();
  await cleanup;
  assert.equal(f.edits.length, 0);
});


test('disposing during a disk read aborts preparation and cleans up after the read returns', async t => {
  const { f } = await revalidatedDiskFixture(t);
  const original = fs.open;
  let enter, release, closed;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const cleanup = new Promise(resolve => { closed = resolve; });
  fs.open = async (...args) => {
    const handle = await original(...args), read = handle.read.bind(handle), close = handle.close.bind(handle);
    handle.read = async (...readArgs) => { enter(); await gate; return read(...readArgs); };
    handle.close = async () => { try { return await close(); } finally { closed(); } };
    return handle;
  };
  t.after(() => { fs.open = original; release(); });
  f.controller.preview = { dispose() {} };
  f.controller.findTree = { dispose() {} };
  const pending = replaceOne(f);
  await entered;
  f.controller.dispose();
  await assert.rejects(pending, /cancelled|stopped/);
  assert.equal(f.session.replacing, false);
  assert.equal(f.edits.length, 0);
  fs.open = original;
  release();
  await cleanup;
  assert.equal(f.edits.length, 0);
});
