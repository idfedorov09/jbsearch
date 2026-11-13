'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { test } = require('node:test');
const { assertSafeRequest, REJECTED } = require('../scripts/guard-open-vsx-http');
const { ZipFile } = createRequire(require.resolve('@vscode/vsce'))('yazl');
const manifest = require('../package.json');
const runner = path.join(__dirname, 'helpers/guarded-ovsx-runner.js');
const marker = 'synthetic-private-test-marker';

async function fixture(t, target) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'jbsearch-guarded-ovsx-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, `${manifest.name}-${manifest.version}${target ? `-${target}` : ""}.vsix`);
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify({ publisher: manifest.publisher, name: manifest.name, version: manifest.version })), 'extension/package.json');
  zip.end(); await pipeline(zip.outputStream, fs.createWriteStream(filename));
  return filename;
}

async function mockRegistry(t, mode) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method, pathname: url.pathname, tokenQuery: url.searchParams.has('token'), auth: request.headers.authorization, body: Buffer.concat(chunks) });
      const json = (status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
      if (url.pathname === '/api/version') {
        if (mode === 'unavailable') return json(503, { error: `mock error ${marker}` });
        if (mode === 'malformed') { response.writeHead(200); return response.end('not-json'); }
        if (mode === 'missing') return json(200, {});
        if (mode === 'old') return json(200, { version: '1.2.9' });
        return json(200, { version: '1.3.0', maxExtensionSize: 1048576 });
      }
      if (url.pathname === '/api/-/size-limit') return json(200, { maxSize: 1048576 });
      if (url.pathname === '/api/-/publish') {
        if (mode === 'bad-redirect') { response.writeHead(307, { Location: `/redirected?token=${marker}` }); return response.end(); }
        if (mode === 'user-info-redirect') { response.writeHead(307, { Location: `http://user:pass@127.0.0.1:${server.address().port}/redirected` }); return response.end(); }
        if (mode === 'cross-origin-redirect') { response.writeHead(307, { Location: 'http://127.0.0.1:1/redirected' }); return response.end(); }
        if (mode === 'safe-redirect') { response.writeHead(307, { Location: '/redirected' }); return response.end(); }
        if (mode === 'echo-error') return json(403, { error: `bad ${marker} raw-url http://example/?token=${marker}` });
        if (mode === 'duplicate') return json(409, { error: 'This extension version is already published.' });
      }
      if (url.pathname === '/api/-/publish' || url.pathname === '/redirected')
        return json(200, { namespace: manifest.publisher, name: manifest.name, version: manifest.version, targetPlatform: 'universal' });
      json(404, { error: 'Unexpected local request' });
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

function runCli(registry, filename) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, registry, filename, '--skip-duplicate'], {
      env: { PATH: process.env.PATH, HOME: os.tmpdir(), CI: 'true', OVSX_PAT: marker },
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, output }));
  });
}

test('modern registry uses the actual CLI with header-only PAT and exact VSIX bytes', async t => {
  const filename = await fixture(t); const registry = await mockRegistry(t, 'modern');
  const result = await runCli(registry.url, filename);
  assert.equal(result.code, 0, result.output);
  const publish = registry.requests.find(request => request.pathname === '/api/-/publish');
  assert.ok(publish); assert.equal(publish.auth, `Bearer ${marker}`);
  assert.deepEqual(publish.body, await fsp.readFile(filename));
  assert.equal(registry.requests.some(request => request.tokenQuery), false);
  assert.doesNotMatch(result.output, /synthetic-private-test-marker/);
});

for (const target of ['universal', 'win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64']) {
  test(`allowlisted ${target} filename keeps the CLI token guard`, async t => {
    const filename = await fixture(t, target); const registry = await mockRegistry(t, 'modern');
    const result = await runCli(registry.url, filename);
    assert.equal(result.code, 0, result.output);
    const publish = registry.requests.find(request => request.pathname === '/api/-/publish');
    assert.ok(publish); assert.equal(publish.auth, `Bearer ${marker}`);
    assert.deepEqual(publish.body, await fsp.readFile(filename));
    assert.equal(registry.requests.some(request => request.tokenQuery), false);
    assert.doesNotMatch(result.output, /synthetic-private-test-marker/);
  });
}

test('unknown matrix filename is rejected before contacting the registry', async t => {
  const filename = await fixture(t, 'linux-unknown'); const registry = await mockRegistry(t, 'modern');
  const result = await runCli(registry.url, filename);
  assert.notEqual(result.code, 0);
  assert.equal(registry.requests.length, 0);
  assert.doesNotMatch(result.output, /synthetic-private-test-marker/);
});

for (const mode of ['unavailable', 'malformed', 'missing', 'old']) {
  test(`${mode} registry version fails before any PAT-bearing query or publish`, async t => {
    const filename = await fixture(t); const registry = await mockRegistry(t, mode);
    const result = await runCli(registry.url, filename);
    assert.notEqual(result.code, 0, result.output);
    assert.equal(registry.requests.some(request => request.pathname === '/api/-/publish' || request.tokenQuery), false);
    assert.doesNotMatch(result.output, /synthetic-private-test-marker|raw-url|\?token=/);
  });
}

test('a same-origin safe redirect remains header-only', async t => {
  const filename = await fixture(t); const registry = await mockRegistry(t, 'safe-redirect');
  const result = await runCli(registry.url, filename);
  assert.equal(result.code, 0, result.output);
  const redirected = registry.requests.find(request => request.pathname === '/redirected');
  assert.ok(redirected); assert.equal(redirected.auth, `Bearer ${marker}`);
  assert.deepEqual(redirected.body, await fsp.readFile(filename));
  assert.equal(registry.requests.some(request => request.tokenQuery), false);
  assert.doesNotMatch(result.output, /synthetic-private-test-marker/);
});

for (const mode of ['bad-redirect', 'user-info-redirect', 'cross-origin-redirect']) {
  test(`${mode} is blocked at the request boundary`, async t => {
    const filename = await fixture(t); const registry = await mockRegistry(t, mode);
    const result = await runCli(registry.url, filename);
    assert.notEqual(result.code, 0, result.output);
    assert.equal(registry.requests.some(request => request.pathname === '/redirected' || request.tokenQuery), false);
    assert.doesNotMatch(result.output, /synthetic-private-test-marker|user:pass|\?token=/);
  });
}

test('a duplicate CLI skip does not claim remote identity or hash verification', async t => {
  const filename = await fixture(t); const registry = await mockRegistry(t, 'duplicate');
  const result = await runCli(registry.url, filename);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /verify the exact registry version separately/);
  assert.equal(registry.requests.some(request => request.tokenQuery), false);
});

test('CLI errors are sanitized even if registry error text echoes the credential', async t => {
  const filename = await fixture(t); const registry = await mockRegistry(t, 'echo-error');
  const result = await runCli(registry.url, filename);
  assert.notEqual(result.code, 0, result.output);
  assert.doesNotMatch(result.output, /synthetic-private-test-marker|raw-url|example|\?token=/);
});

test('unknown request forms, URL credentials, unsafe queries and option overrides fail closed', () => {
  const url = new URL('https://open-vsx.org/api/-/publish');
  const callback = () => {}; const safe = { method: 'POST', headers: { Authorization: `Bearer ${marker}` } };
  assert.doesNotThrow(() => assertSafeRequest([url, safe, callback], 'https://open-vsx.org', marker));
  const invalid = [
    [url.href, safe, callback], [url, callback], [url, { ...safe, host: 'example.test' }, callback],
    [url, { ...safe, auth: marker }, callback], [url, { ...safe, headers: { Host: 'example.test' } }, callback],
    [new URL(`https://${marker}:x@open-vsx.org/api/-/publish`), safe, callback],
    [new URL(`https://open-vsx.org/api/-/publish?token=${marker}`), safe, callback],
    [new URL(`https://open-vsx.org/api/-/publish?other=${encodeURIComponent(marker)}`), safe, callback],
    [new URL('https://open-vsx.org/api/-/publish?other=harmless'), safe, callback],
    [new URL('https://open-vsx.org/api/-/size-limit?namespace=idfedorov09&extension=jbsearch&extra=x'), safe, callback],
    [url, { ...safe, headers: { Cookie: marker } }, callback],
  ];
  for (const args of invalid) assert.throws(() => assertSafeRequest(args, 'https://open-vsx.org', marker), error => error.message === REJECTED && !error.message.includes(marker));
});
