'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { ORDER, publishMatrix, publishCommand } = require('../scripts/publish-platforms');
const manifest = require('../package.json');

function harness(overrides = {}) {
  const calls = [], logs = [];
  const options = { registry: 'marketplace', channel: 'stable', auth: 'oidc', directory: '/mock-packages', manifest,
    inspect: async (file, { target }) => { calls.push(['inspect', target, file]); return { sha256: 'a'.repeat(64) }; },
    inspectChannel: async (file, channel, identity) => { calls.push(['channel', file, channel, identity]); },
    publish: async command => { calls.push(['publish', command]); },
    verify: async (registry, expected) => { calls.push(['verify', registry, expected]); },
    log: message => logs.push(message), ...overrides };
  return { options, calls, logs };
}

for (const [registry, auth, channel] of [
  ['marketplace', 'oidc', 'stable'], ['marketplace', 'oidc', 'pre-release'],
  ['open-vsx', 'token', 'stable'], ['open-vsx', 'token', 'pre-release'], ['open-vsx', 'trusted', 'stable'],
]) test(`preflight and sequentially publish ${registry}/${auth}/${channel}`, async () => {
  const { options, calls, logs } = harness({ registry, auth, channel });
  assert.deepEqual(await publishMatrix(options), ORDER);
  assert.equal(calls.filter(x => x[0] === 'inspect').length, 7);
  assert.equal(calls.filter(x => x[0] === 'channel').length, 7);
  assert.equal(calls.filter(x => x[0] === 'publish').length, 7);
  assert.equal(calls.filter(x => x[0] === 'verify').length, 7);
  assert.equal(calls.findIndex(x => x[0] === 'publish'), 14, 'all seven are checked before first upload');
  assert.deepEqual(calls.filter(x => x[0] === 'verify').map(x => x[2].target), ORDER);
  assert.deepEqual(calls.slice(14).map(x => x[0]), Array(7).fill(['publish', 'verify']).flat());
  for (const [index, item] of calls.filter(x => x[0] === 'publish').entries()) {
    const command = item[1];
    assert.ok(command.args.includes(path.join('/mock-packages', `${manifest.name}-${manifest.version}-${ORDER[index]}.vsix`)));
    assert.ok(command.args.includes('--skip-duplicate'));
    if (registry === 'marketplace') assert.equal(command.args.includes('--pre-release'), channel === 'pre-release');
    if (registry === 'open-vsx') assert.equal(command.args.includes('--pre-release'), false);
  }
  assert.match(logs.at(-1), /Confirmed all 7/);
});

test('invalid authentication, channel, or directory never publishes', async () => {
  for (const options of [
    { registry: 'other' }, { auth: 'token' }, { channel: 'unknown' }, { directory: '' },
    { registry: 'open-vsx', auth: 'trusted', channel: 'pre-release' },
  ]) {
    const h = harness(options);
    await assert.rejects(publishMatrix(h.options));
    assert.equal(h.calls.length, 0);
  }
  assert.throws(() => publishCommand('/', 'open-vsx', 'stable', 'oidc', '/x'));
});

test('preflight failure for the last package prevents every upload', async () => {
  const h = harness({ inspect: async (file, { target }) => {
    if (target === ORDER.at(-1)) throw new Error('bad package');
    return { sha256: 'a'.repeat(64) };
  } });
  await assert.rejects(publishMatrix(h.options), /bad package/);
  assert.equal(h.calls.filter(x => x[0] === 'publish').length, 0);
});

for (const failing of ['publish', 'verify']) test(`${failing} failure reports partial and uncertain targets and stops`, async () => {
  const h = harness();
  let count = 0;
  h.options[failing] = async (...args) => {
    h.calls.push([failing, ...args]);
    if (++count === 2) throw new Error('untrusted response containing secret');
  };
  await assert.rejects(publishMatrix(h.options), error => {
    assert.match(error.message, failing === 'publish' ? /upload failed/ : /registry verification failed/);
    assert.match(error.message, /Confirmed: universal/);
    assert.match(error.message, /Uncertain: win32-x64/);
    assert.match(error.message, /Not attempted: win32-arm64/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  assert.equal(h.calls.filter(x => x[0] === 'publish').length, 2);
  assert.equal(h.calls.filter(x => x[0] === 'verify').length, failing === 'publish' ? 1 : 2);
});
