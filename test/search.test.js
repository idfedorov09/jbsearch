'use strict';

const { contentHash } = require('../src/content-hash');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const {
  SearchEngine,
  compileQuery,
  iterateMatches,
  replacementForMatch,
  acceptsFile,
  isPathWithin
} = require('../src/search');

function matches(text, request) {
  return [...iterateMatches(text, { caseSensitive: false, regex: false, ...request })];
}

async function fixture(t, files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(directory, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
  return directory;
}

function requestFor(directory, overrides = {}) {
  return {
    query: 'needle',
    roots: [{ path: directory, name: 'fixture' }],
    scope: { kind: 'workspace' },
    respectExcludes: true,
    ...overrides
  };
}

test('literal punctuation, case and Unicode whole words share a matcher', () => {
  assert.deepEqual(
    matches('a.b axb A.B', { query: 'a.b' }).map((match) => match.matchText),
    ['a.b', 'A.B']
  );
  assert.equal(
    matches('cat Cat catalog scat', { query: 'cat', caseSensitive: true, wholeWord: true }).length,
    1
  );
  assert.equal(matches('\u043a\u043e\u0442 \u043a\u043e\u0442\u0438\u043a \u0441\u043a\u043e\u0442', { query: '\u043a\u043e\u0442', wholeWord: true }).length, 1);
  assert.equal(matches('a.b axb', { query: 'a.b', regex: true }).length, 2);
});

test('typed newlines work on LF and CRLF and literal backslash-n stays literal', () => {
  const result = matches('first\r\nsecond\nfirst\nsecond', { query: 'first\nsecond' });
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].range, {
    start: { line: 0, character: 0 },
    end: { line: 1, character: 6 }
  });
  assert.equal(matches('first\\nsecond', { query: 'first\\nsecond' }).length, 1);
  assert.equal(matches('first\nsecond', { query: 'first\\nsecond' }).length, 0);
  assert.equal(matches('first\nsecond', { query: 'first\\nsecond', regex: true }).length, 1);
  assert.equal(matches('first\nsecond', { query: 'first.second', regex: true }).length, 0);
  assert.equal(matches('first\nsecond', { query: '(?s)first.second', regex: true }).length, 1);
});

test('ranges use UTF-16, repeated matches stay distinct and zero-width advances by code point', () => {
  const result = matches('😀 \u043f\u0440\u0438\u0432\u0435\u0442 cat cat\r\n\u043a\u043e\u0442', { query: 'cat' });
  assert.equal(result[0].range.start.character, 10);
  assert.equal(result[1].range.start.character, 14);
  assert.notEqual(result[0].id, result[1].id);
  assert.deepEqual(
    matches('😀a', { query: '(?=.)', regex: true }).map((match) => match.character),
    [0, 2]
  );
  assert.equal(matches('a\nb', { query: '^', regex: true }).length, 2);
});

test('replacement expansion uses captures collected by the same matcher', () => {
  const [match] = matches('foo-42', { query: '(?<word>foo)-(\\d+)(optional)?', regex: true });
  assert.equal(
    replacementForMatch('$<word>:$2:$3:$$:$&:$0\\n', match),
    'foo:42::$:foo-42:foo-42\n'
  );
  assert.equal(replacementForMatch('$12/$99', match), 'foo2/$99');
  assert.equal(replacementForMatch('$1\\n', match, false), '$1\\n');
});

test('file masks apply basename or root-relative glob and intersect excludes', () => {
  const request = {
    masksEnabled: true,
    fileMask: '*.js;*.ts',
    respectExcludes: true,
    exclude: ['generated/**']
  };
  assert.equal(acceptsFile('src/deep/main.ts', request), true);
  assert.equal(acceptsFile('src/main.go', request), false);
  assert.equal(acceptsFile('generated/main.ts', request), false);
  assert.equal(acceptsFile('src/main.js', { ...request, fileMask: 'src/**/*.js' }), true);
  assert.equal(acceptsFile('main.js', { ...request, fileMask: '**/*.js' }), true);
  assert.equal(acceptsFile('main.go', { ...request, masksEnabled: false }), true);
  assert.equal(
    acceptsFile('node_modules/entry.js', request, { exclude: { '**/node_modules': true } }),
    false
  );
  assert.equal(acceptsFile('src/main.js', { ...request, fileMask: '*.{js,ts}' }), true);
  assert.equal(isPathWithin('/project-other/file', '/project'), false);
});

test('workspace search honors ignore files, exclusions, masks and dirty snapshots', async (t) => {
  const directory = await fixture(t, {
    '.gitignore': 'ignored.js\n',
    '.ignore': 'other.js\n',
    'visible.js': 'disk needle',
    'dirty.js': 'stale needle',
    'ignored.js': 'needle',
    'other.js': 'needle',
    'generated/gen.js': 'needle',
    'nested/include.ts': 'needle',
    'readme.md': 'needle'
  });
  const engine = new SearchEngine({ batchSize: 1 });
  t.after(() => engine.dispose());
  const dirtyPath = path.join(directory, 'dirty.js');
  const documents = [
    {
      fsPath: dirtyPath,
      uri: pathToFileURL(dirtyPath).toString(),
      text: 'unsaved needle needle',
      version: 7,
      isDirty: true
    }
  ];
  const batches = [];
  const result = await engine.search(
    requestFor(directory, {
      masksEnabled: true,
      fileMask: '*.js;*.ts',
      exclude: ['generated/**'],
      documents
    }),
    { onBatch: (batch) => batches.push(...batch) }
  );
  assert.equal(result.truncated, false);
  assert.equal(result.results.length, 4);
  assert.equal(batches.length, 4);
  assert.deepEqual([...new Set(result.results.map((match) => match.relativePath))].sort(), [
    'dirty.js',
    'nested/include.ts',
    'visible.js'
  ]);
  assert.equal(result.results.filter((match) => match.source === 'snapshot').length, 2);
  assert.equal(result.results.find((match) => match.source === 'snapshot').documentVersion, 7);

  const unfiltered = await engine.search(
    requestFor(directory, {
      respectExcludes: false,
      documents,
      masksEnabled: true,
      fileMask: '*.js'
    })
  );
  assert.ok(unfiltered.results.some((match) => match.relativePath === 'ignored.js'));
  assert.ok(unfiltered.results.some((match) => match.relativePath === 'other.js'));
});

test('a dirty snapshot cannot bring an ignored disk file back into the workspace search', async (t) => {
  const directory = await fixture(t, {
    '.gitignore': 'ignored.js\n',
    'ignored.js': 'needle',
    'normal.js': 'normal'
  });
  const ignoredPath = path.join(directory, 'ignored.js');
  const result = await new SearchEngine().search(
    requestFor(directory, {
      documents: [{ fsPath: ignoredPath, text: 'needle', isDirty: true }]
    })
  );
  assert.equal(result.results.length, 0);
});

test('missing open file buffers do not silently produce a complete scope search', async (t) => {
  const directory = await fixture(t, { '.gitignore': 'ignored.js\n', 'ignored.js': 'needle' });
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  const missing = path.join(directory, 'missing.js');
  const document = { fsPath: missing, uri: pathToFileURL(missing).toString(), text: 'needle', version: 3, isDirty: true };
  for (const scope of [{ kind: 'workspace' }, { kind: 'openEditors' }]) {
    const output = await engine.search(requestFor(directory, { scope, documents: [document] }));
    assert.equal(output.truncated, true);
    assert.equal(output.stats.blockingSkippedFiles, 1);
    assert.equal(output.stats.skippedDetails[0].path, missing);
  }
  const explicit = await engine.search(requestFor(directory, {
    scope: { kind: 'openEditors' }, respectExcludes: false, documents: [document]
  }));
  assert.equal(explicit.truncated, false);
  assert.equal(explicit.results.length, 1);
  const excluded = await engine.search(requestFor(directory, {
    masksEnabled: true, fileMask: '*.ts', documents: [document]
  }));
  assert.equal(excluded.truncated, false, 'a path excluded by an explicit mask is not an unknown input');
});

test('untitled buffers remain searchable in Open Editors without a disk entry', async (t) => {
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  const output = await engine.search({
    query: 'needle', roots: [], scope: { kind: 'openEditors' }, respectExcludes: true,
    documents: [{ uri: 'untitled:Untitled-1', displayName: 'Untitled-1', text: 'needle', version: 1 }]
  });
  assert.equal(output.truncated, false);
  assert.equal(output.results.length, 1);
  assert.equal(output.results[0].uri, 'untitled:Untitled-1');
});

test('conditional exclusion errors other than a missing sibling fail the search', async (t) => {
  if (process.platform === 'win32') return t.skip('symlink creation may require elevated privileges');
  const directory = await fixture(t, { 'entry.js': 'needle' });
  await fs.symlink('entry.ts', path.join(directory, 'entry.ts'));
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  await assert.rejects(() => engine.search(requestFor(directory, {
    roots: [{ path: directory, name: 'fixture', exclude: { '*.js': { when: '$(basename).ts' } } }]
  })), /ELOOP|symbolic links/i);
});

test('folder and directory scope restrict multi-root search without path-prefix leakage', async (t) => {
  const first = await fixture(t, { 'src/main.js': 'needle', 'src-other/main.js': 'needle' });
  const second = await fixture(t, { 'second.js': 'needle' });
  const engine = new SearchEngine();
  const roots = [
    { path: first, name: 'first' },
    { path: second, name: 'second' }
  ];
  const folder = await engine.search(
    requestFor(first, { roots, scope: { kind: 'folder', rootPath: second } })
  );
  assert.deepEqual(
    folder.results.map((match) => match.rootName),
    ['second']
  );
  const directory = await engine.search(
    requestFor(first, { roots, scope: { kind: 'directory', directory: path.join(first, 'src') } })
  );
  assert.deepEqual(
    directory.results.map((match) => match.relativePath),
    ['src/main.js']
  );
});

test('Open Editors searches supplied current text and untitled buffers only', async (t) => {
  const directory = await fixture(t, {
    'closed.js': 'needle',
    'open.js': 'disk content',
    '.gitignore': 'ignored.js\n',
    'ignored.js': 'needle'
  });
  const openPath = path.join(directory, 'open.js');
  const ignoredPath = path.join(directory, 'ignored.js');
  const result = await new SearchEngine().search(
    requestFor(directory, {
      scope: { kind: 'openEditors' },
      masksEnabled: true,
      fileMask: '*.js',
      documents: [
        {
          fsPath: openPath,
          uri: pathToFileURL(openPath).toString(),
          text: 'current needle',
          version: 4
        },
        { fsPath: ignoredPath, uri: pathToFileURL(ignoredPath).toString(), text: 'needle' },
        { uri: 'untitled:Scratch.js', displayName: 'Scratch.js', text: 'needle', version: 1 },
        { uri: 'untitled:Other.ts', displayName: 'Other.ts', text: 'needle', version: 1 }
      ]
    })
  );
  assert.deepEqual(result.results.map((match) => match.label).sort(), ['Scratch.js', 'open.js']);
  assert.ok(result.results.every((match) => match.source === 'snapshot'));
});

test('search reports binary, unsupported encoding and oversized files as partial', async (t) => {
  const directory = await fixture(t, {
    'normal.txt': 'needle',
    'binary.bin': Buffer.from('needle\0rest'),
    'latin.txt': Buffer.from([0x6e, 0xe9, 0x65]),
    'large.txt': 'needle'.repeat(1000)
  });
  const result = await new SearchEngine().search(requestFor(directory, { maxFileSizeMiB: 0.001 }));
  assert.equal(result.results.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.stats.skipped.binary, 1);
  assert.equal(result.stats.excludedBinaryFiles, 1);
  assert.equal(result.stats.blockingSkippedFiles, 2);
  assert.equal(result.stats.skipped.encoding, 1);
  assert.equal(result.stats.skipped.tooLarge, 1);
});

test('UTF-8 BOM does not shift editor ranges and UTF-16 BOM is reported as unsupported', async (t) => {
  const directory = await fixture(t, {
    'bom.txt': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('needle')]),
    'utf16.txt': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('needle', 'utf16le')])
  });
  const result = await new SearchEngine().search(requestFor(directory));
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].range.start.character, 0);
  assert.equal(result.results[0].offset, 0);
  assert.equal(result.stats.skipped.encoding, 1);
});

test('the result limit distinguishes a complete exact count from truncation', async (t) => {
  const directory = await fixture(t, { 'matches.txt': 'needle needle needle' });
  const engine = new SearchEngine();
  const limited = await engine.search(requestFor(directory, { maxResults: 2 }));
  assert.equal(limited.results.length, 2);
  assert.equal(limited.truncated, true);
  assert.equal(limited.reason, 'limit');
  assert.equal(limited.stats.cancelled, false);
  assert.equal(limited.stats.timedOut, false);
  assert.equal(limited.stats.blockingSkippedFiles, 0);
  assert.deepEqual(limited.stats.errors, []);
  const exact = await engine.search(requestFor(directory, { maxResults: 3 }));
  assert.equal(exact.truncated, false);
});

test('enumeration accepts empty exit 1 but rejects warnings and partial records',
  { skip: process.platform === 'win32' }, async t => {
    const root = await fixture(t, {}), scripts = await fixture(t, {});
    for (const [name, body, incomplete] of [
      ['empty', 'process.exitCode = 1;', false],
      ['warning', "process.stderr.write('ignore rules could not be read');", true],
      ['partial', "process.stdout.write('unterminated');", true],
      ['error', 'process.exitCode = 2;', true]
    ]) {
      const executable = path.join(scripts, name);
      await fs.writeFile(executable, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
      const result = await new SearchEngine({ rgPath: executable }).search(requestFor(root));
      assert.equal(result.truncated, incomplete, name);
      assert.equal(result.stats.blockingSkippedFiles, incomplete ? 1 : 0, name);
      assert.equal(result.stats.cancelled, false, name);
      assert.equal(result.stats.timedOut, false, name);
    }
  });

test('an enumerated file replaced by a symlink makes the search incomplete',
  { skip: process.platform === 'win32' }, async t => {
    const root = await fixture(t, { 'target.txt': 'needle' }), scripts = await fixture(t, {});
    await fs.symlink(path.join(root, 'target.txt'), path.join(root, 'swapped.txt'));
    const executable = path.join(scripts, 'fake-rg');
    await fs.writeFile(executable,
      `#!${process.execPath}\nprocess.stdout.write('swapped.txt\\0');\n`, { mode: 0o755 });
    const result = await new SearchEngine({ rgPath: executable }).search(requestFor(root));
    assert.equal(result.truncated, true);
    assert.equal(result.stats.blockingSkippedFiles, 1);
    assert.match(result.stats.errors[0].message, /changed type/);
    assert.deepEqual(result.results, []);
  });

test('intentional cancellation and timeout do not become enumeration errors',
  { skip: process.platform === 'win32' }, async t => {
    const root = await fixture(t, {}), scripts = await fixture(t, {});
    const executable = path.join(scripts, 'waiting-rg');
    await fs.writeFile(executable, `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`, { mode: 0o755 });
    const engine = new SearchEngine({ rgPath: executable });
    t.after(() => engine.dispose());
    const timedOut = await engine.search(requestFor(root, { timeoutMs: 200 }));
    assert.equal(timedOut.stats.timedOut, true);
    assert.equal(timedOut.stats.cancelled, false);
    assert.equal(timedOut.stats.blockingSkippedFiles, 0);
    assert.deepEqual(timedOut.stats.errors, []);
    const abort = new AbortController();
    const pending = engine.search(requestFor(root, { timeoutMs: 5000 }), { signal: abort.signal });
    setTimeout(() => abort.abort(), 200);
    const cancelled = await pending;
    assert.equal(cancelled.stats.cancelled, true);
    assert.equal(cancelled.stats.timedOut, false);
    assert.equal(cancelled.stats.blockingSkippedFiles, 0);
    assert.deepEqual(cancelled.stats.errors, []);
  });

test('invalid regex rejects before searching and empty or aborted input performs no work', async () => {
  assert.throws(() => compileQuery({ query: '[', regex: true }), { code: 'INVALID_REGEX' });
  const engine = new SearchEngine({ rgPath: '/nonexistent/rg' });
  await assert.rejects(engine.search({ query: '[', regex: true }), { code: 'INVALID_REGEX' });
  const empty = await engine.search({ query: '' });
  assert.equal(empty.results.length, 0);
  const controller = new AbortController();
  controller.abort();
  const cancelled = await engine.search({ query: 'needle' }, { signal: controller.signal });
  assert.equal(cancelled.stats.cancelled, true);
});

test('a pathological regex times out without blocking the caller and cancellation terminates it', async () => {
  const engine = new SearchEngine();
  const request = {
    query: '(a+)+$',
    regex: true,
    scope: { kind: 'openEditors' },
    timeoutMs: 120,
    documents: [
      {
        uri: 'untitled:expensive.txt',
        displayName: 'expensive.txt',
        text: `${'a'.repeat(100000)}!`
      }
    ]
  };
  let remainedResponsive = false;
  const timer = setTimeout(() => {
    remainedResponsive = true;
  }, 30);
  const timedOut = await engine.search(request);
  clearTimeout(timer);
  assert.equal(remainedResponsive, true);
  assert.equal(timedOut.stats.timedOut, true);
  assert.equal(timedOut.truncated, true);

  const controller = new AbortController();
  const pending = engine.search({ ...request, timeoutMs: 5000 }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 70);
  const cancelled = await pending;
  assert.equal(cancelled.stats.cancelled, true);
  assert.equal(cancelled.stats.timedOut, false);
});

test(
  'symlinked files and folders outside the scope are not traversed',
  { skip: process.platform === 'win32' },
  async (t) => {
    const directory = await fixture(t, { 'inside.txt': 'needle' });
    const outside = await fixture(t, { 'outside.txt': 'needle' });
    await fs.symlink(path.join(outside, 'outside.txt'), path.join(directory, 'linked.txt'));
    await fs.symlink(outside, path.join(directory, 'linked-directory'));
    const result = await new SearchEngine().search(requestFor(directory));
    assert.deepEqual(
      result.results.map((match) => match.label),
      ['inside.txt']
    );
  }
);

test('conditional excludes respect sibling when clauses and explicit false overrides', async (t) => {
  const directory = await fixture(t, {
    'foo.js': 'needle',
    'foo.ts': 'needle',
    'bar.js': 'needle'
  });
  const result = await new SearchEngine().search(
    requestFor(directory, {
      roots: [
        { path: directory, exclude: { '**/*.js': { when: '$(basename).ts' }, '**/*.ts': false } }
      ]
    })
  );
  assert.deepEqual(result.results.map((match) => match.label).sort(), ['bar.js', 'foo.ts']);
});

test('custom scope and query include patterns intersect with alternatives inside each set', async (t) => {
  const directory = await fixture(t, {
    'src/main.js': 'needle',
    'src/main.ts': 'needle',
    'src/note.txt': 'needle',
    'lib/helper.js': 'needle',
    'test/spec.js': 'needle'
  });
  const result = await new SearchEngine().search(
    requestFor(directory, {
      scope: { kind: 'custom', include: ['src/**', 'lib/**'] },
      include: '*.js;*.ts'
    })
  );
  assert.deepEqual(result.results.map((match) => match.relativePath).sort(), [
    'lib/helper.js',
    'src/main.js',
    'src/main.ts'
  ]);
});

test('disabling ignore rules preserves named scope exclusions', async (t) => {
  const directory = await fixture(t, {
    '.gitignore': 'src/ignored.js\n',
    'src/main.js': 'needle',
    'src/ignored.js': 'needle',
    'src/generated/output.js': 'needle',
    'outside.js': 'needle'
  });
  const result = await new SearchEngine().search(
    requestFor(directory, {
      scope: { kind: 'custom', include: 'src/**', exclude: '**/generated/**' },
      respectExcludes: false
    })
  );
  assert.deepEqual(result.results.map((match) => match.relativePath).sort(), [
    'src/ignored.js',
    'src/main.js'
  ]);
});

test('nested workspace roots use their own policy in either root order', async (t) => {
  const directory = await fixture(t, {
    'top.txt': 'needle',
    'nested/a.txt': 'needle',
    'nested/a.js': 'needle',
    'nested/ignored.js': 'needle',
    'nested/.gitignore': 'ignored.js\n'
  });
  const roots = [
    { path: directory, name: 'parent' },
    { path: path.join(directory, 'nested'), name: 'child', exclude: { '**/*.txt': true } }
  ];
  const engine = new SearchEngine();
  for (const ordered of [roots, [...roots].reverse()]) {
    const result = await engine.search(requestFor(directory, { roots: ordered }));
    assert.deepEqual(
      result.results.map((match) => `${match.rootName}/${match.relativePath}`).sort(),
      ['child/a.js', 'parent/top.txt']
    );
    const open = await engine.search(
      requestFor(directory, {
        roots: ordered,
        scope: { kind: 'openEditors' },
        documents: [
          {
            fsPath: path.join(directory, 'nested/ignored.js'),
            text: 'needle',
            isDirty: true
          }
        ]
      })
    );
    assert.equal(open.results.length, 0);
  }
  const selectedParent = await engine.search(
    requestFor(directory, {
      roots,
      scope: { kind: 'folder', rootPath: directory },
      respectExcludes: false
    })
  );
  assert.equal(selectedParent.results.length, 4);
  assert.ok(selectedParent.results.every((match) => match.rootName === 'parent'));
});

test('worker content hashes preserve individual UTF-16 code units', async (t) => {
  const engine = new SearchEngine();
  t.after(() => engine.dispose());
  const text = '\ud800 cat';
  const output = await engine.search({ query: 'cat', scope: { kind: 'openEditors' }, roots: [],
    documents: [{ uri: 'untitled:hash-test', text, version: 1 }] });
  assert.equal(output.results.length, 1);
  assert.equal(output.results[0].contentHash, contentHash(text));
  assert.notEqual(output.results[0].contentHash, contentHash('\ud801 cat'));
});
