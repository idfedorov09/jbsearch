'use strict';

const path = require('node:path');
const { TARGETS, UNIVERSAL } = require('./package-targets');
const { outputName } = require('./package-platforms');

// The vsce CLI suppresses certain cancellation errors with exit code zero.
// Its public API instead rejects, so acknowledge only a resolved publication.
async function publishPackage(file, channel, publish = require('@vscode/vsce').publishVSIX) {
  const manifest = require('../package.json');
  const names = new Set([UNIVERSAL, ...TARGETS].map(target => outputName(manifest, target)));
  if (require('@vscode/vsce/package.json').version !== '4.1.0' ||
      typeof file !== 'string' || !names.has(path.basename(file)) ||
      !['stable', 'pre-release'].includes(channel)) throw new Error('Invalid Marketplace invocation');
  await publish(file, { oidc: true, preRelease: channel === 'pre-release', skipDuplicate: false });
}

async function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || typeof process.send !== 'function') throw new Error('Invalid publisher process');
  await publishPackage(args[0], args[1]);
  await new Promise((resolve, reject) => process.send('accepted', error => error ? reject(error) : resolve()));
  process.disconnect();
}

if (require.main === module) main().catch(() => {
  process.stderr.write('Marketplace publication failed; details withheld.\n');
  process.exitCode = 1;
});
module.exports = { publishPackage, main };
