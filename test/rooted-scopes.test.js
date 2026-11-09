'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const test = require('node:test');
const { SearchController } = require('../src/controller');
const { SearchEngine } = require('../src/search');
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
  const edits = [];
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
        const text = await fs.readFile(uri.fsPath, 'utf8');
        return { uri, fileName: uri.fsPath, version: 1, eol: 1, isDirty: false, getText: () => text };
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
  return { uri: uriFor(file), fileName: file, isDirty: true, isClosed: false,
    version: 4, languageId: 'javascript', getText: () => text };
}

function resultNames(output) {
  return [...new Set(output.results.map(result => `${result.rootName}/${result.relativePath}`))].sort();
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
    await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation }), /Rerun Search/);
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
  const replacing = f.controller.replace(f.session, true, { generation: f.session.generation });
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
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation }), /Rerun Search/);
  f.controller.resetSearch(f.session);
  await f.controller.search(f.session);
  assert.ok(f.session.results.length);
  assert.ok(f.session.results.every(result => result.rootName === 'Web'));
  f.controller.queueValidation = () => {};
  await f.controller.replace(f.session, true, { generation: f.session.generation });
  assert.equal(f.edits.length, 1);
  assert.ok(f.edits[0].every(entry => entry.uri.fsPath.startsWith(`${f.web}${path.sep}`)));
});

test('rooted replacement retains partial, pending, invalid and changed-document safeguards', async t => {
  const f = await fixture(t);
  await f.controller.search(f.session);
  assert.ok(f.session.results.length);
  f.session.partial = true;
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation }), /complete results/);
  f.session.partial = false;
  f.session.results[0].pending = true;
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation }), /INVALID|checked/);
  f.session.results[0].pending = false;
  f.session.results[0].invalid = true;
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation }), /INVALID|checked/);
  f.session.results[0].invalid = false;
  await fs.writeFile(f.session.results[0].fsPath, 'changed since searching');
  await assert.rejects(() => f.controller.replace(f.session, true, { generation: f.session.generation }), /changed/);
  assert.equal(f.edits.length, 0);
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
    const document = { uri: parsed, fileName: parsed.fsPath, version: 1, eol: 1, isDirty: false,
      text: original, getText() { return this.text; } };
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
  await f.controller.replace(f.session, true, { generation: f.session.generation });
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
