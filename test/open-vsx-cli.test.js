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

// Resolve the ZIP writer from the existing packaging tool, even when npm nests it.
const { ZipFile } = createRequire(require.resolve('@vscode/vsce'))('yazl');
const cli = path.join(__dirname, '..', 'node_modules', 'ovsx', 'bin', 'ovsx');

async function fixture(t) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'jbsearch-ovsx-test-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'jbsearch-0.3.0.vsix');
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify({ publisher: 'idfedorov09', name: 'jbsearch', version: '0.3.0' })), 'extension/package.json');
  zip.addBuffer(Buffer.from('fixture'), 'extension/fixture.txt');
  zip.end();
  await pipeline(zip.outputStream, fs.createWriteStream(filename));
  return filename;
}

async function mockRegistry(t, { rejectPublish = false } = {}) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const url = new URL(request.url, 'http://localhost');
      const body = Buffer.concat(chunks);
      requests.push({ method: request.method, url, headers: request.headers, body });
      const send = (status, value) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(value));
      };
      if (request.method === 'GET' && url.pathname === '/api/version') return send(200, { version: '1.3.0', maxExtensionSize: 1048576 });
      if (request.method === 'GET' && url.pathname === '/api/-/size-limit') return send(200, { maxSize: 1048576 });
      if (request.method === 'GET' && url.pathname === '/oidc') return send(200, { value: 'mock-id-token' });
      if (request.method === 'POST' && url.pathname === '/api/-/trusted-publishing/token') return send(200, { value: 'mock-short-lived-token' });
      if (request.method === 'POST' && url.pathname === '/api/-/publish') {
        if (rejectPublish) return send(409, { error: 'This extension version is already published.' });
        return send(200, { namespace: 'idfedorov09', name: 'jbsearch', version: '0.3.0', targetPlatform: 'universal' });
      }
      return send(404, { error: 'Unexpected mock request' });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

function runCli(registry, filename, options = [], extraEnv = {}) {
  const env = { ...process.env, CI: 'true' };
  for (const name of ['OVSX_PAT', 'OVSX_REGISTRY_URL', 'OVSX_ID_TOKEN', 'OVSX_TRUSTED_PUBLISHING', 'OVSX_OIDC_AUDIENCE', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) delete env[name];
  Object.assign(env, extraEnv);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, '--registryUrl', registry, 'publish', filename, ...options], { env });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, output }));
  });
}

test('bootstrap mode uploads the exact VSIX to a mock registry using the environment PAT', async t => {
  const filename = await fixture(t);
  const registry = await mockRegistry(t);
  const result = await runCli(registry.url, filename, [], { OVSX_PAT: 'mock-bootstrap-token' });
  assert.equal(result.code, 0, result.output);
  const publish = registry.requests.find(request => request.url.pathname === '/api/-/publish');
  assert.ok(publish);
  assert.equal(publish.headers.authorization, 'Bearer mock-bootstrap-token');
  assert.deepEqual(publish.body, await fsp.readFile(filename));
  assert.equal(registry.requests.some(request => request.url.pathname === '/api/-/trusted-publishing/token'), false);
  assert.doesNotMatch(result.output, /mock-bootstrap-token/);
});

test('trusted mode exchanges a GitHub OIDC token and uploads the same VSIX without a PAT', async t => {
  const filename = await fixture(t);
  const registry = await mockRegistry(t);
  const result = await runCli(registry.url, filename, ['--trusted-publishing'], {
    ACTIONS_ID_TOKEN_REQUEST_URL: `${registry.url}/oidc?api-version=1`,
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  });
  assert.equal(result.code, 0, result.output);
  const oidc = registry.requests.find(request => request.url.pathname === '/oidc');
  const exchange = registry.requests.find(request => request.url.pathname === '/api/-/trusted-publishing/token');
  const publish = registry.requests.find(request => request.url.pathname === '/api/-/publish');
  assert.ok(oidc && exchange && publish);
  assert.equal(oidc.headers.authorization, 'Bearer mock-request-token');
  assert.equal(oidc.url.searchParams.get('audience'), registry.url);
  assert.deepEqual(JSON.parse(exchange.body), { namespace: 'idfedorov09', extension: 'jbsearch', token: 'mock-id-token' });
  assert.equal(publish.headers.authorization, 'Bearer mock-short-lived-token');
  assert.deepEqual(publish.body, await fsp.readFile(filename));
  assert.doesNotMatch(result.output, /mock-(?:request|id|short-lived)-token/);
});

test('trusted mode does not fall back when an OIDC token is unavailable', async t => {
  const filename = await fixture(t);
  const registry = await mockRegistry(t);
  const result = await runCli(registry.url, filename, ['--trusted-publishing']);
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /No OIDC ID token available/);
  assert.equal(registry.requests.some(request => request.url.pathname === '/api/-/publish'), false);
});

test('a duplicate-version rejection fails instead of reporting a replacement', async t => {
  const filename = await fixture(t);
  const registry = await mockRegistry(t, { rejectPublish: true });
  const result = await runCli(registry.url, filename, [], { OVSX_PAT: 'mock-bootstrap-token' });
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /already published/i);
});
