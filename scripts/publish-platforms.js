'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { TARGETS, UNIVERSAL } = require('./package-targets');
const { outputName } = require('./package-platforms');
const { verifyPackage } = require('./verify-package');
const { verifyReleaseChannel } = require('./verify-release-channel');
const { verifyWithRetry } = require('./verify-published-beta');

const ORDER = Object.freeze([UNIVERSAL, ...TARGETS]);

function publishCommand(root, registry, channel, auth, file) {
  if (!['stable', 'pre-release'].includes(channel)) throw new Error('Unknown release channel');
  if (registry === 'marketplace' && auth === 'oidc') {
    const args = ['publish', '--oidc', '--skip-duplicate', '--packagePath', file];
    if (channel === 'pre-release') args.splice(2, 0, '--pre-release');
    return { executable: path.join(root, 'node_modules/.bin/vsce'), args };
  }
  if (registry === 'open-vsx' && auth === 'token')
    return { executable: process.execPath, args: [path.join(root, 'scripts/publish-open-vsx.js'), file, '--skip-duplicate'] };
  if (registry === 'open-vsx' && auth === 'trusted' && channel === 'stable')
    return { executable: path.join(root, 'node_modules/.bin/ovsx'), args: ['--registryUrl', 'https://open-vsx.org', 'publish', file, '--trusted-publishing', '--skip-duplicate'] };
  throw new Error('Unsupported registry or authentication mode');
}

function runCommand({ executable, args }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit', shell: false });
    child.once('error', () => reject(new Error('Publisher could not be started')));
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`Publisher failed (${signal ? 'signal' : `exit ${code}`})`)));
  });
}

async function publishMatrix({ registry, channel, auth, directory, root = path.join(__dirname, '..'),
  inspect = verifyPackage, inspectChannel = verifyReleaseChannel, publish = runCommand,
  verify = verifyWithRetry, log = console.log, manifest = require('../package.json') }) {
  if (!directory) throw new Error('A matrix package directory is required');
  root = path.resolve(root);
  const id = `${manifest.publisher}.${manifest.name}`;
  // Validate the route before examining packages; do not accept unknown auth modes.
  publishCommand(root, registry, channel, auth, 'placeholder.vsix');
  const packages = [];
  for (const target of ORDER) {
    const file = path.join(path.resolve(directory), outputName(manifest, target));
    const result = await inspect(file, { root, target });
    await inspectChannel(file, channel, { id, version: manifest.version });
    if (!/^[0-9a-f]{64}$/.test(result.sha256 || '')) throw new Error(`Invalid local digest for ${target}`);
    packages.push({ target, file, sha256: result.sha256 });
  }
  const confirmed = [];
  for (const [index, item] of packages.entries()) {
    log(`Publishing ${registry} ${id} ${manifest.version} ${channel} ${item.target} sha256 ${item.sha256}`);
    let phase = 'upload';
    try {
      await publish(publishCommand(root, registry, channel, auth, item.file));
      phase = 'registry verification';
      await verify(registry, { publisher: manifest.publisher, name: manifest.name, version: manifest.version,
        target: item.target, channel, sha256: item.sha256 });
      confirmed.push(item.target);
      log(`Confirmed ${registry} ${item.target} sha256 ${item.sha256}`);
    } catch {
      const remaining = packages.slice(index + 1).map(next => next.target);
      throw new Error(`Publication incomplete on ${registry}: ${phase} failed. Confirmed: ${confirmed.join(', ') || 'none'}. ` +
        `Uncertain: ${item.target} (upload may already have occurred). Not attempted: ${remaining.join(', ') || 'none'}. ` +
        'Inspect exact registry records and hashes before retrying; do not overwrite an existing artifact.');
    }
  }
  log(`Confirmed all ${packages.length} ${registry} targets for ${id} ${manifest.version} ${channel}.`);
  return confirmed;
}

if (require.main === module) {
  const [registry, channel, auth, directory, ...rest] = process.argv.slice(2);
  if (rest.length || !directory) {
    console.error('Usage: node scripts/publish-platforms.js <marketplace|open-vsx> <stable|pre-release> <oidc|token|trusted> <directory>');
    process.exitCode = 1;
  } else {
    publishMatrix({ registry, channel, auth, directory }).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
module.exports = { ORDER, publishCommand, runCommand, publishMatrix };
