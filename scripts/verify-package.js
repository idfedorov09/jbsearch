'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
// Use the ZIP reader already required by the packaging tool, including when npm
// installs it beneath vsce instead of hoisting it to the root node_modules.
const { fromBuffer } = createRequire(require.resolve('@vscode/vsce'))('yauzl');

async function readArchive(buffer) {
  const archive = await new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (error, zip) => error ? reject(error) : resolve(zip));
  });
  return new Promise((resolve, reject) => {
    const files = new Map();
    const fail = error => { archive.close(); reject(error); };
    archive.once('error', fail);
    archive.once('end', () => resolve(files));
    archive.on('entry', entry => {
      if (files.has(entry.fileName)) return fail(new Error(`Duplicate VSIX entry: ${entry.fileName}`));
      const file = { size: entry.uncompressedSize, mode: entry.externalFileAttributes >>> 16 };
      files.set(entry.fileName, file);
      if (!entry.fileName.endsWith('.json') && !entry.fileName.endsWith('.vsix')) {
        archive.readEntry();
        return;
      }
      archive.openReadStream(entry, (error, stream) => {
        if (error) return fail(error);
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.once('error', fail);
        stream.once('end', () => {
          file.content = Buffer.concat(chunks);
          archive.readEntry();
        });
      });
    });
    archive.readEntry();
  });
}

function requireFile(files, name) {
  const file = files.get(name);
  if (!file || !file.size) throw new Error(`Packaged runtime file is missing or empty: ${name}`);
  return file;
}

function readJson(files, name) {
  return JSON.parse(requireFile(files, name).content.toString('utf8'));
}

function checkDependencies(files, manifest) {
  const versions = {};
  for (const [name, expected] of Object.entries(manifest.dependencies)) {
    const prefix = `extension/node_modules/${name}/`;
    const dependency = readJson(files, prefix + 'package.json');
    if (dependency.version !== expected) throw new Error(`Packaged ${name} must be ${expected}; found ${dependency.version}`);
    requireFile(files, path.posix.normalize(prefix + dependency.main));
    versions[name] = dependency.version;
  }
  return versions;
}

async function verifyPackage(filename) {
  const root = path.resolve(__dirname, '..');
  const source = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const clientSource = JSON.parse(await fs.readFile(path.join(root, 'client', 'package.json'), 'utf8'));
  const packagePath = path.resolve(filename || path.join(root, `${source.name}-${source.version}.vsix`));
  const bytes = await fs.readFile(packagePath);
  const files = await readArchive(bytes);
  const manifest = readJson(files, 'extension/package.json');
  const expectedId = `${source.publisher}.${source.name}`;
  if (`${manifest.publisher}.${manifest.name}` !== expectedId || manifest.version !== source.version)
    throw new Error('Packaged main extension identity/version differs from package.json');
  if (!manifest.extensionKind.includes('workspace')) throw new Error('Main extension must run on the workspace host');
  requireFile(files, 'extension/' + path.posix.normalize(manifest.main));
  for (const resource of [
    'src/controller.js', 'src/search/worker.js', 'src/preview.js', 'src/client-preview.js',
    'src/find-results.js', 'src/find-preview.js', 'src/find-tree.js',
    'media/search.js', 'media/search.css',
    'node_modules/vscode-oniguruma/release/onig.wasm'
  ])
    requireFile(files, 'extension/' + resource);
  if (!manifest.contributes.viewsContainers?.panel?.some(view => view.id === 'jbsearch-find') ||
      !manifest.contributes.views?.['jbsearch-find']?.some(view => view.id === 'jbsearch.results'))
    throw new Error('Packaged extension must contribute the native Find panel');
  for (const obsolete of ['src/ui/find-window.js', 'media/find-window.js', 'media/find-window.css'])
    if (files.has('extension/' + obsolete)) throw new Error(`Obsolete Find renderer is packaged: ${obsolete}`);
  const dependencies = checkDependencies(files, manifest);
  const rgPlatforms = ['linux-arm', 'linux-arm64', 'linux-ia32', 'linux-ppc64', 'linux-riscv64', 'linux-s390x', 'linux-x64', 'darwin-arm64', 'darwin-x64', 'win32-arm64', 'win32-ia32', 'win32-x64'];
  for (const platform of rgPlatforms) {
    const executable = requireFile(files, `extension/node_modules/@vscode/ripgrep-universal/bin/${platform}/rg${platform.startsWith('win32-') ? '.exe' : ''}`);
    if (!platform.startsWith('win32-') && !(executable.mode & 0o111))
      throw new Error(`Packaged ripgrep is not executable for ${platform}`);
  }
  const metadata = readJson(files, 'extension/bundled/client.json');
  const nestedBytes = requireFile(files, 'extension/bundled/jbsearch-client.vsix').content;
  if (!nestedBytes.equals(await fs.readFile(path.join(root, 'bundled', 'jbsearch-client.vsix'))))
    throw new Error('Packaged client VSIX differs from the prepared bundled client');
  const clientFiles = await readArchive(nestedBytes);
  const client = readJson(clientFiles, 'extension/package.json');
  const clientId = `${client.publisher}.${client.name}`;
  if (clientId !== `${clientSource.publisher}.${clientSource.name}` || client.version !== clientSource.version)
    throw new Error('Packaged client extension identity/version differs from client/package.json');
  if (client.extensionKind.length !== 1 || client.extensionKind[0] !== 'ui')
    throw new Error('Bundled client extension must run on the UI host');
  if (metadata.protocol !== 1 || metadata.version !== client.version || metadata.build !== client.jbsearchClientBuild)
    throw new Error('Bundled client metadata does not match the nested VSIX');
  requireFile(clientFiles, 'extension/' + path.posix.normalize(client.main));
  requireFile(clientFiles, 'extension/resources.js');
  const clientDependencies = checkDependencies(clientFiles, client);
  return {
    checkedAt: new Date().toISOString(),
    package: path.basename(packagePath),
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    main: { id: expectedId, version: manifest.version, files: files.size, dependencies, ripgrepPlatforms: rgPlatforms },
    client: { id: clientId, version: client.version, build: metadata.build, size: nestedBytes.length, files: clientFiles.size, dependencies: clientDependencies },
    passed: true
  };
}

if (require.main === module) {
  verifyPackage(process.argv[2]).then(result => {
    console.log(`Verified ${result.package}: ${result.main.files} entries, bundled ${result.client.id} (${result.client.files} entries), matching build and runtime resources.`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { verifyPackage };
