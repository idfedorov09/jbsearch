'use strict';

const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { verifyReleaseChannel } = require('./verify-release-channel');
const { UNIVERSAL, validateTarget } = require('./package-targets');

function expectedTarget(expected) { return validateTarget(expected.target === undefined ? UNIVERSAL : expected.target); }
function expectedChannel(expected) {
  const channel = expected.channel === undefined ? 'pre-release' : expected.channel;
  if (!['stable', 'pre-release'].includes(channel)) throw new Error('Unknown release channel');
  return channel;
}

function marketplaceRecord(body, expected) {
  const target = expectedTarget(expected), channel = expectedChannel(expected);
  const matches = (body.results || []).flatMap(result => result.extensions || [])
    .filter(ext => ext.publisher?.publisherName === expected.publisher && ext.extensionName === expected.name);
  if (matches.length !== 1) throw new Error('Marketplace extension identity missing or ambiguous');
  const versions = (matches[0].versions || []).filter(v => v.version === expected.version &&
    (v.targetPlatform ?? UNIVERSAL) === target);
  if (versions.length !== 1) throw new Error(`Marketplace exact ${target} version missing or ambiguous`);
  const release = versions[0];
  if (!String(release.flags || '').split(',').map(s => s.trim()).includes('validated')) throw new Error('Marketplace version not validated');
  const values = key => (release.properties || []).filter(p => p.key === key).map(p => p.value);
  const markers = values('Microsoft.VisualStudio.Code.PreRelease');
  const hashes = values('Microsoft.VisualStudio.Services.VsixSha256');
  if (channel === 'pre-release' ? markers.length !== 1 || markers[0] !== 'true' :
      markers.length > 1 || (markers.length === 1 && markers[0] !== 'false')) {
    throw new Error(`Marketplace version is not marked ${channel}`);
  }
  if (hashes.length !== 1 || String(hashes[0]).toLowerCase() !== expected.sha256) throw new Error('Marketplace VSIX SHA-256 differs from the built package');
}

async function responseJson(fetcher, url, options) {
  const response = await fetcher(url, options);
  if (!response.ok) {
    await cancelBody(response);
    throw new Error(`Registry returned HTTP ${response.status}`);
  }
  return response.json();
}

async function cancelBody(response) {
  try { await response.body?.cancel(); } catch { /* An already closed stream needs no further action. */ }
}

// Public digest requests carry no credentials. Restrict redirects explicitly
// rather than letting a registry-provided URL reach an arbitrary origin.
async function digestResponse(fetcher, initial) {
  let url = initial;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(30000), redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      await cancelBody(response);
      if (redirects === 3) throw new Error('Too many Open VSX digest redirects');
      let next;
      try { next = new URL(response.headers.get('location'), url); } catch { throw new Error('Invalid Open VSX digest redirect'); }
      if (next.protocol !== 'https:' || !['open-vsx.org', 'openvsx.eclipsecontent.org'].includes(next.hostname) ||
          next.port || next.username || next.password || next.hash) throw new Error('Unexpected Open VSX digest redirect');
      url = next;
      continue;
    }
    if (!response.ok) {
      await cancelBody(response);
      throw new Error(`Open VSX digest returned HTTP ${response.status}`);
    }
    return response.text();
  }
  throw new Error('Open VSX digest unavailable');
}

async function checkRegistry(registry, expected, fetcher = fetch) {
  const target = expectedTarget(expected), channel = expectedChannel(expected);
  if (registry === 'marketplace') {
    const body = await responseJson(fetcher, 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=7.2-preview.1' },
      body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: `${expected.publisher}.${expected.name}` }], pageNumber: 1, pageSize: 100 }], flags: 147 }),
      signal: AbortSignal.timeout(30000), redirect: 'error',
    });
    marketplaceRecord(body, expected);
    return;
  }
  if (registry !== 'open-vsx') throw new Error('Unknown registry');
  const base = `https://open-vsx.org/api/${encodeURIComponent(expected.publisher)}/${encodeURIComponent(expected.name)}`;
  const release = await responseJson(fetcher, `${base}/${encodeURIComponent(target)}/${encodeURIComponent(expected.version)}?verify=${Date.now()}`, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (release.namespace !== expected.publisher || release.name !== expected.name || release.version !== expected.version ||
      release.targetPlatform !== target || release.preRelease !== (channel === 'pre-release')) {
    throw new Error(`Open VSX exact ${target} version, target or channel does not match ${channel}`);
  }
  let url;
  try { url = new URL(release.files?.sha256 || ''); } catch { throw new Error('Unexpected Open VSX digest URL'); }
  const prefix = `${new URL(base).pathname}/${target === UNIVERSAL ? '' : `${encodeURIComponent(target)}/`}${encodeURIComponent(expected.version)}/file/`;
  if (url.protocol !== 'https:' || url.hostname !== 'open-vsx.org' || url.port || url.username || url.password ||
      url.search || url.hash || !url.pathname.startsWith(prefix) || !url.pathname.endsWith('.sha256')) {
    throw new Error('Unexpected Open VSX digest URL');
  }
  const digest = (await digestResponse(fetcher, url)).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest) || digest !== expected.sha256) throw new Error('Open VSX VSIX SHA-256 differs from the built package');
}

// Limit complete attempts, not just fetch's response headers. Each attempt has
// at most one active request and includes body reads, cancellations and redirects.
function createAttemptLimiter(limit = 3) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid verification concurrency limit');
  let active = 0;
  const queue = [];
  return async task => {
    if (active < limit) active++;
    else await new Promise(resolve => queue.push(resolve));
    try { return await task(); }
    finally {
      if (queue.length) queue.shift()();
      else active--;
    }
  };
}

// Never print third-party messages: even an HTTP failure may contain a secret.
function verificationReason(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout';
  const message = typeof error?.message === 'string' ? error.message : '';
  const http = /^(?:Registry|Open VSX digest) returned HTTP ([1-5][0-9]{2})$/.exec(message);
  if (http) return `http-${http[1][0]}xx`;
  if (/^Marketplace (?:extension identity|exact [a-z0-9-]+ version) missing or ambiguous$/.test(message)) return 'record-missing-or-ambiguous';
  if (message === 'Marketplace version not validated') return 'record-not-validated';
  if (/^Marketplace version is not marked (?:stable|pre-release)$/.test(message) ||
      /^Open VSX exact [a-z0-9-]+ version, target or channel does not match (?:stable|pre-release)$/.test(message)) return 'record-mismatch';
  if (/^(?:Marketplace|Open VSX) VSIX SHA-256 differs from the built package$/.test(message)) return 'digest-mismatch';
  if (/^(?:Too many|Invalid|Unexpected) Open VSX digest redirects?$/.test(message) ||
      message === 'Unexpected Open VSX digest URL') return 'digest-location-rejected';
  return 'other';
}

async function verifyWithRetry(registry, expected, options = {}) {
  const attempts = options.attempts ?? 60;
  const wait = options.wait || options.delay || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const check = options.check || checkRegistry;
  const limit = options.limiter || (task => task());
  const log = options.log || (() => {});
  const now = options.now || (() => performance.now());
  const target = expectedTarget(expected);
  const start = now();
  log(`Verification started for ${registry} ${target}.`);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await limit(() => check(registry, expected));
      log(`Verification completed for ${registry} ${target} after ${attempt} attempt(s), ${(now() - start).toFixed(0)} ms elapsed.`);
      return;
    }
    catch (error) {
      log(`Verification ${registry} ${target} attempt ${attempt}/${attempts} failed: ${verificationReason(error)}.`);
      if (attempt < attempts) await wait(options.intervalMs ?? 10000);
    }
  }
  log(`Verification exhausted for ${registry} ${target} after ${(now() - start).toFixed(0)} ms elapsed.`);
  throw new Error(`Registry verification failed after ${attempts} attempts; publishing may already have occurred: check the exact target and digest before retrying`);
}

async function main() {
  const [registry, filename] = process.argv.slice(2);
  if (!['marketplace', 'open-vsx'].includes(registry) || !filename) throw new Error('Usage: node scripts/verify-published-beta.js <marketplace|open-vsx> <package.vsix>');
  const source = require('../package.json');
  await verifyReleaseChannel(filename, 'pre-release', { id: `${source.publisher}.${source.name}`, version: source.version });
  const expected = { publisher: source.publisher, name: source.name, version: source.version, sha256: crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex') };
  await verifyWithRetry(registry, expected);
  console.log(`Verified ${registry}: ${expected.publisher}.${expected.name} ${expected.version}, universal, pre-release, sha256 ${expected.sha256}.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { marketplaceRecord, checkRegistry, verifyWithRetry, digestResponse, createAttemptLimiter, verificationReason };
