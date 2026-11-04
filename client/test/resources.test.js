'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ClientResources, MAX_FILE } = require('../resources');
function fixture(files, contributes) {
  const uri = value => ({ scheme: 'client', authority: 'local', path: value, toString() { return `client://local${this.path}`; } });
  let selected = 'GitHub Dark Default';
  let custom = {};
  const reads = [];
  const v = {
    Uri: { joinPath: (base, ...parts) => uri(path.posix.join(base.path, ...parts)) },
    env: { language: 'ru' },
    workspace: {
      fs: {
        async stat(resource) {
          if (!(resource.path in files)) throw Error('Missing fixture resource');
          return { size: Buffer.byteLength(files[resource.path]) };
        },
        async readFile(resource) { reads.push(resource.path); return Buffer.from(files[resource.path]); }
      },
      getConfiguration(section) { return { get(key, fallback) {
        return section === 'workbench' ? selected : key === 'tokenColorCustomizations' ? custom : fallback;
      } }; }
    },
    extensions: { all: [{ extensionUri: uri('/extension'), packageJSON: { contributes } }] }
  };
  return { v, reads, setTheme(value) { selected = value; }, setCustom(value) { custom = value; } };
}
test('client resolves theme includes and preserves user rules without requesting source code', async () => {
  const f = fixture({
    '/extension/themes/base.json': '// JSONC\n{"tokenColors":[{"scope":"keyword","settings":{"foreground":"#FF7B72"}}]}',
    '/extension/themes/dark.json': '{"include":"base.json","tokenColors":[{"scope":"string","settings":{"foreground":"#A5D6FF"}}]}'
  }, { themes: [{ id: 'GitHub Dark Default', path: './themes/dark.json' }] });
  f.setCustom({ '[GitHub Dark Default]': { strings: '#123456' } });
  const resources = new ClientResources(f.v, 'test-build');
  const snapshot = await resources.snapshot({ protocol: 1 });
  assert.equal(snapshot.foundTheme, true);
  assert.equal(snapshot.build, 'test-build');
  assert.deepEqual(snapshot.settings.map(rule => rule.scope), ['keyword', 'string']);
  assert.equal(snapshot.customizations['[GitHub Dark Default]'].strings, '#123456');
  assert.deepEqual(snapshot.grammars, []);
  assert.equal(await resources.snapshot({ protocol: 1 }), snapshot);
  await assert.rejects(() => resources.snapshot({ protocol: 2 }), /protocol/);
});
test('client supports localized theme labels, legacy built-in ids, and theme changes', async () => {
  const f = fixture({
    '/extension/package.nls.ru.json': '{"theme":"\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u0430\u044f \u0442\u0435\u043c\u0430"}',
    '/extension/theme.json': '{"tokenColors":[{"scope":"keyword","settings":{"foreground":"#abcdef"}}]}'
  }, { themes: [{ label: '%theme%', path: './theme.json' }, { id: 'Light Modern', path: './theme.json' }] });
  const resources = new ClientResources(f.v);
  f.setTheme('\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u0430\u044f \u0442\u0435\u043c\u0430');
  assert.equal((await resources.snapshot({ protocol: 1 })).foundTheme, true);
  f.setTheme('Default Light Modern');
  resources.invalidate();
  const current = await resources.snapshot({ protocol: 1 });
  assert.equal(current.themeId, 'Default Light Modern');
  assert.equal(current.foundTheme, true);
  assert.equal(current.revision, 1);
});
test('client shares only installed grammar resources, including injections and plist', async () => {
  const xml = '<?xml version="1.0"?><plist version="1.0"><dict><key>scopeName</key><string>source.xmlfixture</string><key>patterns</key><array/></dict></plist>';
  const f = fixture({
    '/extension/main.json': '{"scopeName":"source.fixture","patterns":[]}',
    '/extension/injection.tmLanguage': xml
  }, { grammars: [
    { language: 'fixture', scopeName: 'source.fixture', path: 'main.json' },
    { scopeName: 'source.xmlfixture', injectTo: ['source.fixture'], path: 'injection.tmLanguage' }
  ] });
  const snapshot = await new ClientResources(f.v).snapshot({ protocol: 1 });
  assert.equal(snapshot.grammars.length, 2);
  assert.equal(snapshot.grammars[1].content, xml);
  assert.deepEqual(snapshot.grammars[1].injectTo, ['source.fixture']);
  assert.equal(snapshot.incomplete, false);
  assert.equal(snapshot.foundTheme, false);
});
test('extension resources cannot escape the installed extension and oversized files are explicit', async () => {
  const f = fixture({ '/outside': 'private client data', '/extension/huge.json': 'x'.repeat(MAX_FILE + 1) }, {
    themes: [{ id: 'GitHub Dark Default', path: '../outside' }],
    grammars: [{ scopeName: 'source.huge', path: 'huge.json' }]
  });
  const snapshot = await new ClientResources(f.v).snapshot({ protocol: 1 });
  assert.equal(snapshot.foundTheme, false);
  assert.equal(snapshot.incomplete, true);
  assert.deepEqual(snapshot.grammars, []);
  assert.equal(f.reads.includes('/outside'), false);
  assert.equal(f.reads.includes('/extension/huge.json'), false);
});
test('theme include cycles are bounded and tmTheme rules are decoded', async () => {
  const plist = '<?xml version="1.0"?><plist version="1.0"><dict><key>settings</key><array><dict><key>scope</key><string>keyword</string><key>settings</key><dict><key>foreground</key><string>#FF0000</string></dict></dict></array></dict></plist>';
  const f = fixture({
    '/extension/base.json': '{"include":"theme.json","tokenColors":"colors.tmTheme"}',
    '/extension/theme.json': '{"include":"base.json","tokenColors":[]}',
    '/extension/colors.tmTheme': plist
  }, { themes: [{ id: 'GitHub Dark Default', path: 'theme.json' }] });
  const snapshot = await new ClientResources(f.v).snapshot({ protocol: 1 });
  assert.equal(snapshot.foundTheme, true);
  assert.equal(snapshot.settings[0].settings.foreground, '#FF0000');
  assert.equal(f.reads.filter(file => file.endsWith('theme.json')).length, 1);
});
test('extension changes invalidate grammar cache while theme changes retain it', async () => {
  const f = fixture({ '/extension/grammar.json': '{"scopeName":"source.fixture","patterns":[]}' }, {
    grammars: [{ scopeName: 'source.fixture', path: 'grammar.json' }]
  });
  const resources = new ClientResources(f.v);
  await resources.snapshot({ protocol: 1 });
  resources.invalidate();
  await resources.snapshot({ protocol: 1 });
  assert.equal(f.reads.filter(file => file.endsWith('grammar.json')).length, 1);
  resources.invalidate(true);
  await resources.snapshot({ protocol: 1 });
  assert.equal(f.reads.filter(file => file.endsWith('grammar.json')).length, 2);
});
