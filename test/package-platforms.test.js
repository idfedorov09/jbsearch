'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { TARGETS, RIPGREP_PLATFORMS, UNIVERSAL } = require('../scripts/package-targets');
const { outputName, ignoreRules, vsceArguments, buildPackages, parseOptions } = require('../scripts/package-platforms');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-package-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'jbsearch', publisher: 'test', version: '1.2.3' }));
  await fs.writeFile(path.join(root, '.vscodeignore'), 'images/**\n!bundled/jbsearch-client.vsix\n');
  for (const platform of RIPGREP_PLATFORMS) {
    const dir = path.join(root, 'node_modules/@vscode/ripgrep-universal/bin', platform);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, platform.startsWith('win32-') ? 'rg.exe' : 'rg'), platform);
  }
  return root;
}

function fakes(calls, failTarget) {
  return {
    runVsce: async options => {
      calls.push(options);
      if (options.target === failTarget) throw new Error('injected build failure');
      await fs.writeFile(options.output, Buffer.alloc(options.target === UNIVERSAL ? 40 : 10));
    },
    verifyPackage: async (filename, options) => {
      assert.ok(filename.endsWith(`${options.target}.vsix`));
      return { sha256: `digest-${options.target}` };
    },
    verifyReleaseChannel: async (_filename, channel, identity) => {
      assert.ok(['stable', 'pre-release'].includes(channel));
      assert.deepEqual(identity, { id: 'test.jbsearch', version: '1.2.3' });
    }
  };
}

test('the six explicit targets and universal fallback have unique paths', () => {
  assert.deepEqual(TARGETS, ['win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64']);
  assert.equal(RIPGREP_PLATFORMS.length, 12);
  const names = [...TARGETS, UNIVERSAL].map(target => outputName({ name: 'test', version: '1.0.0' }, target));
  assert.equal(new Set(names).size, 7);
  assert.throws(() => outputName({ name: 'test', version: '1.0.0' }, 'alpine-x64'), /Unsupported/);
  assert.throws(() => parseOptions(['--target', 'wrong']), /Unsupported/);
  assert.throws(() => parseOptions(['--out-dir', '']), /must not be empty/);
  assert.deepEqual(parseOptions(['--target', 'linux-x64', '--pre-release']),
    { target: 'linux-x64', outputDir: undefined, preRelease: true });
});

test('temporary target rules retain the base rules and exclude exactly the other 11 binaries', () => {
  const rules = ignoreRules('images/**\n!bundled/jbsearch-client.vsix\n', 'linux-x64');
  assert.match(rules, /^images\/\*\*\n!bundled\/jbsearch-client\.vsix/m);
  for (const platform of RIPGREP_PLATFORMS)
    assert.equal(rules.includes(`bin/${platform}/**`), platform !== 'linux-x64', platform);
  assert.doesNotMatch(ignoreRules('images/**\n', UNIVERSAL), /ripgrep-universal\/bin/);
});

test('vsce receives an explicit target and ignore file only for platform builds', () => {
  assert.deepEqual(vsceArguments({ executable: 'vsce', output: 'out.vsix', target: 'linux-x64',
    preRelease: true, ignoreFile: '/tmp/target.ignore' }),
  ['vsce', 'package', '--out', 'out.vsix', '--target', 'linux-x64', '--ignoreFile', '/tmp/target.ignore', '--pre-release']);
  assert.deepEqual(vsceArguments({ executable: 'vsce', output: 'out.vsix', target: UNIVERSAL }),
    ['vsce', 'package', '--out', 'out.vsix']);
  assert.throws(() => vsceArguments({ executable: 'vsce', output: 'out.vsix', target: 'linux-x64' }), /ignore file/);
});

test('matrix produces seven verified outputs, reports their sizes, and preserves inputs', async t => {
  const root = await fixture(t);
  const outputDir = path.join(root, 'output');
  const calls = [];
  const originalIgnore = await fs.readFile(path.join(root, '.vscodeignore'), 'utf8');
  const result = await buildPackages({ root, outputDir, preRelease: true, ...fakes(calls) });
  assert.equal(result.channel, 'pre-release');
  assert.equal(result.packages.length, 7);
  assert.deepEqual(result.packages.map(p => p.target), [...TARGETS, UNIVERSAL]);
  assert.equal(new Set(result.packages.map(p => p.file)).size, 7);
  for (const item of result.packages) {
    assert.equal(item.verified, true);
    assert.equal(item.size, item.target === UNIVERSAL ? 40 : 10);
    assert.equal(item.sha256, `digest-${item.target}`);
    assert.equal(item.file, path.join(outputDir, outputName({ name: 'jbsearch', version: '1.2.3' }, item.target)));
  }
  assert.ok(result.packages.filter(item => item.target !== UNIVERSAL)
    .every(item => item.size < result.packages.find(candidate => candidate.target === UNIVERSAL).size));
  assert.ok(calls.every(c => c.preRelease));
  assert.equal(await fs.readFile(path.join(root, '.vscodeignore'), 'utf8'), originalIgnore);
  for (const platform of RIPGREP_PLATFORMS) {
    const name = platform.startsWith('win32-') ? 'rg.exe' : 'rg';
    assert.equal(await fs.readFile(path.join(root, 'node_modules/@vscode/ripgrep-universal/bin', platform, name), 'utf8'), platform);
  }
  for (const call of calls) await assert.rejects(fs.access(path.dirname(call.output)), { code: 'ENOENT' });
});

test('both matrix modes verify the requested channel for every artifact', async t => {
  const root = await fixture(t);
  for (const preRelease of [false, true]) {
    const calls = [];
    const channels = [];
    const result = await buildPackages({ root, preRelease, outputDir: path.join(root, String(preRelease)),
      ...fakes(calls), verifyReleaseChannel: async (filename, channel, identity) => {
        channels.push({ filename, channel, identity });
      } });
    const expected = preRelease ? 'pre-release' : 'stable';
    assert.equal(result.channel, expected);
    assert.equal(channels.length, 7);
    assert.ok(channels.every(item => item.channel === expected &&
      item.identity.id === 'test.jbsearch' && item.identity.version === '1.2.3'));
    assert.ok(calls.every(call => call.preRelease === preRelease));
  }
});

test('a matrix is rejected before output when a target is not smaller than universal', async t => {
  const root = await fixture(t);
  const outputDir = path.join(root, 'output');
  const options = fakes([]);
  options.runVsce = async ({ output }) => fs.writeFile(output, Buffer.alloc(10));
  await assert.rejects(buildPackages({ root, outputDir, ...options }), /must be smaller/);
  assert.deepEqual(await fs.readdir(outputDir), []);
});

test('failure cleans staging and never removes or modifies source dependencies', async t => {
  const root = await fixture(t);
  const calls = [];
  const outputDir = path.join(root, 'output');
  await assert.rejects(buildPackages({ root, outputDir, ...fakes(calls, 'darwin-x64') }), /injected/);
  assert.deepEqual(await fs.readdir(outputDir), []);
  for (const call of calls) await assert.rejects(fs.access(path.dirname(call.output)), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(root, '.vscodeignore'), 'utf8'), 'images/**\n!bundled/jbsearch-client.vsix\n');
  for (const platform of RIPGREP_PLATFORMS) {
    const name = platform.startsWith('win32-') ? 'rg.exe' : 'rg';
    assert.equal(await fs.readFile(path.join(root, 'node_modules/@vscode/ripgrep-universal/bin', platform, name), 'utf8'), platform);
  }
});

test('existing output is never overwritten and repository-root output is refused', async t => {
  const root = await fixture(t);
  const outputDir = path.join(root, 'output');
  await fs.mkdir(outputDir);
  const existing = path.join(outputDir, 'jbsearch-1.2.3-win32-arm64.vsix');
  await fs.writeFile(existing, 'keep');
  await assert.rejects(buildPackages({ root, outputDir, ...fakes([]) }), { code: 'EEXIST' });
  assert.equal(await fs.readFile(existing, 'utf8'), 'keep');
  assert.deepEqual(await fs.readdir(outputDir), [path.basename(existing)]);
  await assert.rejects(buildPackages({ root, outputDir: root, ...fakes([]) }), /repository root/);
});

test('one explicitly selected target builds without the full matrix', async t => {
  const root = await fixture(t);
  const calls = [];
  const result = await buildPackages({ root, outputDir: path.join(root, 'output'), target: 'darwin-arm64', ...fakes(calls) });
  assert.equal(result.channel, 'stable');
  assert.deepEqual(result.packages.map(item => item.target), ['darwin-arm64']);
  assert.equal(calls.length, 1);
});
