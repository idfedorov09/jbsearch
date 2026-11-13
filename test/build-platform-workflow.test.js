'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

// The pinned OpenSpec dependency already includes the YAML parser used here.
const { parse } = createRequire(require.resolve('@fission-ai/openspec'))('yaml');
const root = path.join(__dirname, '..');
const filename = path.join(root, '.github/workflows/build-platform-packages.yml');
const source = fs.readFileSync(filename, 'utf8');
const workflow = parse(source);
const job = workflow.jobs.package;
const targets = ['win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64', 'universal'];
const step = name => {
  const matches = job.steps.filter(item => item.name === name);
  assert.equal(matches.length, 1, `expected exactly one ${name} step`);
  return matches[0];
};

function runChannelStep(t, { event, ref, base = '', gitOutput, gitExit = 0, sha = 'a'.repeat(40) }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbsearch-build-workflow-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const envFile = path.join(dir, 'github-env');
  const outputFile = path.join(dir, 'github-output');
  const gitLog = path.join(dir, 'git-log');
  const sentinel = path.join(dir, 'package-started');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(envFile, 'EXISTING_ENV=unchanged\n');
  fs.writeFileSync(outputFile, 'EXISTING_OUTPUT=unchanged\n');
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$MOCK_GIT_LOG"\nprintf "%s" "$MOCK_GIT_OUTPUT"\nexit "$MOCK_GIT_EXIT"\n', { mode: 0o755 });
  const env = {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    HOME: dir,
    EVENT_NAME: event,
    SOURCE_REF: ref,
    BASE_REF: base,
    GITHUB_SHA: sha,
    GITHUB_ENV: envFile,
    GITHUB_OUTPUT: outputFile,
    MOCK_GIT_LOG: gitLog,
    MOCK_GIT_OUTPUT: gitOutput === undefined ? '1700000000\n' : gitOutput,
    MOCK_GIT_EXIT: String(gitExit),
    PACKAGE_SENTINEL: sentinel,
  };
  // Run the actual checked-in shell block, not a JavaScript copy of the decision.
  const script = `${step('Select build channel').run}\nprintf 'started\\n' > "$PACKAGE_SENTINEL"`;
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    cwd: root, env, encoding: 'utf8', timeout: 5000,
  });
  if (result.error) throw result.error;
  return {
    result,
    environment: fs.readFileSync(envFile, 'utf8'),
    output: fs.readFileSync(outputFile, 'utf8'),
    gitArgs: fs.existsSync(gitLog) ? fs.readFileSync(gitLog, 'utf8') : null,
    packageStarted: fs.existsSync(sentinel),
  };
}

test('build-only workflow runs on the intended branches with seven distinct targets', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  const branches = ['beta', 'dev', 'master'];
  assert.deepEqual([...workflow.on.push.branches].sort(), branches);
  assert.deepEqual([...workflow.on.pull_request.branches].sort(), branches);
  assert.deepEqual(Object.keys(workflow.jobs), ['package']);
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job.strategy['fail-fast'], false);
  assert.deepEqual(job.strategy.matrix.target, targets);
  assert.equal(new Set(job.strategy.matrix.target).size, 7);
  assert.deepEqual(Object.keys(job.strategy.matrix), ['target']);
});

test('workflow uses read-only permissions, pinned actions and no publishing or credentials', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(job.permissions, undefined);
  const uses = job.steps.filter(item => item.uses).map(item => item.uses);
  assert.equal(uses.length, 3);
  assert.match(uses[0], /^actions\/checkout@[a-f0-9]{40}$/);
  assert.match(uses[1], /^actions\/setup-node@[a-f0-9]{40}$/);
  assert.match(uses[2], /^actions\/upload-artifact@[a-f0-9]{40}$/);
  assert.equal(job.steps[0].with['persist-credentials'], false);
  assert.equal(job.steps[1].with['node-version'], 22);
  assert.equal(job.steps[1].with.cache, 'npm');
  assert.equal(job.steps[2].run, 'npm ci --ignore-scripts');
  assert.doesNotMatch(source, /\bsecrets\s*\.|\bid-token\s*:\s*write\b|\b(?:OVSX_PAT|VSCE_PAT|GITHUB_TOKEN)\b/i);
  assert.doesNotMatch(source, /(?:scripts\/publish|\b(?:npm|vsce|ovsx)\s+publish\b|\bgh\s+release\b|\bgit\s+(?:push|tag|commit)\b)/i);
  assert.equal(job.steps.length, 7, 'no unverified additional build or publication steps');
});

test('each target builds one verified package in an isolated job and has a unique artifact name', () => {
  const channel = step('Select build channel');
  const stable = step('Build stable package');
  const prerelease = step('Build pre-release package');
  const upload = step('Upload verified package');
  assert.equal(channel.id, 'channel');
  assert.deepEqual(channel.env, {
    EVENT_NAME: '${{ github.event_name }}', SOURCE_REF: '${{ github.ref }}', BASE_REF: '${{ github.base_ref }}',
  });
  assert.equal(stable.if, "steps.channel.outputs.channel == 'stable'");
  assert.equal(prerelease.if, "steps.channel.outputs.channel == 'pre-release'");
  assert.deepEqual(stable.env, { PACKAGE_TARGET: '${{ matrix.target }}' });
  assert.deepEqual(prerelease.env, stable.env);
  assert.equal(stable.run, 'npm run package:matrix -- --target "$PACKAGE_TARGET" --out-dir "$RUNNER_TEMP/jbsearch-packages"');
  assert.equal(prerelease.run, 'npm run package:matrix -- --target "$PACKAGE_TARGET" --pre-release --out-dir "$RUNNER_TEMP/jbsearch-packages"');
  assert.ok(job.steps.indexOf(channel) < job.steps.indexOf(stable));
  assert.ok(job.steps.indexOf(stable) < job.steps.indexOf(prerelease));
  assert.ok(job.steps.indexOf(prerelease) < job.steps.indexOf(upload));
  assert.equal(upload.with.name, 'jbsearch-${{ steps.channel.outputs.channel }}-${{ matrix.target }}-${{ github.sha }}');
  assert.equal(upload.with.path, '${{ runner.temp }}/jbsearch-packages/*.vsix');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with['compression-level'], 0);
  const names = targets.map(target => upload.with.name
    .replace('${{ steps.channel.outputs.channel }}', 'stable')
    .replace('${{ matrix.target }}', target)
    .replace('${{ github.sha }}', 'a'.repeat(40)));
  assert.equal(new Set(names).size, targets.length);
});

test('actual channel-selection shell chooses pre-release for beta pushes, dispatches and beta-targeted PRs', t => {
  const cases = [
    { event: 'push', ref: 'refs/heads/beta' },
    { event: 'workflow_dispatch', ref: 'refs/heads/beta' },
    { event: 'pull_request', ref: 'refs/pull/123/merge', base: 'beta' },
  ];
  for (const input of cases) {
    const actual = runChannelStep(t, input);
    assert.equal(actual.result.status, 0, actual.result.stderr);
    assert.equal(actual.environment, 'EXISTING_ENV=unchanged\nSOURCE_DATE_EPOCH=1700000000\n');
    assert.equal(actual.output, 'EXISTING_OUTPUT=unchanged\nchannel=pre-release\n');
    assert.equal(actual.gitArgs, `show\n-s\n--format=%ct\n${'a'.repeat(40)}\n`);
    assert.equal(actual.packageStarted, true);
  }
});

test('actual channel-selection shell chooses stable for dev, master and other PRs without consulting git', t => {
  const cases = [
    { event: 'push', ref: 'refs/heads/dev' },
    { event: 'push', ref: 'refs/heads/master' },
    { event: 'workflow_dispatch', ref: 'refs/heads/master' },
    { event: 'pull_request', ref: 'refs/pull/124/merge', base: 'dev' },
    { event: 'pull_request', ref: 'refs/pull/125/merge', base: 'master' },
  ];
  for (const input of cases) {
    const actual = runChannelStep(t, { ...input, gitOutput: 'bad', gitExit: 1 });
    assert.equal(actual.result.status, 0, actual.result.stderr);
    assert.equal(actual.environment, 'EXISTING_ENV=unchanged\n');
    assert.equal(actual.output, 'EXISTING_OUTPUT=unchanged\nchannel=stable\n');
    assert.equal(actual.gitArgs, null);
    assert.equal(actual.packageStarted, true);
  }
});

test('actual channel-selection shell aborts invalid or failed beta timestamps before starting a build', t => {
  for (const gitOutput of ['', 'abc', '123x', '-1', '1 2', '1\n2']) {
    const actual = runChannelStep(t, { event: 'push', ref: 'refs/heads/beta', gitOutput });
    assert.notEqual(actual.result.status, 0, `must reject ${JSON.stringify(gitOutput)}`);
    assert.equal(actual.environment, 'EXISTING_ENV=unchanged\n');
    assert.equal(actual.output, 'EXISTING_OUTPUT=unchanged\n');
    assert.equal(actual.packageStarted, false);
  }
  const failed = runChannelStep(t, { event: 'pull_request', ref: 'refs/pull/126/merge', base: 'beta', gitOutput: '123', gitExit: 1 });
  assert.notEqual(failed.result.status, 0);
  assert.equal(failed.environment, 'EXISTING_ENV=unchanged\n');
  assert.equal(failed.output, 'EXISTING_OUTPUT=unchanged\n');
  assert.equal(failed.packageStarted, false);
});
