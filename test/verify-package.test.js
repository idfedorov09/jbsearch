'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pipeline } = require('node:stream/promises');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { ZipFile } = createRequire(require.resolve('@vscode/vsce'))('yazl');
const { verifyPackage } = require('../scripts/verify-package');
const { TARGETS, RIPGREP_PLATFORMS, UNIVERSAL, ripgrepPath } = require('../scripts/package-targets');
const projectRoot = path.join(__dirname, '..');

async function writeZip(filename, entries) {
  const zip = new ZipFile();
  for (const [name, entry] of entries)
    zip.addBuffer(Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data), name, { mode: entry.mode || 0o100644 });
  zip.end();
  await pipeline(zip.outputStream, fs.createWriteStream(filename));
}

async function fixture(t, options = {}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'jbsearch-verify-vsix-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const target = options.target || UNIVERSAL;
  const declared = options.declared === undefined ? target : options.declared;
  const source = JSON.parse(await fsp.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const clientSource = JSON.parse(await fsp.readFile(path.join(projectRoot, 'client/package.json'), 'utf8'));
  const packaged = structuredClone(source);
  if (options.missingDeclaration) delete packaged.dependencies['jsonc-parser'];
  const client = { ...structuredClone(clientSource), jbsearchClientBuild: 'test-build' };
  const icon = await fsp.readFile(path.join(projectRoot, source.icon));
  await fsp.mkdir(path.join(root, 'client'), { recursive: true });
  await fsp.mkdir(path.join(root, 'media'), { recursive: true });
  await fsp.mkdir(path.join(root, 'images'), { recursive: true });
  await fsp.mkdir(path.join(root, 'bundled'), { recursive: true });
  await fsp.writeFile(path.join(root, 'package.json'), JSON.stringify(source));
  await fsp.writeFile(path.join(root, 'client/package.json'), JSON.stringify(clientSource));
  await fsp.writeFile(path.join(root, source.icon), icon);
  await fsp.writeFile(path.join(root, 'images/hero.gif'), 'image');
  await fsp.writeFile(path.join(root, 'README.md'), '![Demo](images/hero.gif)\n');

  const inner = new Map();
  inner.set('extension/package.json', { data: JSON.stringify(client) });
  inner.set('extension/extension.js', { data: 'client entry' });
  inner.set('extension/resources.js', { data: 'client resources' });
  for (const name of Object.keys(client.dependencies)) {
    const dep = JSON.parse(await fsp.readFile(path.join(projectRoot, 'node_modules', name, 'package.json'), 'utf8'));
    inner.set(`extension/node_modules/${name}/package.json`, { data: JSON.stringify(dep) });
    inner.set(path.posix.normalize(`extension/node_modules/${name}/${dep.main}`), { data: 'client dependency' });
  }
  const bundlePath = path.join(root, 'bundled/jbsearch-client.vsix');
  await writeZip(bundlePath, inner);
  const bundle = await fsp.readFile(bundlePath);
  const metadata = { protocol: 1, version: client.version, build: client.jbsearchClientBuild };
  await fsp.writeFile(path.join(root, 'bundled/client.json'), JSON.stringify(metadata));

  const entries = new Map();
  const add = (name, data, mode) => entries.set(name, { data, mode });
  const identityTarget = declared === UNIVERSAL ? '' : ` TargetPlatform="${declared}"`;
  add('extension.vsixmanifest', `<PackageManifest><Metadata><Identity Publisher="${source.publisher}" Id="${source.name}" Version="${source.version}"${identityTarget}/></Metadata></PackageManifest>`);
  add('extension/package.json', JSON.stringify(packaged));
  add('extension/readme.md', options.badReadme ? '![Demo](images/hero.gif)' : '![Demo](https://github.com/example/repo/raw/HEAD/images/hero.gif)');
  add(`extension/${source.icon}`, icon);
  add('extension/bundled/client.json', JSON.stringify(metadata));
  add('extension/bundled/jbsearch-client.vsix', options.badBundle ? Buffer.from('wrong') : bundle);
  for (const name of [
    'src/extension.js', 'src/controller.js', 'src/search/index.js', 'src/search/worker.js', 'src/search/matcher.js',
    'src/search/zip.js', 'src/search/binary.js', 'src/search/diagnostics.js', 'src/preview.js', 'src/client-preview.js',
    'src/find-results.js', 'src/find-preview.js', 'src/find-tree.js', 'media/search.js', 'media/search.css',
    'node_modules/vscode-oniguruma/release/onig.wasm'
  ]) add(`extension/${name}`, `runtime ${name}`);
  for (const name of Object.keys(source.dependencies)) {
    const dep = JSON.parse(await fsp.readFile(path.join(projectRoot, 'node_modules', name, 'package.json'), 'utf8'));
    add(`extension/node_modules/${name}/package.json`, JSON.stringify(dep));
    add(path.posix.normalize(`extension/node_modules/${name}/${dep.main}`), 'dependency');
  }
  for (const platform of RIPGREP_PLATFORMS) {
    const relative = ripgrepPath(platform);
    const disk = path.join(root, relative);
    await fsp.mkdir(path.dirname(disk), { recursive: true });
    await fsp.writeFile(disk, `binary-${platform}`);
    const included = target === UNIVERSAL || platform === target || platform === options.extra;
    if (included && platform !== options.missing) {
      add(`extension/${relative}`, platform === options.corrupt ? 'corrupt' : `binary-${platform}`,
        platform === options.nonExecutable ? 0o100644 : 0o100755);
    }
  }
  if (options.extraUnknown) add('extension/node_modules/@vscode/ripgrep-universal/bin/unknown/rg', 'unexpected');
  if (options.withImages) add('extension/images/hero.gif', 'image');
  if (options.omit) entries.delete(options.omit);
  const archive = path.join(root, 'candidate.vsix');
  await writeZip(archive, entries);
  return { root, archive, target };
}

test('universal and each platform-specific package verify exact target and inventory', async t => {
  for (const target of [UNIVERSAL, ...TARGETS]) {
    const f = await fixture(t, { target });
    const result = await verifyPackage(f.archive, { root: f.root, target });
    assert.equal(result.main.target, target);
    assert.deepEqual(result.main.ripgrepPlatforms, target === UNIVERSAL ? [...RIPGREP_PLATFORMS] : [target]);
  }
});

test('verification rejects a missing, extra, non-executable, or modified ripgrep', async t => {
  for (const options of [
    { target: 'linux-x64', missing: 'linux-x64' },
    { target: 'linux-x64', extra: 'linux-arm64' },
    { target: 'linux-x64', nonExecutable: 'linux-x64' },
    { target: 'linux-x64', corrupt: 'linux-x64' },
    { target: UNIVERSAL, missing: 'linux-arm' },
    { target: UNIVERSAL, extraUnknown: true }
  ]) {
    const f = await fixture(t, options);
    await assert.rejects(verifyPackage(f.archive, { root: f.root, target: f.target }), /ripgrep/);
  }
});

test('outer target must match the requested target and universal must be unmarked', async t => {
  for (const options of [
    { target: 'linux-x64', declared: 'linux-arm64' },
    { target: UNIVERSAL, declared: 'linux-x64' }
  ]) {
    const f = await fixture(t, options);
    await assert.rejects(verifyPackage(f.archive, { root: f.root, target: f.target }), /target does not match/);
  }
  const f = await fixture(t);
  await assert.rejects(verifyPackage(f.archive, { root: f.root, target: 'web' }), /Unsupported/);
});

test('demonstration assets are excluded and README HTTPS references are preserved', async t => {
  for (const options of [{ withImages: true }, { badReadme: true }]) {
    const f = await fixture(t, options);
    await assert.rejects(verifyPackage(f.archive, { root: f.root }), /images|HTTPS/);
  }
});

test('required runtime, dependency declarations, and bundled client fail closed', async t => {
  for (const options of [
    { omit: 'extension/src/search/worker.js' },
    { omit: 'extension/node_modules/vscode-oniguruma/release/onig.wasm' },
    { omit: 'extension/node_modules/jsonc-parser/package.json' },
    { omit: 'extension/media/icon.png' },
    { omit: 'extension/bundled/client.json' },
    { missingDeclaration: true },
    { badBundle: true }
  ]) {
    const f = await fixture(t, options);
    await assert.rejects(verifyPackage(f.archive, { root: f.root }), /missing|dependencies|dependency|client VSIX/i);
  }
});

test('ripgrep resolves the workspace host platform and honors npm_config_arch', () => {
  const script = "console.log(require('@vscode/ripgrep-universal').rgPath)";
  for (const override of [undefined, process.arch, 'arm64']) {
    const env = { ...process.env };
    if (override === undefined) delete env.npm_config_arch;
    else env.npm_config_arch = override;
    const child = spawnSync(process.execPath, ['-e', script], { cwd: projectRoot, env, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const binary = process.platform === 'win32' ? 'rg.exe' : 'rg';
    assert.ok(child.stdout.trim().endsWith(path.join('bin', `${process.platform}-${override || process.arch}`, binary)));
  }
});
