'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { parseXmlManifest } = require('@vscode/vsce/out/xml');
const { RIPGREP_PLATFORMS, UNIVERSAL, validateTarget, ripgrepPath } = require('./package-targets');
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
      const capture = entry.fileName.endsWith('.json') || entry.fileName.endsWith('.vsix') ||
        entry.fileName.endsWith('.png') || entry.fileName === 'extension/readme.md' ||
        entry.fileName === 'extension.vsixmanifest';
      const binary = entry.fileName.startsWith('extension/node_modules/@vscode/ripgrep-universal/bin/') &&
        !entry.fileName.endsWith('/');
      if (!capture && !binary) {
        archive.readEntry();
        return;
      }
      archive.openReadStream(entry, (error, stream) => {
        if (error) return fail(error);
        const chunks = [];
        const hash = binary ? crypto.createHash('sha256') : undefined;
        stream.on('data', chunk => {
          if (capture) chunks.push(chunk);
          hash?.update(chunk);
        });
        stream.once('error', fail);
        stream.once('end', () => {
          if (capture) file.content = Buffer.concat(chunks);
          if (hash) file.sha256 = hash.digest('hex');
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

function checkDependencies(files, manifest, source) {
  const versions = {};
  const expectedDependencies = source.dependencies || {};
  const actualDependencies = manifest.dependencies || {};
  const expectedNames = Object.keys(expectedDependencies).sort();
  const actualNames = Object.keys(actualDependencies).sort();
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames) ||
      expectedNames.some(name => expectedDependencies[name] !== actualDependencies[name]))
    throw new Error('Packaged dependency declarations differ from the source manifest');
  for (const [name, expected] of Object.entries(actualDependencies)) {
    const prefix = `extension/node_modules/${name}/`;
    const dependency = readJson(files, prefix + 'package.json');
    if (dependency.version !== expected) throw new Error(`Packaged ${name} must be ${expected}; found ${dependency.version}`);
    requireFile(files, path.posix.normalize(prefix + dependency.main));
    versions[name] = dependency.version;
  }
  return versions;
}

async function checkReadme(files, root) {
  if ([...files.keys()].some(name => name.startsWith('extension/images/')))
    throw new Error('Demonstration images must not be included in the VSIX');
  const source = await fs.readFile(path.join(root, 'README.md'), 'utf8');
  const packaged = requireFile(files, 'extension/readme.md').content.toString('utf8');
  const references = [...source.matchAll(/!\[[^\]]*\]\((images\/[^\s)]+)(?:\s+[^)]*)?\)/g)].map(match => match[1]);
  if (!references.length) throw new Error('Source README contains no demonstration image references');
  const urls = [...packaged.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)(?:\s+[^)]*)?\)/g)].map(match => match[1]);
  for (const reference of references) {
    await fs.access(path.join(root, reference));
    if (!urls.some(value => {
      try { return new URL(value).pathname.endsWith('/' + reference); } catch { return false; }
    })) throw new Error(`Packaged README lacks an HTTPS reference to ${reference}`);
  }
}

async function checkRipgrep(files, root, target) {
  const platforms = target === UNIVERSAL ? RIPGREP_PLATFORMS : [target];
  const expected = platforms.map(platform => `extension/${ripgrepPath(platform)}`);
  const prefix = 'extension/node_modules/@vscode/ripgrep-universal/bin/';
  const actual = [...files.keys()].filter(name => name.startsWith(prefix) && !name.endsWith('/'));
  if (actual.length !== expected.length || actual.some(name => !expected.includes(name)))
    throw new Error(`Packaged ripgrep inventory does not match ${target}`);
  for (const platform of platforms) {
    const relative = ripgrepPath(platform);
    const executable = requireFile(files, `extension/${relative}`);
    if (!platform.startsWith('win32-') && !(executable.mode & 0o111))
      throw new Error(`Packaged ripgrep is not executable for ${platform}`);
    const source = await fs.readFile(path.join(root, relative));
    if (executable.sha256 !== crypto.createHash('sha256').update(source).digest('hex'))
      throw new Error(`Packaged ripgrep differs from the installed dependency for ${platform}`);
  }
  return [...platforms];
}

async function verifyPackage(filename, options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const target = validateTarget(options.target ?? UNIVERSAL);
  const source = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const clientSource = JSON.parse(await fs.readFile(path.join(root, 'client', 'package.json'), 'utf8'));
  const packagePath = path.resolve(filename || path.join(root, `${source.name}-${source.version}.vsix`));
  const bytes = await fs.readFile(packagePath);
  const files = await readArchive(bytes);
  const manifest = readJson(files, 'extension/package.json');
  const expectedId = `${source.publisher}.${source.name}`;
  if (`${manifest.publisher}.${manifest.name}` !== expectedId || manifest.version !== source.version)
    throw new Error('Packaged main extension identity/version differs from package.json');
  if (manifest.main !== source.main) throw new Error('Packaged entry point differs from package.json');
  const xml = await parseXmlManifest(requireFile(files, 'extension.vsixmanifest').content.toString('utf8'));
  const metadataNodes = xml.PackageManifest?.Metadata;
  const identities = metadataNodes?.length === 1 ? metadataNodes[0].Identity : undefined;
  if (!Array.isArray(identities) || identities.length !== 1)
    throw new Error('VSIX must contain exactly one outer identity');
  const identity = identities[0].$ || {};
  if (identity.Publisher !== source.publisher || identity.Id !== source.name || identity.Version !== source.version)
    throw new Error('Outer VSIX identity/version differs from package.json');
  if ((target === UNIVERSAL && identity.TargetPlatform !== undefined) ||
      (target !== UNIVERSAL && identity.TargetPlatform !== target))
    throw new Error(`Outer VSIX target does not match ${target}`);
  if (!manifest.extensionKind.includes('workspace')) throw new Error('Main extension must run on the workspace host');
  if (typeof manifest.icon !== 'string' || manifest.icon !== source.icon || !manifest.icon.endsWith('.png'))
    throw new Error('Packaged extension icon differs from package.json');
  const iconBytes = requireFile(files, 'extension/' + manifest.icon).content;
  if (iconBytes.length < 33 || !iconBytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      iconBytes.toString('ascii', 12, 16) !== 'IHDR')
    throw new Error('Packaged extension icon must be a PNG');
  const iconWidth = iconBytes.readUInt32BE(16), iconHeight = iconBytes.readUInt32BE(20);
  if (iconWidth < 128 || iconWidth !== iconHeight)
    throw new Error('Packaged extension icon must be square and at least 128x128');
  if (!iconBytes.equals(await fs.readFile(path.join(root, source.icon))))
    throw new Error('Packaged extension icon differs from the source asset');
  requireFile(files, 'extension/' + path.posix.normalize(manifest.main));
  for (const resource of [
    'src/controller.js', 'src/search/index.js', 'src/search/worker.js', 'src/search/matcher.js',
    'src/search/zip.js', 'src/search/binary.js', 'src/search/diagnostics.js', 'src/preview.js', 'src/client-preview.js',
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
  await checkReadme(files, root);
  const dependencies = checkDependencies(files, manifest, source);
  const rgPlatforms = await checkRipgrep(files, root, target);
  const metadata = readJson(files, 'extension/bundled/client.json');
  const nestedBytes = requireFile(files, 'extension/bundled/jbsearch-client.vsix').content;
  if (!nestedBytes.equals(await fs.readFile(path.join(root, 'bundled', 'jbsearch-client.vsix'))))
    throw new Error('Packaged client VSIX differs from the prepared bundled client');
  const clientFiles = await readArchive(nestedBytes);
  const client = readJson(clientFiles, 'extension/package.json');
  const clientId = `${client.publisher}.${client.name}`;
  if (clientId !== `${clientSource.publisher}.${clientSource.name}` || client.version !== clientSource.version)
    throw new Error('Packaged client extension identity/version differs from client/package.json');
  if (client.main !== clientSource.main) throw new Error('Packaged client entry point differs from client/package.json');
  if (client.extensionKind.length !== 1 || client.extensionKind[0] !== 'ui')
    throw new Error('Bundled client extension must run on the UI host');
  if (metadata.protocol !== 1 || metadata.version !== client.version || metadata.build !== client.jbsearchClientBuild)
    throw new Error('Bundled client metadata does not match the nested VSIX');
  requireFile(clientFiles, 'extension/' + path.posix.normalize(client.main));
  requireFile(clientFiles, 'extension/resources.js');
  const clientDependencies = checkDependencies(clientFiles, client, clientSource);
  return {
    checkedAt: new Date().toISOString(),
    package: path.basename(packagePath),
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    main: {
      id: expectedId, version: manifest.version, files: files.size,
      icon: { path: manifest.icon, width: iconWidth, height: iconHeight, sha256: crypto.createHash('sha256').update(iconBytes).digest('hex') },
      dependencies, target, ripgrepPlatforms: rgPlatforms
    },
    client: { id: clientId, version: client.version, build: metadata.build, size: nestedBytes.length, files: clientFiles.size, dependencies: clientDependencies },
    passed: true
  };
}

if (require.main === module) {
  const [filename, target] = process.argv.slice(2);
  verifyPackage(filename, { target }).then(result => {
    console.log(`Verified ${result.package}: ${result.main.files} entries, bundled ${result.client.id} (${result.client.files} entries), matching build and runtime resources.`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { verifyPackage, readArchive, checkReadme, checkRipgrep };
