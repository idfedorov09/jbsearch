'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { ClientPreviewBridge, RESOURCE_COMMAND, deadline } = require('../src/client-preview');
const { PreviewProvider } = require('../src/preview');
function fixture(resources) {
  const commands = new Map([[RESOURCE_COMMAND, async () => resources]]);
  const calls = [];
  const v = {
    env: { remoteName: 'ssh-remote' },
    commands: {
      async getCommands() { return [...commands.keys()]; },
      async executeCommand(id, ...args) { calls.push([id, ...args]); if (!commands.has(id)) throw Error('command not found'); return commands.get(id)(...args); },
      registerCommand(id, callback) { commands.set(id, callback); return { dispose() { commands.delete(id); } }; }
    },
    Uri: { joinPath(base, ...parts) { return { fsPath: path.join(base.fsPath, ...parts), toString() { return 'file://' + this.fsPath; } }; } }
  };
  return { v, commands, calls };
}
const snapshot = () => ({ protocol: 1, build: 'source', revision: 1, themeId: 'Client Only', foundTheme: true, settings: [{ scope: 'keyword', settings: { foreground: '#FF7B72' } }], customizations: {}, grammars: [] });
test('bridge uses commands across hosts without sending query, document text, or client paths', async () => {
  const f = fixture(snapshot());
  const bridge = new ClientPreviewBridge(f.v, { extensionUri: { fsPath: '/source' } });
  const value = await bridge.resources();
  assert.equal(value.themeId, 'Client Only');
  assert.equal(await bridge.resources(), value);
  assert.deepEqual(f.calls, [[RESOURCE_COMMAND, { protocol: 1 }]]);
  bridge.dispose();
  assert.equal(f.commands.has('jbsearch.previewResourcesChanged'), false);
});
test('client notifications discard in-flight theme snapshots and reload current colors', async () => {
  const f = fixture(snapshot());
  let release;
  f.commands.set(RESOURCE_COMMAND, () => new Promise(resolve => { release = resolve; }));
  let changed = 0;
  const bridge = new ClientPreviewBridge(f.v, {}, () => { changed++; });
  const pending = bridge.resources();
  await new Promise(resolve => setImmediate(resolve));
  f.commands.set(RESOURCE_COMMAND, async () => ({ ...snapshot(), themeId: 'New Theme' }));
  f.commands.get('jbsearch.previewResourcesChanged')({ protocol: 1, revision: 2 });
  release(snapshot());
  assert.equal((await pending).themeId, 'New Theme');
  assert.equal(changed, 1);
  bridge.dispose();
});
test('a stale failed resource request follows a newer successful notification', async () => {
  const f = fixture(snapshot());
  let rejectStale;
  f.commands.set(RESOURCE_COMMAND, () => new Promise((_, reject) => { rejectStale = reject; }));
  const bridge = new ClientPreviewBridge(f.v, {});
  const pending = bridge.resources();
  await new Promise(resolve => setImmediate(resolve));
  f.commands.set(RESOURCE_COMMAND, async () => ({ ...snapshot(), themeId: 'Current Theme' }));
  f.commands.get('jbsearch.previewResourcesChanged')({ protocol: 1, revision: 2 });
  rejectStale(new Error('Stale theme resource failed'));
  assert.equal((await pending).themeId, 'Current Theme');
  assert.equal(bridge.issue, '');
  bridge.dispose();
});
test('bridge activates a dormant client command even when the command list omits it', async () => {
  const f = fixture(snapshot());
  f.v.commands.getCommands = async () => [];
  const bridge = new ClientPreviewBridge(f.v, {});
  assert.equal((await bridge.resources()).foundTheme, true);
  assert.deepEqual(f.calls, [[RESOURCE_COMMAND, { protocol: 1 }]]);
  bridge.dispose();
});
test('missing client support installs its bundled VSIX once through VS Code', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-client-install-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'bundled'));
  await fs.writeFile(path.join(directory, 'bundled/client.json'), JSON.stringify({ build: 'test', protocol: 1 }));
  const f = fixture(snapshot());
  f.commands.delete(RESOURCE_COMMAND);
  f.commands.set('workbench.extensions.installExtension', async uri => {
    assert.equal(uri.fsPath, path.join(directory, 'bundled/jbsearch-client.vsix'));
    f.commands.set(RESOURCE_COMMAND, async () => snapshot());
  });
  const bridge = new ClientPreviewBridge(f.v, { extensionPath: directory, extensionUri: { fsPath: directory } });
  assert.equal((await bridge.resources()).foundTheme, true);
  bridge.invalidate();
  await bridge.resources();
  assert.equal(f.calls.filter(call => call[0] === 'workbench.extensions.installExtension').length, 1);
  bridge.dispose();
});
test('failed setup returns an actionable fallback and does not retry on every preview', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-client-denied-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'bundled'));
  await fs.writeFile(path.join(directory, 'bundled/client.json'), '{"build":"test"}');
  const f = fixture(snapshot());
  f.commands.delete(RESOURCE_COMMAND);
  let installs = 0;
  f.commands.set('workbench.extensions.installExtension', async () => { installs++; throw Error('installation disabled'); });
  const bridge = new ClientPreviewBridge(f.v, { extensionPath: directory, extensionUri: { fsPath: directory } });
  assert.equal(await bridge.resources(), undefined);
  assert.match(bridge.issue, /installation disabled/);
  bridge.invalidate();
  assert.equal(await bridge.resources(), undefined);
  assert.match(bridge.issue, /Set Up Client Preview/);
  assert.equal(installs, 1);
  bridge.dispose();
});
test('an installed update cannot silently reuse the previous client build', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-client-upgrade-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'bundled'));
  await fs.writeFile(path.join(directory, 'bundled/client.json'), '{"build":"current"}');
  const f = fixture({ ...snapshot(), build: 'previous' });
  f.commands.set('workbench.extensions.installExtension', async () => {});
  const bridge = new ClientPreviewBridge(f.v, { extensionPath: directory, extensionUri: { fsPath: directory } });
  t.after(() => bridge.dispose());
  assert.equal(await bridge.resources(), undefined);
  assert.match(bridge.issue, /Reload the window/);
  bridge.invalidate();
  assert.equal(await bridge.resources(), undefined);
  assert.match(bridge.issue, /Reload the window/);
  assert.equal(f.calls.filter(call => call[0] === 'workbench.extensions.installExtension').length, 1);
  await assert.rejects(bridge.setup(), /Reload the window/);
});
test('a dynamically loaded client upgrade is accepted without reinstall loops', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-client-updated-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'bundled'));
  await fs.writeFile(path.join(directory, 'bundled/client.json'), '{"build":"current"}');
  const f = fixture({ ...snapshot(), build: 'previous' });
  f.commands.set('workbench.extensions.installExtension', async () => {
    f.commands.set(RESOURCE_COMMAND, async () => ({ ...snapshot(), build: 'current' }));
  });
  const bridge = new ClientPreviewBridge(f.v, { extensionPath: directory, extensionUri: { fsPath: directory } });
  t.after(() => bridge.dispose());
  assert.equal((await bridge.resources()).build, 'current');
  bridge.invalidate();
  assert.equal((await bridge.resources()).build, 'current');
  assert.equal(f.calls.filter(call => call[0] === 'workbench.extensions.installExtension').length, 1);
});
test('disposing before package discovery completes prevents installation', async () => {
  const f = fixture(snapshot());
  const bridge = new ClientPreviewBridge(f.v, {});
  let release;
  bridge.bundled = () => new Promise(resolve => { release = resolve; });
  const setup = bridge.setup();
  bridge.dispose();
  release({ build: 'current', uri: {} });
  assert.equal(await setup, undefined);
  assert.equal(await bridge.resources(), undefined);
  assert.equal(await bridge.setup(), undefined);
  assert.equal(f.calls.length, 0);
});
test('preview tokenizes client-only grammar with client theme without reading client filesystem paths', async t => {
  const value = snapshot();
  value.grammars = [{ scopeName: 'source.remoteFixture', language: 'fixture', sourceName: '/client/only/grammar.json', content: JSON.stringify({ scopeName: 'source.remoteFixture', patterns: [{ name: 'keyword.control', match: '\\breturn\\b' }] }) }];
  const f = fixture(value);
  Object.assign(f.v, {
    extensions: { all: [] },
    workspace: {
      getConfiguration(section) { return { get(key, fallback) { return section === 'workbench' ? 'Different Server Theme' : fallback; } }; },
      asRelativePath() { return 'fixture.bl'; }
    }
  });
  const provider = new PreviewProvider(f.v, {});
  t.after(() => provider.dispose());
  const result = { id: 'one', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } };
  const output = await provider.render({ uri: { toString: () => 'file:///server/fixture.bl' }, fileName: '/server/fixture.bl', languageId: 'fixture', version: 1, getText: () => 'return 42;' }, result, [result]);
  assert.equal(output.note, '');
  assert.equal(output.lines[0].tokens[0].color, '#FF7B72');
  assert.deepEqual(output.lines[0].highlights, [{ start: 0, end: 6, selected: true }]);
  assert.deepEqual(f.calls[0], [RESOURCE_COMMAND, { protocol: 1 }]);
});
test('bridge timeouts settle without blocking search indefinitely', async () => {
  await assert.rejects(deadline(new Promise(() => {}), 5, 'timed out'), /timed out/);
  assert.equal(await deadline(Promise.resolve(42), 100, 'timed out'), 42);
});
