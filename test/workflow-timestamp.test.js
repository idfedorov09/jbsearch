'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const workflows = [
  { path: '.github/workflows/publish.yml', count: 2 },
  { path: '.github/workflows/publish-open-vsx.yml', count: 2 },
  { path: '.github/workflows/test.yml', count: 1 },
];

// Extract the actual YAML run block so this exercises the checked-in shell,
// including its error handling, instead of a second copy of the algorithm.
function timestampBlocks(filename) {
  const yaml = fs.readFileSync(path.join(root, filename), 'utf8');
  const pattern = /^      - name: Set beta(?: PR)? build timestamp\s*\n        if: [^\n]+\n        run: \|\s*\n((?: {10}[^\n]*\n)+)/gm;
  return [...yaml.matchAll(pattern)].map(match => match[1].replace(/^ {10}/gm, ''));
}

function runStep(t, script, { sha, mockOutput, mockExit = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbsearch-timestamp-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const envFile = path.join(dir, 'github-env');
  const sentinel = path.join(dir, 'package-started');
  fs.writeFileSync(envFile, 'EXISTING=unchanged\n');
  const environment = {
    PATH: process.env.PATH,
    HOME: dir,
    GITHUB_SHA: sha || '0'.repeat(40),
    GITHUB_ENV: envFile,
    PACKAGE_SENTINEL: sentinel,
  };
  if (mockOutput !== undefined) {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const git = path.join(bin, 'git');
    fs.writeFileSync(git, '#!/bin/sh\nprintf "%s" "$MOCK_GIT_OUTPUT"\nexit "$MOCK_GIT_EXIT"\n', { mode: 0o755 });
    environment.PATH = `${bin}${path.delimiter}${environment.PATH}`;
    environment.MOCK_GIT_OUTPUT = mockOutput;
    environment.MOCK_GIT_EXIT = String(mockExit);
  }
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', `${script}\nprintf 'started\\n' > "$PACKAGE_SENTINEL"`], {
    cwd: root, env: environment, encoding: 'utf8', timeout: 5000,
  });
  if (result.error) throw result.error;
  return { result, env: fs.readFileSync(envFile, 'utf8'), packageStarted: fs.existsSync(sentinel) };
}

const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (head.status !== 0) throw new Error('Cannot determine checked-out commit for timestamp regression');
const sha = head.stdout.trim();
const expected = spawnSync('git', ['show', '-s', '--format=%ct', sha], { cwd: root, encoding: 'utf8' });
if (expected.status !== 0 || !/^\d+$/.test(expected.stdout.trim())) throw new Error('Cannot read a numeric commit timestamp');

for (const workflow of workflows) {
  const blocks = timestampBlocks(workflow.path);
  if (blocks.length !== workflow.count) throw new Error(`${workflow.path} must have ${workflow.count} timestamp shell blocks, found ${blocks.length}`);
  for (const [index, script] of blocks.entries()) {
    const name = `${workflow.path} timestamp step ${index + 1}`;
    test(`${name}: an invalid SHA aborts without writing or starting package`, t => {
      const actual = runStep(t, script);
      assert.notEqual(actual.result.status, 0);
      assert.equal(actual.env, 'EXISTING=unchanged\n');
      assert.equal(actual.packageStarted, false);
    });
    test(`${name}: malformed or failed git output aborts before packaging`, t => {
      for (const output of ['', 'abc', '123x', '-1', '1 2', '1\n2']) {
        const actual = runStep(t, script, { sha, mockOutput: output });
        assert.notEqual(actual.result.status, 0, `must reject ${JSON.stringify(output)}`);
        assert.equal(actual.env, 'EXISTING=unchanged\n');
        assert.equal(actual.packageStarted, false);
      }
      const failed = runStep(t, script, { sha, mockOutput: '123', mockExit: 1 });
      assert.notEqual(failed.result.status, 0);
      assert.equal(failed.env, 'EXISTING=unchanged\n');
      assert.equal(failed.packageStarted, false);
    });
    test(`${name}: a valid SHA writes its numeric commit timestamp and permits package`, t => {
      const actual = runStep(t, script, { sha });
      assert.equal(actual.result.status, 0, actual.result.stderr);
      assert.equal(actual.env, `EXISTING=unchanged\nSOURCE_DATE_EPOCH=${expected.stdout.trim()}\n`);
      assert.equal(actual.packageStarted, true);
    });
  }
}
