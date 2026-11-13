'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { TARGETS, UNIVERSAL } = require('./package-targets');
const { outputName } = require('./package-platforms');
const { verifyPackage } = require('./verify-package');
const { verifyReleaseChannel } = require('./verify-release-channel');
const { verifyWithRetry, createAttemptLimiter } = require('./verify-published-beta');

const ORDER = Object.freeze([UNIVERSAL, ...TARGETS]);

function publishCommand(root, registry, channel, auth, file) {
  if (!['stable', 'pre-release'].includes(channel)) throw new Error('Unknown release channel');
  if (registry === 'marketplace' && auth === 'oidc') {
    return { executable: process.execPath, args: [path.join(root, 'scripts/publish-marketplace.js'), file, channel], requiresAcknowledgement: true };
  }
  if (registry === 'open-vsx' && auth === 'token')
    return { executable: process.execPath, args: [path.join(root, 'scripts/publish-open-vsx.js'), file] };
  if (registry === 'open-vsx' && auth === 'trusted' && channel === 'stable')
    return { executable: path.join(root, 'node_modules/.bin/ovsx'), args: ['--registryUrl', 'https://open-vsx.org', 'publish', file, '--trusted-publishing'] };
  throw new Error('Unsupported registry or authentication mode');
}

function runCommand({ executable, args, requiresAcknowledgement = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: requiresAcknowledgement ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit', shell: false });
    let accepted = false;
    if (requiresAcknowledgement) child.on('message', message => { if (message === 'accepted') accepted = true; });
    child.once('error', () => reject(new Error('Publisher could not be started')));
    child.once('close', (code, signal) => {
      if (code === 0 && (!requiresAcknowledgement || accepted)) resolve();
      else reject(new Error(`Publisher failed (${signal ? 'signal' : code === 0 ? 'missing acknowledgement' : `exit ${code}`})`));
    });
  });
}

async function publishMatrix({ registry, channel, auth, directory, root = path.join(__dirname, '..'),
  inspect = verifyPackage, inspectChannel = verifyReleaseChannel, publish = runCommand,
  verify = verifyWithRetry, log = console.log, manifest = require('../package.json'),
  now = () => performance.now(), verificationConcurrency = 3 }) {
  if (!directory) throw new Error('A matrix package directory is required');
  root = path.resolve(root);
  const id = `${manifest.publisher}.${manifest.name}`;
  publishCommand(root, registry, channel, auth, 'placeholder.vsix');
  const limiter = createAttemptLimiter(verificationConcurrency);
  const packages = [];
  for (const target of ORDER) {
    const file = path.join(path.resolve(directory), outputName(manifest, target));
    const result = await inspect(file, { root, target });
    await inspectChannel(file, channel, { id, version: manifest.version });
    if (!/^[0-9a-f]{64}$/.test(result.sha256 || '')) throw new Error(`Invalid local digest for ${target}`);
    packages.push({ target, file, sha256: result.sha256, status: 'not attempted' });
  }
  let failure = false;
  const pending = [];
  function startVerification(item) {
    item.status = 'uncertain';
    const task = (async () => {
      try {
        await verify(registry, { publisher: manifest.publisher, name: manifest.name, version: manifest.version,
          target: item.target, channel, sha256: item.sha256 }, { limiter, log });
        item.status = 'confirmed';
        log(`Confirmed ${registry} ${item.target} sha256 ${item.sha256}`);
      } catch {
        failure = true;
        log(`Exact verification failed for ${registry} ${item.target}; details withheld.`);
      }
    })();
    pending.push(task);
    return task;
  }
  for (const item of packages) {
    // Let already-settled background verification handlers latch their result.
    await Promise.resolve();
    if (failure) break;
    item.status = 'uncertain';
    log(`Publishing ${registry} ${id} ${manifest.version} ${channel} ${item.target} sha256 ${item.sha256}`);
    let uploaded = false;
    const started = now();
    try {
      await publish(publishCommand(root, registry, channel, auth, item.file));
      uploaded = true;
      log(`Publisher process completed for ${registry} ${item.target} in ${(now() - started).toFixed(0)} ms.`);
    } catch {
      log(`Publisher process failed or was inconclusive for ${registry} ${item.target} after ${(now() - started).toFixed(0)} ms; checking exact record.`);
    }
    const verification = startVerification(item);
    // A failed upload may already have succeeded or may be a duplicate. Do not
    // send another package until its exact record proves the outcome is safe.
    if (item.target === UNIVERSAL || !uploaded) {
      await verification;
      if (!uploaded && item.status === 'confirmed') log(`Recovered ${registry} ${item.target} by exact registry verification; publisher did not report success.`);
    }
  }
  await Promise.all(pending);
  const byStatus = status => packages.filter(item => item.status === status).map(item => item.target);
  const confirmed = byStatus('confirmed');
  const uncertain = byStatus('uncertain');
  const notAttempted = byStatus('not attempted');
  if (failure || uncertain.length || notAttempted.length) {
    throw new Error(`Publication incomplete on ${registry}. Confirmed: ${confirmed.join(', ') || 'none'}. ` +
      `Uncertain: ${uncertain.join(', ') || 'none'} (upload may already have occurred). ` +
      `Not attempted: ${notAttempted.join(', ') || 'none'}. ` +
      'Inspect exact registry records and hashes before retrying; do not overwrite an existing artifact.');
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
