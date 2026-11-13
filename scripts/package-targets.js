'use strict';

// VSIX target names match the corresponding Node platform/architecture paths.
const TARGETS = Object.freeze([
  'win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64'
]);
const RIPGREP_PLATFORMS = Object.freeze([
  'linux-arm', 'linux-arm64', 'linux-ia32', 'linux-ppc64', 'linux-riscv64',
  'linux-s390x', 'linux-x64', 'darwin-arm64', 'darwin-x64', 'win32-arm64',
  'win32-ia32', 'win32-x64'
]);
const UNIVERSAL = 'universal';

function validateTarget(target) {
  if (target !== UNIVERSAL && !TARGETS.includes(target))
    throw new Error(`Unsupported package target: ${target}`);
  return target;
}

function ripgrepPath(platform) {
  if (!RIPGREP_PLATFORMS.includes(platform))
    throw new Error(`Unsupported ripgrep platform: ${platform}`);
  return `node_modules/@vscode/ripgrep-universal/bin/${platform}/rg${platform.startsWith('win32-') ? '.exe' : ''}`;
}

module.exports = { TARGETS, RIPGREP_PLATFORMS, UNIVERSAL, validateTarget, ripgrepPath };
