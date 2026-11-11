'use strict';

const { readVSIXPackage } = require('@vscode/vsce/out/zip');

async function verifyReleaseChannel(filename, expected, identity) {
  if (!['stable', 'pre-release'].includes(expected)) throw new Error('Expected channel must be stable or pre-release');
  const { manifest, xmlManifest } = await readVSIXPackage(filename);
  const metadataNodes = xmlManifest.PackageManifest?.Metadata;
  if (!Array.isArray(metadataNodes) || metadataNodes.length !== 1)
    throw new Error('VSIX must contain exactly one Metadata element');
  const metadata = metadataNodes[0];
  if (!Array.isArray(metadata.Identity) || metadata.Identity.length !== 1)
    throw new Error('VSIX must contain exactly one Identity element');
  if (!Array.isArray(metadata.Properties) || metadata.Properties.length !== 1)
    throw new Error('VSIX must contain exactly one Properties element');
  const xmlIdentity = metadata.Identity[0].$;
  const properties = metadata.Properties[0].Property || [];
  const markers = properties.filter(property => property.$?.Id === 'Microsoft.VisualStudio.Code.PreRelease');
  const id = `${manifest.publisher}.${manifest.name}`;
  if (id !== identity.id || manifest.version !== identity.version ||
      xmlIdentity?.Publisher !== manifest.publisher || xmlIdentity?.Id !== manifest.name ||
      xmlIdentity?.Version !== manifest.version) {
    throw new Error('VSIX identity or version does not match the intended release');
  }
  if (expected === 'pre-release' && (markers.length !== 1 || markers[0].$.Value !== 'true')) {
    throw new Error('VSIX must contain exactly one true pre-release marker');
  }
  if (expected === 'stable' && markers.length !== 0) {
    throw new Error('Stable VSIX must not contain a pre-release marker');
  }
  return { id, version: manifest.version, channel: expected };
}

if (require.main === module) {
  const [channel, suppliedFilename] = process.argv.slice(2);
  if (!['stable', 'pre-release'].includes(channel)) {
    console.error('Usage: node scripts/verify-release-channel.js <stable|pre-release> [package.vsix]');
    process.exitCode = 1;
  } else {
    const source = require('../package.json');
    const filename = suppliedFilename || `${source.name}-${source.version}.vsix`;
    verifyReleaseChannel(filename, channel, { id: `${source.publisher}.${source.name}`, version: source.version })
      .then(result => console.log(`Verified ${result.id} ${result.version} as ${result.channel}.`))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

module.exports = { verifyReleaseChannel };
