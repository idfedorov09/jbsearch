'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  test = require('node:test'),
  vm = require('node:vm');
const manifest = require('../package.json');
test('manifest exposes Find/Replace shortcuts and the custom editor', () => {
  assert.equal(manifest.main, './src/extension.js');
  assert.equal(manifest.engines.vscode, '^1.143.1');
  assert.equal(require('../package-lock.json').packages[''].engines.vscode, manifest.engines.vscode);
  assert.ok(fs.existsSync(path.join(__dirname, '..', manifest.main)));
  for (const [command, mac] of [
    ['jbsearch.findInFiles', 'cmd+shift+f'],
    ['jbsearch.replaceInFiles', 'cmd+shift+r']
  ]) {
    assert.ok(manifest.contributes.commands.some((item) => item.command === command));
    assert.equal(
      manifest.contributes.keybindings.find((item) => item.command === command).mac,
      mac
    );
  }
  assert.equal(manifest.contributes.customEditors[0].viewType, 'jbsearch.session');
});
test('shortcut settings link to the VS Code editor filtered by each command', () => {
  const setting = manifest.contributes.configuration.properties['jbsearch.keybindings.overrideFindInFiles'];
  const links = Array.from(setting.markdownDescription.matchAll(/\]\((command:[^)]+)\)/g), (match) =>
    new URL(match[1])
  );
  assert.equal(links.length, 2);
  assert.deepEqual(
    links.map((link) => [link.pathname, JSON.parse(decodeURIComponent(link.search.slice(1)))]),
    [
      ['workbench.action.openGlobalKeybindings', ['@command:jbsearch.findInFiles']],
      ['workbench.action.openGlobalKeybindings', ['@command:jbsearch.replaceInFiles']]
    ]
  );
});
test('Find contributes a native Panel tree with discoverable actions and scoped navigation', () => {
  const container = manifest.contributes.viewsContainers.panel.find(view => view.id === 'jbsearch-find');
  assert.ok(container);
  assert.equal(container.icon, '$(search)');
  assert.equal(manifest.contributes.views[container.id][0].id, 'jbsearch.results');
  const commands = new Set(manifest.contributes.commands.map(command => command.command));
  for (const item of manifest.contributes.menus['view/title']) {
    assert.ok(commands.has(item.command));
    assert.match(item.when, /view == jbsearch\.results/);
  }
  for (const item of manifest.contributes.keybindings.filter(key => key.command.startsWith('jbsearch.results.')))
    assert.match(item.when, /focusedView == jbsearch\.results/);
});
test('Explorer Find in Files is a folder-only entry point for desktop and Remote resources', () => {
  const command = manifest.contributes.commands.find(item => item.command === 'jbsearch.findInDirectory');
  assert.ok(command);
  assert.equal(command.title, 'Find in Files…');
  assert.equal(command.category, 'JB Search');
  const menu = manifest.contributes.menus['explorer/context'].find(item => item.command === command.command);
  assert.ok(menu);
  assert.equal(menu.group, '4_search');
  assert.match(menu.when, /\bexplorerResourceIsFolder\b/);
  assert.match(menu.when, /!listMultiSelection\b/);
  assert.match(menu.when, /resourceScheme\s*=~\s*\/\^\(file\|vscode-remote\)\$\//);
  assert.ok(manifest.contributes.menus.commandPalette.some(item =>
    item.command === command.command && item.when === 'false'
  ));
  assert.ok(!manifest.contributes.keybindings.some(item => item.command === command.command),
    'the folder entry point must leave the existing Find/Replace shortcuts in control');
});
test('activation routes search commands to the real controller surface', async () => {
  const commands = new Map(),
    modes = [],
    directories = [],
    messages = [];
  let created = 0;
  const vscode = {
    commands: {
      registerCommand(id, callback) {
        commands.set(id, callback);
        return { dispose() {} };
      }
    },
    window: {
      showInformationMessage(message) {
        messages.push(message);
      }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/extension.js'), 'utf8'), {
    module,
    exports: module.exports,
    require(id) {
      if (id === 'vscode') return vscode;
      assert.equal(id, './controller');
      return {
        SearchController: class {
          constructor() {
            created++;
          }
          show(mode) {
            modes.push(mode);
          }
          showInDirectory(uri) {
            directories.push(uri);
          }
        }
      };
    }
  });
  const context = {
    subscriptions: [],
    extension: { packageJSON: { version: '9.8.7' }, extensionUri: { fsPath: '/source/jbsearch' } }
  };
  module.exports.activate(context);
  assert.equal(created, 1);
  await commands.get('jbsearch.findInFiles')();
  await commands.get('jbsearch.replaceInFiles')();
  const folderUri = { scheme: 'file', fsPath: '/workspace/chosen folder' };
  await commands.get('jbsearch.findInDirectory')(folderUri, [{ scheme: 'file', fsPath: '/workspace/other folder' }]);
  commands.get('jbsearch.checkInstallation')();
  assert.deepEqual(modes, ['find', 'replace']);
  assert.deepEqual(directories, [folderUri]);
  assert.equal(directories[0], folderUri, 'Explorer URI must reach the workspace controller without reconstruction');
  assert.match(messages[0], /JB Search 9\.8\.7 is ready/);
  assert.match(messages[0], /Loaded from \/source\/jbsearch/);
  assert.match(messages[0], /Find in Files/);
  assert.equal(commands.size, 5);
});
