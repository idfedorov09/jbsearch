'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { TARGETS, RIPGREP_PLATFORMS, UNIVERSAL, validateTarget } = require('./package-targets');
const { verifyPackage } = require('./verify-package');
const { verifyReleaseChannel } = require('./verify-release-channel');

function outputName(manifest, target) {
  validateTarget(target);
  return `${manifest.name}-${manifest.version}-${target}.vsix`;
}

function ignoreRules(base, target) {
  validateTarget(target);
  const exclusions = target === UNIVERSAL ? [] : RIPGREP_PLATFORMS
    .filter(platform => platform !== target)
    .map(platform => `node_modules/@vscode/ripgrep-universal/bin/${platform}/**`);
  return `${base.trimEnd()}\n${exclusions.join('\n')}\n`;
}

function vsceArguments({ executable, output, target, preRelease, ignoreFile }) {
  validateTarget(target);
  const args = [executable, 'package', '--out', output];
  if (target !== UNIVERSAL) {
    if (!ignoreFile) throw new Error('Platform packaging requires a temporary ignore file');
    args.push('--target', target, '--ignoreFile', ignoreFile);
  }
  if (preRelease) args.push('--pre-release');
  return args;
}

function runVsce({ root, output, target, preRelease, ignoreFile }) {
  const executable = path.join(path.dirname(require.resolve('@vscode/vsce/package.json')), 'vsce');
  const args = vsceArguments({ executable, output, target, preRelease, ignoreFile });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`vsce failed for ${target}: ${signal || `exit ${code}`}`));
    });
  });
}

async function buildPackages(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const target = options.target === undefined ? undefined : validateTarget(options.target);
  const targets = target ? [target] : [...TARGETS, UNIVERSAL];
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const baseIgnore = await fs.readFile(path.join(root, '.vscodeignore'), 'utf8');
  const channel = options.preRelease ? 'pre-release' : 'stable';
  const outputDir = options.outputDir ? path.resolve(options.outputDir) :
    await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-vsix-output-'));
  await fs.mkdir(outputDir, { recursive: true });
  if (await fs.realpath(outputDir) === await fs.realpath(root))
    throw new Error('Matrix output must not be the repository root used by publication globs');
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-vsix-stage-'));
  const run = options.runVsce || runVsce;
  const inspect = options.verifyPackage || verifyPackage;
  const inspectChannel = options.verifyReleaseChannel || verifyReleaseChannel;
  const created = [];
  try {
    const staged = [];
    for (const current of targets) {
      const filename = outputName(manifest, current);
      const temporary = path.join(staging, filename);
      const ignoreFile = path.join(staging, `${current}.ignore`);
      if (current !== UNIVERSAL) await fs.writeFile(ignoreFile, ignoreRules(baseIgnore, current));
      await run({ root, output: temporary, target: current, preRelease: !!options.preRelease, ignoreFile });
      const verified = await inspect(temporary, { root, target: current });
      await inspectChannel(temporary, channel, { id: `${manifest.publisher}.${manifest.name}`, version: manifest.version });
      const { size } = await fs.stat(temporary);
      staged.push({ target: current, filename, temporary, size, sha256: verified.sha256 });
    }
    const fallback = staged.find(item => item.target === UNIVERSAL);
    if (fallback && staged.some(item => item.target !== UNIVERSAL && item.size >= fallback.size))
      throw new Error('Every platform package must be smaller than the universal package');
    for (const item of staged) {
      const destination = path.join(outputDir, item.filename);
      await fs.copyFile(item.temporary, destination, constants.COPYFILE_EXCL);
      created.push(destination);
      item.file = destination;
      delete item.temporary;
    }
    return { channel, id: `${manifest.publisher}.${manifest.name}`, version: manifest.version,
      outputDir, packages: staged.map(({ filename, ...item }) => ({ ...item, verified: true })) };
  } catch (error) {
    await Promise.all(created.map(file => fs.rm(file, { force: true })));
    throw error;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

function parseOptions(args) {
  const { values } = parseArgs({ args, strict: true, options: {
    target: { type: 'string' }, 'out-dir': { type: 'string' },
    'pre-release': { type: 'boolean', default: false }
  } });
  if (values.target !== undefined) validateTarget(values.target);
  if (values['out-dir'] === '') throw new Error('Output directory must not be empty');
  return { target: values.target, outputDir: values['out-dir'], preRelease: values['pre-release'] };
}

if (require.main === module) {
  Promise.resolve().then(() => buildPackages(parseOptions(process.argv.slice(2))))
    .then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { outputName, ignoreRules, vsceArguments, runVsce, buildPackages, parseOptions };
