'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  os = require('node:os'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const { readTheme, themeRules, PreviewProvider } = require('../src/preview');
function tokenLimitFixture(tokenize) {
  const provider = new PreviewProvider({ workspace: { asRelativePath: () => 'fixture.js' } });
  provider.load = async () => ({
    registry: {
      loadGrammar: async () => ({ tokenizeLine2: tokenize }),
      getColorMap: () => [undefined, '#000000', '#FF0000']
    },
    languages: new Map([['fixture', 'source.fixture']]), foundTheme: true
  });
  const result = { id: 'one', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } };
  const document = {
    uri: { toString: () => 'file:///fixture.js' }, fileName: '/fixture.js',
    languageId: 'fixture', version: 1, getText: () => 'return\nnext'
  };
  return { provider, result, document };
}
test('a stopped TextMate line retries its original stack before advancing to the next line', async () => {
  const calls = [], partial = {}, complete = {};
  const f = tokenLimitFixture((text, state, limit) => {
    calls.push({ text, state, limit });
    return calls.length === 1
      ? { stoppedEarly: true, ruleStack: partial, tokens: new Uint32Array([0, 0]) }
      : { stoppedEarly: false, ruleStack: complete, tokens: new Uint32Array([0, 2 << 15]) };
  });
  const output = await f.provider.render(f.document, f.result, [f.result]);
  assert.equal(calls[0].text, calls[1].text);
  assert.equal(calls[0].state, calls[1].state);
  assert.notEqual(calls[1].state, partial);
  assert.equal(calls[2].state, complete);
  assert.deepEqual(calls.map(call => call.limit), [20, 100, 20]);
  assert.equal(output.lines[1].tokens[0].color, '#FF0000');
  assert.equal(output.note, '');
  f.provider.dispose();
});
test('repeated TextMate timeout keeps remaining lines plain with matches and an explicit note', async () => {
  let calls = 0;
  const f = tokenLimitFixture(() => {
    calls++;
    return { stoppedEarly: true, ruleStack: {}, tokens: new Uint32Array([0, 2 << 15]) };
  });
  const output = await f.provider.render(f.document, f.result, [f.result]);
  assert.equal(calls, 2);
  assert.deepEqual(output.lines.map(line => line.tokens), [[{ text: 'return' }], [{ text: 'next' }]]);
  assert.deepEqual(output.lines[0].highlights, [{ start: 0, end: 6, selected: true }]);
  assert.match(output.note, /Syntax tokenization limit/);
  f.provider.dispose();
});
test('disposing a pending preview destroys its registry without starting another load', async () => {
  const provider = new PreviewProvider({});
  let release, created = 0, disposed = 0;
  provider.createRegistry = () => {
    created++;
    return new Promise(resolve => { release = () => resolve({ registry: { dispose() { disposed++; } } }); });
  };
  const pending = provider.load();
  provider.dispose();
  release();
  await assert.rejects(pending, /disposed/);
  assert.equal(created, 1);
  assert.equal(disposed, 1);
  assert.equal(provider.registry, undefined);
  await assert.rejects(provider.load(), /disposed/);
});
test('a stale registry error cannot clear a newer pending theme load', async () => {
  const provider = new PreviewProvider({});
  const loads = [];
  provider.createRegistry = () => new Promise((resolve, reject) => loads.push({ resolve, reject }));
  const first = provider.load();
  provider.invalidate();
  const current = provider.load();
  loads[0].reject(new Error('old load failed'));
  await assert.rejects(first, /old load failed/);
  const shared = provider.load();
  assert.equal(loads.length, 2);
  const registry = { dispose() {} };
  loads[1].resolve({ registry });
  assert.equal((await current).registry, registry);
  assert.equal((await shared).registry, registry);
  provider.dispose();
});
test('theme includes and user-specific rules override base tokens', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-theme-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'base.json'),
    '// jsonc theme\n{"tokenColors":[{"scope":"string","settings":{"foreground":"#ff0000"}}]}'
  );
  await fs.writeFile(
    path.join(root, 'child.json'),
    ' {"include":"./base.json","tokenColors":[{"scope":"keyword","settings":{"foreground":"#00ff00"}}]}'
  );
  assert.equal((await readTheme(path.join(root, 'child.json'))).length, 2);
  const rules = themeRules({ strings: '#111111', '[Custom]': { strings: '#222222' } }, 'Custom');
  assert.equal(rules.at(-1).settings.foreground, '#222222');
});

test('token color customizations use VS Code scopes, wildcard selectors and precedence', () => {
  const rules = themeRules(
    {
      keywords: '#111111',
      '[*Dark*]': {
        textMateRules: [{ scope: 'keyword.control', settings: { foreground: '#333333' } }]
      },
      '[Default*][Other Theme]': {
        keywords: '#222222',
        comments: { foreground: '#444444', fontStyle: 'italic' }
      },
      '[*Light]': { numbers: '#555555' }
    },
    'Default Dark Modern'
  );
  assert.deepEqual(
    rules.filter((rule) => rule.scope === 'keyword.control').map((rule) => rule.settings.foreground),
    ['#111111', '#222222', '#333333']
  );
  assert.ok(
    rules.some((rule) => rule.scope === 'storage.type' && rule.settings.foreground === '#222222')
  );
  assert.ok(
    rules.some(
      (rule) => rule.scope === 'punctuation.definition.comment' && rule.settings.fontStyle === 'italic'
    )
  );
  assert.ok(!rules.some((rule) => rule.settings.foreground === '#555555'));
});
test('preview tokenizes grammar, retains exact match ranges and treats HTML as text', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-grammar-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'grammar.json'),
    JSON.stringify({
      scopeName: 'source.fixture',
      patterns: [
        { name: 'string.quoted', match: '"[^"\\n]*"' },
        { name: 'keyword.control', match: '\\bconst\\b' }
      ]
    })
  );
  await fs.writeFile(
    path.join(root, 'theme.json'),
    JSON.stringify({
      tokenColors: [
        { scope: 'keyword', settings: { foreground: '#FF0000' } },
        { scope: 'string', settings: { foreground: '#00FF00' } }
      ]
    })
  );
  const v = {
    workspace: {
      getConfiguration(section) {
        return {
          get(key, fallback) {
            return section === 'workbench' ? 'Custom' : fallback;
          }
        };
      },
      asRelativePath() {
        return 'a.js';
      }
    },
    extensions: {
      all: [
        {
          extensionPath: root,
          packageJSON: {
            contributes: {
              grammars: [
                { scopeName: 'source.fixture', language: 'javascript', path: 'grammar.json' }
              ],
              themes: [{ id: 'Custom', path: 'theme.json' }]
            }
          }
        }
      ]
    }
  };
  const provider = new PreviewProvider(v);
  t.after(() => provider.dispose());
  const result = {
    id: 'one',
    range: { start: { line: 0, character: 7 }, end: { line: 0, character: 10 } }
  };
  const output = await provider.render(
    {
      uri: { toString: () => 'file:///a.js' },
      fileName: '/a.js',
      languageId: 'javascript',
      version: 1,
      getText: () => 'const x = "<script>";'
    },
    result,
    [result]
  );
  assert.ok(output.lines[0].tokens.some((token) => token.color === '#FF0000'));
  assert.equal(output.lines[0].tokens.map((token) => token.text).join(''), 'const x = "<script>";');
  assert.equal(output.lines[0].highlights[0].start, 7);
});

test('legacy default theme ids and localized manifest labels resolve to their theme files', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-theme-alias-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'theme.json'),
    JSON.stringify({ tokenColors: [{ scope: 'keyword', settings: { foreground: '#00ff00' } }] })
  );
  await fs.writeFile(
    path.join(root, 'package.nls.json'),
    JSON.stringify({ themeLabel: 'Localized Theme' })
  );
  let selected = 'Default Light Modern';
  const v = {
    workspace: {
      getConfiguration(section) {
        return {
          get(key, fallback) {
            return section === 'workbench' ? selected : fallback;
          }
        };
      }
    },
    extensions: {
      all: [
        {
          extensionPath: root,
          packageJSON: {
            contributes: {
              themes: [
                { id: 'Light Modern', path: 'theme.json' },
                { label: '%themeLabel%', path: 'theme.json' }
              ]
            }
          }
        }
      ]
    }
  };
  const provider = new PreviewProvider(v);
  t.after(() => provider.dispose());
  assert.equal((await provider.load()).foundTheme, true);
  provider.invalidate();
  selected = 'Localized Theme';
  assert.equal((await provider.load()).foundTheme, true);
});

test('grammar injections target descendants and match highlights survive missing theme colors', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-injection-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'grammar.json'),
    JSON.stringify({ scopeName: 'source.fixture.embedded', patterns: [] })
  );
  await fs.writeFile(
    path.join(root, 'injection.json'),
    JSON.stringify({
      scopeName: 'injection.fixture',
      injectionSelector: 'L:source.fixture.embedded',
      patterns: [{ name: 'keyword.control', match: 'INJECT' }]
    })
  );
  const v = {
    workspace: {
      getConfiguration(section) {
        return {
          get(key, fallback) {
            if (section === 'workbench') return 'Client Theme';
            if (key === 'tokenColorCustomizations') return { keywords: '#FF0000' };
            return fallback;
          }
        };
      },
      asRelativePath() {
        return 'a.fixture';
      }
    },
    extensions: {
      all: [
        {
          extensionPath: root,
          packageJSON: {
            contributes: {
              grammars: [
                { scopeName: 'source.fixture.embedded', language: 'fixture', path: 'grammar.json' },
                { scopeName: 'injection.fixture', injectTo: ['source.fixture'], path: 'injection.json' }
              ]
            }
          }
        }
      ]
    }
  };
  const provider = new PreviewProvider(v);
  t.after(() => provider.dispose());
  const result = {
    id: 'one',
    range: { start: { line: 0, character: 1 }, end: { line: 0, character: 4 } }
  };
  const output = await provider.render(
    {
      uri: { toString: () => 'file:///a.fixture' },
      fileName: '/a.fixture',
      languageId: 'fixture',
      version: 1,
      getText: () => 'INJECT'
    },
    result,
    [result]
  );
  assert.equal(output.lines[0].tokens[0].color, '#FF0000');
  assert.deepEqual(output.lines[0].highlights, [{ start: 1, end: 4, selected: true }]);
  assert.match(output.note, /Active theme unavailable/);
});
