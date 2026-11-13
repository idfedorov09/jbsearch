'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createVSIX } = require('@vscode/vsce');
async function main() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'client');
  const output = path.join(root, 'bundled');
  const staging = path.join(root, '.client-build');
  const files = ['extension.js', 'resources.js', 'package.json', 'package-lock.json', 'README.md', '.vscodeignore'];
  const digest = crypto.createHash('sha256');
  for (const name of files) digest.update(name).update(await fs.readFile(path.join(source, name)));
  digest.update('LICENSE').update(await fs.readFile(path.join(root, 'LICENSE')));
  const client = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  for (const [dependency, expected] of Object.entries(client.dependencies)) {
    const installed = JSON.parse(await fs.readFile(path.join(root, 'node_modules', dependency, 'package.json'), 'utf8'));
    if (installed.version !== expected)
      throw new Error(`Client dependency ${dependency} must be pinned to installed version ${expected}; found ${installed.version}. Run npm ci after aligning the manifests.`);
    digest.update(dependency).update(installed.version);
  }
  const build = digest.digest('hex');
  // A nested VSIX generated under a different timestamp cannot be reused for
  // a reproducible release, even when its client source digest is unchanged.
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH || null;
  if (sourceDateEpoch !== null && !/^[0-9]+$/.test(sourceDateEpoch))
    throw new Error('SOURCE_DATE_EPOCH must be numeric when set');
  await fs.mkdir(output, { recursive: true });
  try {
    const existing = JSON.parse(await fs.readFile(path.join(output, 'client.json'), 'utf8'));
    if (existing.build === build && (existing.sourceDateEpoch ?? null) === sourceDateEpoch) {
      await fs.access(path.join(output, 'jbsearch-client.vsix'));
      console.log('JB Search client support is up to date.');
      return;
    }
  } catch { /* First build. */ }
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging);
  try {
    for (const name of files) await fs.copyFile(path.join(source, name), path.join(staging, name));
    await fs.copyFile(path.join(root, 'LICENSE'), path.join(staging, 'LICENSE'));
    // Only the two declared client dependencies and their files belong in its VSIX.
    // Copy installed pinned packages instead of downloading anything during use.
    for (const dependency of Object.keys(client.dependencies)) {
      await fs.cp(path.join(root, 'node_modules', dependency), path.join(staging, 'node_modules', dependency), { recursive: true });
    }
    const manifest = JSON.parse(await fs.readFile(path.join(staging, 'package.json'), 'utf8'));
    manifest.jbsearchClientBuild = build;
    await fs.writeFile(path.join(staging, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    const temporary = path.join(output, 'jbsearch-client.pending.vsix');
    await createVSIX({ cwd: staging, packagePath: temporary, dependencies: true, skipLicense: false });
    await fs.rename(temporary, path.join(output, 'jbsearch-client.vsix'));
    await fs.writeFile(path.join(output, 'client.json'), JSON.stringify({ protocol: 1, build, version: manifest.version, sourceDateEpoch }, null, 2) + '\n');
    console.log('Built bundled JB Search client support.');
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
