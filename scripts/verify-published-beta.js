'use strict';

const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { verifyReleaseChannel } = require('./verify-release-channel');

function marketplaceRecord(body, expected) {
  const matches = (body.results || []).flatMap(result => result.extensions || [])
    .filter(ext => ext.publisher?.publisherName === expected.publisher && ext.extensionName === expected.name);
  if (matches.length !== 1) throw new Error('Marketplace extension identity missing or ambiguous');
  const versions = (matches[0].versions || []).filter(v => v.version === expected.version && (!v.targetPlatform || v.targetPlatform === 'universal'));
  if (versions.length !== 1) throw new Error('Marketplace exact universal version missing or ambiguous');
  const release = versions[0];
  if (!String(release.flags || '').split(',').map(s => s.trim()).includes('validated')) throw new Error('Marketplace version not validated');
  const values = key => (release.properties || []).filter(p => p.key === key).map(p => p.value);
  const markers = values('Microsoft.VisualStudio.Code.PreRelease');
  const hashes = values('Microsoft.VisualStudio.Services.VsixSha256');
  if (markers.length !== 1 || markers[0] !== 'true') throw new Error('Marketplace version is not marked pre-release');
  if (hashes.length !== 1 || String(hashes[0]).toLowerCase() !== expected.sha256) throw new Error('Marketplace VSIX SHA-256 differs from the built package');
}

async function responseJson(fetcher, url, options) {
  const response = await fetcher(url, options);
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
  return response.json();
}

async function checkRegistry(registry, expected, fetcher = fetch) {
  if (registry === 'marketplace') {
    const body = await responseJson(fetcher, 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=7.2-preview.1' },
      body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: `${expected.publisher}.${expected.name}` }], pageNumber: 1, pageSize: 100 }], flags: 147 }),
      signal: AbortSignal.timeout(30000),
    });
    marketplaceRecord(body, expected);
    return;
  }
  if (registry !== 'open-vsx') throw new Error('Unknown registry');
  const prefix = `https://open-vsx.org/api/${encodeURIComponent(expected.publisher)}/${encodeURIComponent(expected.name)}/${encodeURIComponent(expected.version)}`;
  const release = await responseJson(fetcher, `${prefix}?verify=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
  if (release.namespace !== expected.publisher || release.name !== expected.name || release.version !== expected.version || release.preRelease !== true) {
    throw new Error('Open VSX exact version is missing or is not marked pre-release');
  }
  const url = new URL(release.files?.sha256 || '');
  if (url.protocol !== 'https:' || url.hostname !== 'open-vsx.org' || url.username || url.password || !url.pathname.startsWith(`${new URL(prefix).pathname}/file/`)) {
    throw new Error('Unexpected Open VSX digest URL');
  }
  const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Open VSX digest returned HTTP ${response.status}`);
  const digest = (await response.text()).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest) || digest !== expected.sha256) throw new Error('Open VSX VSIX SHA-256 differs from the built package');
}

async function main() {
  const [registry, filename] = process.argv.slice(2);
  if (!['marketplace', 'open-vsx'].includes(registry) || !filename) throw new Error('Usage: node scripts/verify-published-beta.js <marketplace|open-vsx> <package.vsix>');
  const source = require('../package.json');
  await verifyReleaseChannel(filename, 'pre-release', { id: `${source.publisher}.${source.name}`, version: source.version });
  const expected = { publisher: source.publisher, name: source.name, version: source.version, sha256: crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex') };
  let last;
  for (let attempt = 1; attempt <= 18; attempt++) {
    try {
      await checkRegistry(registry, expected);
      console.log(`Verified ${registry}: ${expected.publisher}.${expected.name} ${expected.version}, pre-release, sha256 ${expected.sha256}.`);
      return;
    } catch (error) {
      last = error;
      if (attempt < 18) await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  throw new Error(`Registry verification failed after 18 attempts; publishing may already have occurred: ${last.message}`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { marketplaceRecord, checkRegistry };
