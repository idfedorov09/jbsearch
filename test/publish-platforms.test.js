'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { ORDER, publishMatrix, publishCommand, runCommand } = require('../scripts/publish-platforms');
const { publishPackage } = require('../scripts/publish-marketplace');
const manifest = require('../package.json');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function until(predicate) {
  for (let i = 0; i < 500; i++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for test state');
}
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
function targetOf(command) {
  return ORDER.find(target => command.args.some(arg => arg.endsWith(`-${target}.vsix`)));
}

for (const [registry, auth, channel] of [
  ['marketplace', 'oidc', 'stable'], ['marketplace', 'oidc', 'pre-release'],
  ['open-vsx', 'token', 'stable'], ['open-vsx', 'token', 'pre-release'], ['open-vsx', 'trusted', 'stable'],
]) test(`preflight and publish ${registry}/${auth}/${channel}`, async () => {
  const { options, calls, logs } = harness({ registry, auth, channel });
  assert.deepEqual(await publishMatrix(options), ORDER);
  assert.equal(calls.filter(x => x[0] === 'inspect').length, 7);
  assert.equal(calls.filter(x => x[0] === 'channel').length, 7);
  assert.equal(calls.findIndex(x => x[0] === 'publish'), 14);
  assert.deepEqual(calls.filter(x => x[0] === 'publish').map(x => targetOf(x[1])), ORDER);
  assert.deepEqual(calls.filter(x => x[0] === 'verify').map(x => x[2].target), ORDER);
  for (const [index, item] of calls.filter(x => x[0] === 'publish').entries()) {
    const command = item[1];
    assert.ok(command.args.includes(path.join('/mock-packages', `${manifest.name}-${manifest.version}-${ORDER[index]}.vsix`)));
    assert.equal(command.args.includes('--skip-duplicate'), false);
    if (registry === 'marketplace') {
      assert.equal(command.requiresAcknowledgement, true);
      assert.ok(command.args.includes(channel));
      assert.match(command.args[0], /publish-marketplace\.js$/);
    } else {
      assert.equal(command.args.includes('--pre-release'), false);
      if (auth === 'token') assert.match(command.args[0], /publish-open-vsx\.js$/);
      else assert.ok(command.args.includes('--trusted-publishing'));
    }
  }
  assert.match(logs.at(-1), /Confirmed all 7/);
});

test('invalid authentication, channel, or directory never publishes', async () => {
  for (const options of [
    { registry: 'other' }, { auth: 'token' }, { channel: 'unknown' }, { directory: '' },
    { registry: 'open-vsx', auth: 'trusted', channel: 'pre-release' }, { verificationConcurrency: 0 },
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

test('universal gate, single writer, overlap and late verifications', async () => {
  const gates = Object.fromEntries(ORDER.map(target => [target, deferred()]));
  const uploads = [], verifying = [];
  let active = 0, max = 0, settled = false;
  const h = harness({
    publish: async command => {
      active++; max = Math.max(max, active); uploads.push(targetOf(command));
      await new Promise(resolve => setImmediate(resolve)); active--;
    },
    verify: async (registry, expected, options) => {
      assert.equal(typeof options.limiter, 'function');
      verifying.push(expected.target); await gates[expected.target].promise;
    },
  });
  const result = publishMatrix(h.options).then(value => { settled = true; return value; });
  await until(() => verifying.includes('universal'));
  assert.deepEqual(uploads, ['universal']);
  gates.universal.resolve();
  await until(() => uploads.length === ORDER.length && verifying.length === ORDER.length);
  assert.equal(max, 1);
  assert.equal(settled, false, 'must wait for all background verification');
  assert.deepEqual(uploads, ORDER);
  for (const target of ORDER.slice(1).reverse()) gates[target].resolve();
  assert.deepEqual(await result, ORDER);
});

test('universal verification failure blocks all platform uploads', async () => {
  const h = harness({ verify: async () => { throw new Error('private secret'); } });
  await assert.rejects(publishMatrix(h.options), error => {
    assert.match(error.message, /Confirmed: none/);
    assert.match(error.message, /Uncertain: universal/);
    assert.match(error.message, /Not attempted: win32-x64/);
    assert.doesNotMatch(error.message, /private secret/);
    return true;
  });
  assert.equal(h.calls.filter(x => x[0] === 'publish').length, 1);
  assert.doesNotMatch(h.logs.join('\n'), /private secret/);
});

test('conflicting duplicate or other ambiguous upload stops until exact check, then fails closed', async () => {
  const h = harness();
  const verification = deferred();
  h.options.publish = async command => {
    h.calls.push(['publish', command]);
    if (targetOf(command) === 'win32-x64') throw new Error('duplicate secret');
  };
  h.options.verify = async (registry, expected) => {
    h.calls.push(['verify', registry, expected]);
    if (expected.target === 'win32-x64') await verification.promise;
  };
  const result = publishMatrix(h.options);
  const rejection = assert.rejects(result, error => {
    assert.match(error.message, /Confirmed: universal/);
    assert.match(error.message, /Uncertain: win32-x64/);
    assert.match(error.message, /Not attempted: win32-arm64/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  await until(() => h.calls.filter(x => x[0] === 'verify').length === 2);
  assert.equal(h.calls.filter(x => x[0] === 'publish').length, 2);
  verification.reject(new Error('different digest secret'));
  await rejection;
  assert.equal(h.calls.filter(x => x[0] === 'publish').length, 2);
  assert.doesNotMatch(h.logs.join('\n'), /secret/);
});

test('failed upload or matching duplicate may continue only after its exact check', async () => {
  const gate = deferred(), calls = [];
  const h = harness({
    publish: async command => { const target = targetOf(command); calls.push(['publish', target]);
      if (target === 'win32-x64') throw new Error('secret'); },
    verify: async (registry, expected) => { calls.push(['verify', expected.target]);
      if (expected.target === 'win32-x64') await gate.promise; },
  });
  const result = publishMatrix(h.options);
  await until(() => calls.some(x => x[0] === 'verify' && x[1] === 'win32-x64'));
  assert.deepEqual(calls.filter(x => x[0] === 'publish').map(x => x[1]), ORDER.slice(0, 2));
  gate.resolve();
  assert.deepEqual(await result, ORDER);
  assert.ok(h.logs.some(line => /Recovered marketplace win32-x64 by exact registry verification/.test(line)));
  assert.doesNotMatch(h.logs.join('\n'), /secret/);
});

test('known background failure stops new writes and drains an already running upload and late check', async () => {
  const failedCheck = deferred(), activeUpload = deferred(), lateCheck = deferred();
  const uploads = [], verifying = [];
  let settled = false;
  const h = harness({
    publish: async command => { const target = targetOf(command); uploads.push(target);
      if (target === 'win32-arm64') await activeUpload.promise; },
    verify: async (registry, expected) => {
      verifying.push(expected.target);
      if (expected.target === 'win32-x64') await failedCheck.promise;
      if (expected.target === 'win32-arm64') await lateCheck.promise;
    },
  });
  const promise = publishMatrix(h.options).finally(() => { settled = true; });
  const rejection = assert.rejects(promise, error => {
    assert.match(error.message, /Confirmed: universal, win32-arm64/);
    assert.match(error.message, /Uncertain: win32-x64/);
    assert.match(error.message, /Not attempted: darwin-x64/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  await until(() => uploads.includes('win32-arm64'));
  failedCheck.reject(new Error('untrusted secret'));
  await until(() => h.logs.some(line => /Exact verification failed/.test(line)));
  activeUpload.resolve();
  await until(() => verifying.includes('win32-arm64'));
  assert.equal(settled, false, 'all started verification must be drained');
  lateCheck.resolve();
  await rejection;
  assert.deepEqual(uploads, ORDER.slice(0, 3));
  assert.doesNotMatch(h.logs.join('\n'), /secret/);
});

test('Marketplace public API uses OIDC and catches cancellations and duplicate errors', async () => {
  const file = `/tmp/${manifest.name}-${manifest.version}-linux-x64.vsix`;
  for (const channel of ['stable', 'pre-release']) {
    let observed;
    await publishPackage(file, channel, async (value, options) => { observed = [value, options]; });
    assert.deepEqual(observed, [file, { oidc: true, preRelease: channel === 'pre-release', skipDuplicate: false }]);
  }
  for (const message of ['Canceled', 'Cancelled', 'already exists'])
    await assert.rejects(publishPackage(file, 'stable', async () => { throw new Error(message); }), error => error.message === message);
  await assert.rejects(publishPackage('/tmp/unexpected.vsix', 'stable', async () => assert.fail('must not publish')));
});

test('publisher exit zero is not accepted without a success acknowledgement', async () => {
  await assert.rejects(runCommand({ executable: process.execPath, args: ['-e', 'process.exit(0)'], requiresAcknowledgement: true }), /missing acknowledgement/);
  await runCommand({ executable: process.execPath, args: ['-e', "process.send('accepted', () => process.disconnect())"], requiresAcknowledgement: true });
  await assert.rejects(runCommand({ executable: process.execPath, args: ['-e', "process.send('accepted', () => process.exit(1))"], requiresAcknowledgement: true }));
});
