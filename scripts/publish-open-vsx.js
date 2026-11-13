'use strict';

const path = require('node:path');
const { installRequestGuard } = require('./guard-open-vsx-http');
const { TARGETS, UNIVERSAL } = require('./package-targets');
const { outputName } = require('./package-platforms');

// Production always uses this origin. The test harness supplies loopback directly
// to this exported function; no environment variable or CLI flag can change it.
function runCli({ registry = 'https://open-vsx.org', args = process.argv.slice(2), allowLoopback = false } = {}) {
  const failure = 'Open VSX publication failed; details withheld to protect credentials.\n';
  try {
    const manifest = require('../package.json');
    const allowedPackages = new Set([`${manifest.name}-${manifest.version}.vsix`,
      ...[UNIVERSAL, ...TARGETS].map(target => outputName(manifest, target))]);
    if (require('ovsx/package.json').version !== '1.3.0' || !process.env.OVSX_PAT ||
        args.length < 1 || args.length > 2 || args.some(arg => typeof arg !== 'string' || arg.includes(process.env.OVSX_PAT)) ||
        !allowedPackages.has(path.basename(args[0])) ||
        (args.length === 2 && args[1] !== '--skip-duplicate')) throw new Error('Invalid publication invocation');
    installRequestGuard({ origin: registry, allowLoopback, secret: process.env.OVSX_PAT });
    const entry = require.resolve('ovsx/bin/ovsx');
    // Registry messages may echo credentials or raw URLs; never print them.
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    process.on('uncaughtException', () => { process.stderr.write(failure); process.exit(1); });
    process.on('unhandledRejection', () => { process.stderr.write(failure); process.exit(1); });
    process.on('exit', code => {
      if (code === 0) process.stdout.write('Open VSX CLI completed; verify the exact registry version separately.\n');
      else process.stderr.write(failure);
    });
    process.argv = [process.execPath, entry, '--registryUrl', registry, 'publish', ...args];
    require(entry);
  } catch {
    process.stderr.write(failure);
    process.exitCode = 1;
  }
}
if (require.main === module) runCli();
module.exports = { runCli };
