'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { marketplaceRecord, checkRegistry, verifyWithRetry } = require('../scripts/verify-published-beta');
const { TARGETS, UNIVERSAL } = require('../scripts/package-targets');
const base = { publisher: 'idfedorov09', name: 'jbsearch', version: '0.4.4', sha256: 'a'.repeat(64) };

function marketplace(expected, overrides = {}) {
  const properties = [{ key: 'Microsoft.VisualStudio.Services.VsixSha256', value: expected.sha256 }];
  if (expected.channel === 'pre-release') properties.push({ key: 'Microsoft.VisualStudio.Code.PreRelease', value: 'true' });
  return { results: [{ extensions: [{ publisher: { publisherName: base.publisher }, extensionName: base.name,
    versions: [{ version: base.version, targetPlatform: expected.target === UNIVERSAL ? undefined : expected.target,
      flags: 'validated', properties, ...overrides }] }] }] };
}
function openVSX(expected, overrides = {}) {
  const suffix = expected.target === UNIVERSAL ? `/${base.version}` : `/${expected.target}/${base.version}`;
  return { namespace: base.publisher, name: base.name, version: base.version, targetPlatform: expected.target,
    preRelease: expected.channel === 'pre-release', files: { sha256: `https://open-vsx.org/api/${base.publisher}/${base.name}${suffix}/file/example.sha256` }, ...overrides };
}
function mockOpen(metadata, hash = base.sha256, calls = []) {
  return async (url, options) => {
    calls.push([String(url), options]);
    return String(url).includes('/file/') ? { ok: true, text: async () => hash } : { ok: true, json: async () => metadata };
  };
}

for (const target of [UNIVERSAL, ...TARGETS]) for (const channel of ['stable', 'pre-release']) {
  test(`both registries check ${channel} ${target} exactly`, async () => {
    const expected = { ...base, target, channel };
    assert.doesNotThrow(() => marketplaceRecord(marketplace(expected), expected));
    const calls = [];
    await checkRegistry('open-vsx', expected, mockOpen(openVSX(expected), base.sha256, calls));
    assert.ok(calls[0][0].startsWith(`https://open-vsx.org/api/${base.publisher}/${base.name}/${target}/${base.version}?`));
    assert.equal(calls.length, 2);
    assert.equal(calls[0][1].redirect, 'error');
    assert.equal(calls[1][1].redirect, 'manual');
  });
}

test('Marketplace rejects absent, duplicate and foreign identity, target, version, validation, channel and digest', () => {
  const expected = { ...base, target: 'linux-x64', channel: 'pre-release' };
  const create = () => marketplace(expected);
  const mutate = f => { const body = create(); f(body.results[0].extensions[0]); return body; };
  for (const body of [
    { results: [] },
    mutate(ext => { ext.publisher.publisherName = 'other'; }),
    mutate(ext => { ext.extensionName = 'other'; }),
    mutate(ext => { ext.versions[0].version = '0.4.5'; }),
    mutate(ext => { delete ext.versions[0].targetPlatform; }),
    mutate(ext => { ext.versions[0].targetPlatform = 'linux-arm64'; }),
    mutate(ext => { ext.versions.push({ ...ext.versions[0] }); }),
    mutate(ext => { ext.versions[0].flags = 'unvalidated'; }),
    mutate(ext => { ext.versions[0].properties[1].value = 'false'; }),
    mutate(ext => { ext.versions[0].properties.pop(); }),
    mutate(ext => { ext.versions[0].properties[0].value = 'b'.repeat(64); }),
    mutate(ext => { ext.versions[0].properties.push(ext.versions[0].properties[0]); }),
  ]) assert.throws(() => marketplaceRecord(body, expected));
  const duplicate = create(); duplicate.results[0].extensions.push(duplicate.results[0].extensions[0]);
  assert.throws(() => marketplaceRecord(duplicate, expected), /ambiguous/);
  const stable = { ...expected, channel: 'stable' };
  assert.throws(() => marketplaceRecord(marketplace(stable, { properties: [{ key: 'Microsoft.VisualStudio.Code.PreRelease', value: 'true' }] }), stable));
});

test('Open VSX rejects fallback and foreign identity, version, channel, digest and URL', async () => {
  const expected = { ...base, target: 'linux-x64', channel: 'pre-release' };
  const metadata = openVSX(expected);
  for (const override of [
    { namespace: 'other' }, { name: 'other' }, { version: '0.4.5' }, { targetPlatform: 'universal' },
    { targetPlatform: 'linux-arm64' }, { preRelease: false },
    { files: { sha256: `https://open-vsx.org/api/${base.publisher}/${base.name}/${base.version}/file/example.sha256` } },
    { files: { sha256: `https://evil.example/api/${base.publisher}/${base.name}/linux-x64/${base.version}/file/example.sha256` } },
    { files: { sha256: `${metadata.files.sha256}?token=bad` } },
    { files: { sha256: 'invalid' } },
  ]) await assert.rejects(checkRegistry('open-vsx', expected, mockOpen({ ...metadata, ...override })));
  await assert.rejects(checkRegistry('open-vsx', expected, mockOpen(metadata, 'b'.repeat(64))), /SHA-256/);
  await assert.rejects(checkRegistry('open-vsx', expected, async () => ({ ok: false, status: 404 })), /HTTP 404/);
});

test('bounded retries tolerate delayed propagation and fail safely without leaking exception text', async () => {
  const expected = { ...base, target: 'linux-x64', channel: 'stable' };
  let calls = 0, waits = 0;
  await verifyWithRetry('open-vsx', expected, { attempts: 4, check: async () => { if (++calls < 3) throw new Error('Registry returned HTTP 404'); }, delay: async () => { waits++; } });
  assert.equal(calls, 3); assert.equal(waits, 2);
  calls = 0; waits = 0;
  await assert.rejects(verifyWithRetry('open-vsx', expected, { attempts: 3, check: async () => { calls++; throw new Error('sensitive token=secret'); }, delay: async () => { waits++; } }), error => {
    assert.match(error.message, /may already have occurred/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  assert.equal(calls, 3); assert.equal(waits, 2);
});

test('Open VSX follows only allowlisted digest redirects without credentials', async () => {
  const expected = { ...base, target: 'linux-x64', channel: 'stable' };
  const metadata = openVSX(expected); const requests = [];
  const fetcher = async (url, options) => {
    requests.push([String(url), options]);
    if (requests.length === 1) return { ok: true, json: async () => metadata };
    if (requests.length === 2) return { status: 302, headers: { get: () => 'https://openvsx.eclipsecontent.org/bucket/digest' } };
    return { ok: true, text: async () => expected.sha256 };
  };
  await checkRegistry('open-vsx', expected, fetcher);
  assert.equal(requests.length, 3);
  assert.equal(requests[1][1].redirect, 'manual');
  assert.equal(requests[2][1].redirect, 'manual');
  assert.equal(requests[2][1].headers, undefined);
  const unsafe = async (url, options) => String(url).includes('/file/')
    ? { status: 302, headers: { get: () => 'https://evil.example/private' } }
    : { ok: true, json: async () => metadata };
  await assert.rejects(checkRegistry('open-vsx', expected, unsafe), /redirect/);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('attempt concurrency is bounded through slow response body consumption', async () => {
  const { createAttemptLimiter } = require('../scripts/verify-published-beta');
  const limit = createAttemptLimiter(2);
  const gates = [deferred(), deferred(), deferred()];
  let started = 0, active = 0, maxActive = 0;
  const expected = { ...base, target: 'linux-x64', channel: 'pre-release' };
  const fetcher = async () => {
    const index = started++;
    active++; maxActive = Math.max(active, maxActive);
    return { ok: true, json: async () => {
      await gates[index].promise;
      active--;
      return marketplace(expected);
    } };
  };
  const promises = gates.map(() => limit(() => checkRegistry('marketplace', expected, fetcher)));
  await nextTurn();
  assert.equal(started, 2, 'headers alone must not release slots');
  gates[0].resolve();
  await nextTurn();
  assert.equal(started, 3);
  gates[1].resolve(); gates[2].resolve();
  await Promise.all(promises);
  assert.equal(maxActive, 2);
  assert.throws(() => createAttemptLimiter(0));
});

test('redirect bodies are cancelled before the next request and before another attempt gets the slot', async () => {
  const { createAttemptLimiter } = require('../scripts/verify-published-beta');
  const limit = createAttemptLimiter(1), cancelled = deferred();
  const expected = { ...base, target: 'linux-x64', channel: 'stable' };
  const events = [];
  const fetcher = async url => {
    const request = String(url);
    if (request.endsWith('/bucket/digest')) { events.push('digest'); return { ok: true, text: async () => expected.sha256 }; }
    if (request.includes('/file/')) {
      events.push('redirect');
      return { status: 302, headers: { get: () => 'https://openvsx.eclipsecontent.org/bucket/digest' },
        body: { cancel: async () => { events.push('cancel-start'); await cancelled.promise; events.push('cancel-end'); } } };
    }
    events.push('metadata'); return { ok: true, json: async () => openVSX(expected) };
  };
  const first = limit(() => checkRegistry('open-vsx', expected, fetcher));
  const second = limit(async () => { events.push('second'); });
  await nextTurn();
  assert.deepEqual(events, ['metadata', 'redirect', 'cancel-start']);
  cancelled.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['metadata', 'redirect', 'cancel-start', 'cancel-end', 'digest', 'second']);
});

test('retry sleeps hold no request permit, and diagnostics use safe classifications', async () => {
  const { createAttemptLimiter } = require('../scripts/verify-published-beta');
  const limit = createAttemptLimiter(1), sleeping = deferred(), resume = deferred(), logs = [];
  const expected = { ...base, target: 'linux-x64', channel: 'stable' };
  let checks = 0, otherRan = false;
  const first = verifyWithRetry('open-vsx', expected, { attempts: 2, limiter: limit, log: line => logs.push(line),
    check: async () => { if (++checks === 1) throw new Error('sensitive token=secret'); },
    delay: async () => { sleeping.resolve(); await resume.promise; } });
  await sleeping.promise;
  await limit(async () => { otherRan = true; });
  assert.equal(otherRan, true);
  resume.resolve(); await first;
  assert.equal(checks, 2);
  assert.match(logs.join('\n'), /attempt 1\/2 failed: other/);
  assert.match(logs.join('\n'), /completed.*2 attempt\(s\).*ms elapsed/);
  assert.doesNotMatch(logs.join('\n'), /secret|token=/);
  const { verificationReason } = require('../scripts/verify-published-beta');
  assert.equal(verificationReason(new Error('Registry returned HTTP 503')), 'http-5xx');
  assert.equal(verificationReason(new Error('Registry returned HTTP 503 token=secret')), 'other');
  assert.equal(verificationReason(new Error('Marketplace VSIX SHA-256 differs from the built package')), 'digest-mismatch');
  assert.equal(verificationReason({ name: 'TimeoutError' }), 'timeout');
});
