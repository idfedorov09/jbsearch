'use strict';

const fs = require('node:fs/promises');
const { constants: fsConstants } = require('node:fs');
const { createHash } = require('node:crypto');
const { contentHash: hashText } = require('../content-hash');
const { readStableDiskBaseline, losslessDecoder, supportedEncodings } = require('../disk-baseline');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { spawn } = require('node:child_process');
const { parentPort, workerData } = require('node:worker_threads');
const { acceptsFile, iterateMatches, isPathWithin, splitPatterns } = require('./matcher');
const { isConfirmedZip } = require('./zip');
const { PROBE_BYTES, classifyBytes } = require('./binary');

const { request, rgPath, batchSize } = workerData;
const stats = {
  filesScanned: 0,
  filesMatched: 0,
  matches: 0,
  skippedFiles: 0,
  skipped: { tooLarge: 0, binary: 0, encoding: 0, unreadable: 0 },
  excludedBinaryFiles: 0,
  blockingSkippedFiles: 0,
  skippedDetails: [],
  skippedDetailsOmitted: 0,
  errors: [],
  cancelled: false,
  timedOut: false
};
let cancelled = false;
let limit = false;
let cancelReason;
let child;
let batch = [];
const maxBytes = request.maxFileSizeMiB * 1024 * 1024;
const seen = new Set();
const snapshots = new Map();
const cleanDocuments = new Map();
// TextDocument.getText() excludes the encoding BOM; strip UTF-8 BOMs here too so
// disk positions agree with VS Code and a later dirty snapshot of the same file.
const decoder = new TextDecoder('utf-8', { fatal: true });

parentPort.on('message', (message) => {
  if (message.type === 'cancel') {
    cancelled = true;
    cancelReason = message.reason;
    stats.cancelled = message.reason === 'cancelled';
    stats.timedOut = message.reason === 'timeout';
    child?.kill();
  }
});

function normalizeRoot(root) {
  const rootPath =
    typeof root === 'string'
      ? root
      : root.fsPath ||
        root.path ||
        (root.uri?.startsWith('file:') ? fileURLToPath(root.uri) : undefined);
  if (!rootPath) return undefined;
  return {
    ...(typeof root === 'object' ? root : {}),
    path: path.resolve(rootPath),
    name: root.name || path.basename(rootPath)
  };
}

const roots = request.roots.map(normalizeRoot).filter(Boolean);

function documentPath(document) {
  return (
    document.fsPath ||
    document.path ||
    (document.uri?.startsWith('file:') ? fileURLToPath(document.uri) : undefined)
  );
}

for (const document of request.documents) {
  const filePath = documentPath(document);
  if (filePath && document.isDirty === false) cleanDocuments.set(path.resolve(filePath), document);
  if (filePath && (document.isDirty !== false ||
      (request.scope?.kind === 'openEditors' && request.sourcePolicy !== 'disk-clean-buffers-dirty')))
    snapshots.set(path.resolve(filePath), document);
}

function flush() {
  if (!batch.length) return;
  parentPort.postMessage({ type: 'batch', results: batch, stats });
  batch = [];
}

const MAX_SKIP_DETAILS = 20;

function skip(reason, filePath, { error, root, metadata, blocking = true, format, kind } = {}) {
  stats.skippedFiles += 1;
  stats.skipped[reason] += 1;
  if (blocking) stats.blockingSkippedFiles += 1;
  else stats.excludedBinaryFiles += 1;
  const detail = {
    path: filePath || metadata?.uri || metadata?.relativePath || 'Untitled',
    relativePath: metadata?.relativePath || (filePath && root ? path.relative(root.path, filePath).replace(/\\/g, '/') : ''),
    rootName: metadata?.rootName || root?.name || '',
    rootPath: metadata?.rootPath || root?.path || '',
    reason,
    blocking,
    ...(format ? { format } : {}),
    ...(kind ? { kind } : {})
  };
  if (stats.skippedDetails.length < MAX_SKIP_DETAILS) stats.skippedDetails.push(detail);
  else {
    // Do not let numerous deliberately excluded archives hide every blocker.
    const replace = blocking ? stats.skippedDetails.findIndex(item => !item.blocking) : -1;
    if (replace !== -1) stats.skippedDetails[replace] = detail;
    stats.skippedDetailsOmitted += 1;
  }
  if (error && stats.errors.length < 20)
    stats.errors.push({ path: filePath, message: error.message || String(error) });
}

function rootFor(filePath) {
  return roots
    .filter((root) => isPathWithin(filePath, root.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

function scopeRootFor(filePath) {
  if (request.scope?.kind === 'folder')
    return roots.find(root => insideScope(filePath, root) && isPathWithin(filePath, root.path));
  return rootFor(filePath);
}

function insideScope(filePath, root) {
  const scope = request.scope || { kind: 'workspace' };
  if (scope.kind === 'openEditors') return true;
  if (!root) return false;
  if (scope.kind === 'folder') {
    const selected = scope.rootPath || scope.path || scope.folder || scope.rootUri;
    if (selected) {
      const selectedPath = String(selected).startsWith('file:')
        ? fileURLToPath(selected)
        : selected;
      return path.resolve(root.path) === path.resolve(selectedPath);
    }
    if (typeof scope.rootIndex === 'number') return roots.indexOf(root) === scope.rootIndex;
  }
  if (scope.kind === 'directory') {
    const directory = scope.directory || scope.path;
    if (!directory) return false;
    const resolved = path.isAbsolute(directory) ? directory : path.resolve(root.path, directory);
    return isPathWithin(filePath, resolved);
  }
  return true;
}

async function scanText(text, metadata) {
  if (cancelled || limit) return;
  // Editor snapshots are already decoded by VS Code, but a literal NUL is
  // still the binary signal and must not be fed to the text matcher.
  if (text.includes('\0')) {
    skip('binary', metadata.fsPath, { metadata, blocking: false, format: 'binary' });
    return;
  }
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    skip('tooLarge', metadata.fsPath, { metadata });
    return;
  }
  stats.filesScanned += 1;
  let fileMatched = false;
  const contentHash = hashText(text);
  for (const match of iterateMatches(text, request, { ...metadata, contentHash })) {
    if (cancelled) break;
    // One extra match distinguishes an exact total from a truncated result set.
    if (stats.matches >= request.maxResults) {
      limit = true;
      child?.kill();
      break;
    }
    if (!fileMatched) {
      stats.filesMatched += 1;
      fileMatched = true;
    }
    stats.matches += 1;
    batch.push(match);
    if (batch.length >= batchSize) flush();
    if (stats.matches % 100 === 0) await new Promise((resolve) => setImmediate(resolve));
  }
  if (stats.filesScanned % 100 === 0) {
    parentPort.postMessage({ type: 'progress', stats });
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function conditionalExcluded(filePath, root) {
  if (request.respectExcludes === false || !filePath || !root) return false;
  const relativePath = path.relative(root.path, filePath).replace(/\\/g, '/');
  const basename = path.basename(filePath, path.extname(filePath));
  for (const [pattern, rule] of Object.entries(root.exclude || {})) {
    if (!rule || typeof rule !== 'object' || typeof rule.when !== 'string') continue;
    if (!require('./matcher').matchesPatterns(relativePath, [pattern])) continue;
    const sibling = path.resolve(
      path.dirname(filePath),
      rule.when.replaceAll('$(basename)', basename)
    );
    if (!isPathWithin(sibling, root.path)) continue;
    try {
      if ((await fs.stat(sibling)).isFile()) return true;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      /* Missing sibling. Other failures leave the exclusion uncertain. */
    }
  }
  return false;
}

async function scanDocument(document, root, filePath) {
  const relativePath =
    filePath && root
      ? path.relative(root.path, filePath).replace(/\\/g, '/')
      : document.displayName || document.name || document.uri || 'Untitled';
  if (
    !insideScope(filePath, root) ||
    !acceptsFile(relativePath, request, root) ||
    (await conditionalExcluded(filePath, root))
  )
    return;
  if (document.snapshotUnavailable) {
    skip(/size limit/.test(document.snapshotUnavailable) ? 'tooLarge' : 'unreadable', filePath,
      { root, metadata: document, error: new Error(document.snapshotUnavailable) });
    return;
  }
  let diskBaseline, diskBaselineUnavailable;
  if (filePath && request.sourcePolicy === 'disk-clean-buffers-dirty') {
    try {
      // Dirty buffer authority and disk overwrite protection are independent.
      // Do not compare the dirty text with the backing file's bytes.
      diskBaseline = Object.freeze({ ...await readStableDiskBaseline({ fsPath: filePath },
        { maxBytes, linkPolicy: 'identity-validated' }), uri: document.uri || pathToFileURL(filePath).toString() });
    } catch (error) {
      diskBaselineUnavailable = `Cannot verify the source disk baseline: ${error.message}`;
      skip(/size limit/.test(error.message) ? 'tooLarge' : 'unreadable', filePath, { root, error });
    }
  }
  await scanText(String(document.text || ''), {
    uri: document.uri || pathToFileURL(filePath).toString(),
    fsPath: filePath,
    relativePath,
    label: path.basename(relativePath),
    rootName: root?.name || '',
    rootPath: root?.path || '',
    version: document.version,
    documentVersion: document.version,
    languageId: document.languageId,
    source: 'snapshot',
    ...(diskBaseline ? { diskBaseline } : {}),
    ...(diskBaselineUnavailable ? { diskBaselineUnavailable,
      invalid: true, unavailable: true, invalidReason: diskBaselineUnavailable } : {})
  });
}

async function scanDisk(filePath, root, cleanDocument = cleanDocuments.get(filePath)) {
  if (cancelled || limit || seen.has(filePath)) return;
  seen.add(filePath);
  const relativePath = root ? path.relative(root.path, filePath).replace(/\\/g, '/') :
    cleanDocument?.displayName || path.basename(filePath);
  if (
    !insideScope(filePath, root) ||
    !acceptsFile(relativePath, request, root) ||
    (await conditionalExcluded(filePath, root))
  )
    return;
  if (cleanDocument?.encoding && !supportedEncodings.has(cleanDocument.encoding)) {
    skip('encoding', filePath, { root });
    return;
  }
  const snapshot = snapshots.get(filePath);
  if (snapshot) {
    await scanDocument(snapshot, root, filePath);
    return;
  }
  try {
    // rg does not follow symlinks. lstat also covers replacement of an enumerated
    // regular file with a symlink before it is read.
    const info = await fs.lstat(filePath);
    if (!info.isFile()) throw new Error('An enumerated file changed type before it was searched.');
    const handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    try {
      const sameFile = (a, b) => b.isFile() && a.dev === b.dev && a.ino === b.ino &&
        a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
      const opened = await handle.stat();
      if (!sameFile(info, opened)) throw new Error('The file changed while it was being opened.');
      const assertUnchanged = async () => {
        if (!sameFile(opened, await handle.stat()) || !sameFile(opened, await fs.lstat(filePath)))
          throw new Error('The file changed while it was being searched.');
      };
      // Confirm supported containers before the text-size limit, using bounded
      // reads from this same handle rather than loading large archives.
      if (await isConfirmedZip(handle, opened.size)) {
        await assertUnchanged();
        skip('binary', filePath, { root, blocking: false, format: 'ZIP' });
        return;
      }
      const probe = Buffer.allocUnsafe(Math.min(opened.size, PROBE_BYTES));
      let probeLength = 0;
      while (probeLength < probe.length) {
        const { bytesRead } = await handle.read(probe, probeLength, probe.length - probeLength, probeLength);
        if (!bytesRead) throw new Error('The file changed while it was being inspected.');
        probeLength += bytesRead;
      }
      const prefix = classifyBytes(probe);
      const explicitWide = ['utf16le', 'utf16be'].includes(cleanDocument?.encoding);
      if (prefix.kind !== 'unknown' && !(explicitWide && prefix.kind === 'encoding')) {
        await assertUnchanged();
        skip(prefix.kind === 'binary' ? 'binary' : 'encoding', filePath, {
          root, blocking: prefix.kind !== 'binary', format: prefix.format
        });
        return;
      }
      if (opened.size > maxBytes) {
        skip('tooLarge', filePath, { root });
        return;
      }
      // Read at most the observed size plus one byte, even if a file grows.
      const buffer = Buffer.allocUnsafe(opened.size + 1);
      let count = 0;
      while (count < buffer.length) {
        const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
        if (!bytesRead) break;
        count += bytesRead;
      }
      if (count !== opened.size) throw new Error('The file changed while it was being searched.');
      await assertUnchanged();
      const bytes = buffer.subarray(0, count);
      const classification = classifyBytes(bytes);
      if (classification.kind !== 'unknown' && !(explicitWide && classification.kind === 'encoding')) {
        skip(classification.kind === 'binary' ? 'binary' : 'encoding', filePath, {
          root, blocking: classification.kind !== 'binary', format: classification.format
        });
        return;
      }
      let text;
      try {
        const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
        const utf32Bom = (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0) ||
          (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff);
        if (explicitWide && (utf8Bom || utf32Bom ||
            (cleanDocument.encoding === 'utf16le' && bytes[0] === 0xfe && bytes[1] === 0xff) ||
            (cleanDocument.encoding === 'utf16be' && bytes[0] === 0xff && bytes[1] === 0xfe)))
          throw new Error('The disk BOM conflicts with the document encoding.');
        text = (explicitWide ? losslessDecoder(cleanDocument.encoding) : decoder).decode(bytes);
      } catch {
        skip('encoding', filePath, { root });
        return;
      }
      const diskByteHash = createHash('sha256').update(bytes).digest('hex');
      const diskBaseline = { origin: 'disk', uri: pathToFileURL(filePath).toString(), mtimeMs: opened.mtimeMs, fileSize: opened.size,
        ctimeMs: opened.ctimeMs, dev: opened.dev, ino: opened.ino, byteHash: diskByteHash,
        linkPolicy: fsConstants.O_NOFOLLOW ? 'no-follow' : 'identity-validated' };
      await scanText(text, {
        uri: pathToFileURL(filePath).toString(),
        fsPath: filePath,
        relativePath,
        label: path.basename(relativePath),
        rootName: root?.name || '',
        rootPath: root?.path || '',
        source: 'disk',
        mtimeMs: opened.mtimeMs,
        fileSize: opened.size,
        diskCtimeMs: opened.ctimeMs,
        diskDevice: opened.dev,
        diskInode: opened.ino,
        diskByteHash,
        diskLinkPolicy: diskBaseline.linkPolicy,
        diskBaseline
      });
    } finally {
      await handle.close();
    }
  } catch (error) {
    skip('unreadable', filePath, { root, error });
  }
}

// An unsaved file buffer can outlive its disk entry. When ignore rules are in
// use, enumeration alone cannot decide whether that absent path is eligible.
// Never report such a potentially in-scope input as a complete search.
async function checkUnenumeratedDocument(document, root, filePath) {
  if (!filePath || !root || (request.scope?.kind !== 'openEditors' && document.isDirty === false)) return;
  const resolved = path.resolve(filePath);
  if (seen.has(resolved) || !insideScope(resolved, root)) return;
  const relativePath = path.relative(root.path, resolved).replace(/\\/g, '/');
  if (!acceptsFile(relativePath, request, root) || await conditionalExcluded(resolved, root)) return;
  try {
    await fs.lstat(resolved);
    // Existing but not enumerated files remain subject to ripgrep's ignores.
  } catch (error) {
    skip('unreadable', resolved, { root, error });
  }
}

function enumerationArgs(root) {
  const args = [
    '--files',
    '--null',
    '--hidden',
    '--no-config',
    '--no-require-git',
    '--glob',
    '!.git/**'
  ];
  if (
    request.respectExcludes === false ||
    request.useIgnoreFiles === false ||
    root.useIgnoreFiles === false
  )
    args.push('--no-ignore');
  if (request.useGlobalIgnoreFiles !== true && root.useGlobalIgnoreFiles !== true)
    args.push('--no-ignore-global');
  if (request.useParentIgnoreFiles === false || root.useParentIgnoreFiles === false)
    args.push('--no-ignore-parent');
  if (request.respectExcludes !== false) {
    for (const pattern of [
      ...splitPatterns(root.exclude),
      ...splitPatterns(request.exclude),
      ...splitPatterns(request.scope?.exclude)
    ]) {
      args.push('--glob', `!${pattern}`);
    }
  }
  args.push('--', '.');
  return args;
}

async function enumerate(root, visit) {
  if (cancelled || limit) return;
  const process = spawn(rgPath, enumerationArgs(root), {
    cwd: root.path,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child = process;
  if (process.pid) parentPort.postMessage({ type: 'child', pid: process.pid, alive: true });
  const closed = new Promise((resolve) => {
    process.once('close', (code, signal) => resolve({ code, signal }));
    process.once('error', (error) => resolve({ error }));
  });
  let stderr = '';
  process.stderr.on('data', (bytes) => {
    if (stderr.length < 2000) stderr += bytes.toString('utf8');
  });
  let pending = Buffer.alloc(0);
  try {
    for await (const chunk of process.stdout) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let offset = 0;
      let delimiter;
      while ((delimiter = pending.indexOf(0, offset)) !== -1) {
        const name = pending.subarray(offset, delimiter).toString('utf8');
        offset = delimiter + 1;
        if (name) await visit(path.resolve(root.path, name));
        if (cancelled || limit) {
          process.kill();
          break;
        }
      }
      pending = Buffer.from(pending.subarray(offset));
      if (cancelled || limit) break;
    }
    const { code, signal, error } = await closed;
    if (error) throw error;
    if (!cancelled && !limit && (signal || (code !== 0 && code !== 1) || pending.length || stderr.trim())) {
      skip('unreadable', root.path, {
        root, kind: 'enumeration', error: new Error(stderr.trim() ||
          (signal ? `ripgrep terminated by ${signal}` : pending.length
            ? 'ripgrep returned a partial file name' : `ripgrep exited with code ${code}`))
      });
    }
  } finally {
    process.kill();
    if (process.pid) parentPort.postMessage({ type: 'child', pid: process.pid, alive: false });
    if (child === process) child = undefined;
  }
}

async function main() {
  if (request.scope?.kind === 'openEditors') {
    // Enumeration is used only to apply filesystem ignore rules to open files;
    // documents outside the workspace and untitled buffers remain searchable.
    const eligible = new Set();
    if (request.respectExcludes !== false && rgPath) {
      for (const root of roots)
        await enumerate(root, async (filePath) => {
          if (rootFor(filePath) === root) eligible.add(filePath);
        });
    }
    for (const document of request.documents) {
      if (cancelled || limit) break;
      const filePath = documentPath(document);
      const root = filePath ? rootFor(filePath) : undefined;
      if (
        filePath &&
        root &&
        request.respectExcludes !== false &&
        rgPath &&
        !eligible.has(path.resolve(filePath))
      ) {
        await checkUnenumeratedDocument(document, root, filePath);
        continue;
      }
      const identity = document.uri || filePath;
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (filePath && document.isDirty === false && request.sourcePolicy === 'disk-clean-buffers-dirty')
        await scanDisk(filePath, root, document);
      else await scanDocument(document, root, filePath);
    }
  } else {
    for (const root of roots) {
      if (cancelled || limit) break;
      if (request.scope?.kind === 'folder' && !insideScope(root.path, root)) continue;
      await enumerate(root, (filePath) => {
        // Nested workspace folders have their own configuration and ignore
        // policy. Let their own enumeration own the file; a parent listing
        // must not bypass a child folder's excludes. An explicit Folder scope
        // intentionally uses that selected folder's relative paths/settings.
        if (request.scope?.kind !== 'folder' && rootFor(filePath) !== root) return;
        return scanDisk(filePath, root);
      });
    }
    if (!cancelled && !limit) {
      for (const document of request.documents) {
        const filePath = documentPath(document);
        const root = filePath ? scopeRootFor(filePath) : undefined;
        await checkUnenumeratedDocument(document, root, filePath);
      }
    }
  }
  flush();
  parentPort.postMessage({
    type: 'done',
    truncated: limit || stats.timedOut || stats.blockingSkippedFiles > 0 || stats.errors.length > 0,
    reason: cancelReason || (limit ? 'limit' : stats.blockingSkippedFiles ? 'skippedFiles' : undefined),
    stats
  });
  parentPort.close();
}

main().catch((error) => {
  child?.kill();
  parentPort.postMessage({
    type: 'error',
    message: error.message,
    code: error.code || 'SEARCH_FAILED'
  });
  parentPort.close();
});
