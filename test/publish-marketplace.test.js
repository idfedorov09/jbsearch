'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const manifest = require('../package.json');
const script = path.join(__dirname, '../scripts/publish-marketplace.js');
const preload = path.join(__dirname, 'helpers/mock-vsce-publisher.js');
const filename = `/tmp/${manifest.name}-${manifest.version}-linux-x64.vsix`;

function runPublisher(outcome, ipc = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, filename, 'pre-release'], {
      env: { ...process.env, NODE_OPTIONS: `--require=${preload}`, MOCK_VSCE_RESULT: outcome },
      stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
    });
    let output = '', accepted = false;
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    if (ipc) child.on('message', message => { if (message === 'accepted') accepted = true; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, output, accepted }));
  });
}

test('Marketplace publisher acknowledges only after the public API resolves', async () => {
  const result = await runPublisher('success');
  assert.equal(result.code, 0, result.output);
  assert.equal(result.accepted, true);
});

for (const outcome of ['cancel', 'cancelled', 'duplicate', 'sensitive']) {
  test(`Marketplace API ${outcome} fails without acknowledgement or untrusted output`, async () => {
    const result = await runPublisher(outcome);
    assert.notEqual(result.code, 0, result.output);
    assert.equal(result.accepted, false);
    assert.match(result.output, /details withheld/);
    assert.doesNotMatch(result.output, /Canceled|Cancelled|already exists|synthetic-private-test-marker|token=/);
  });
}

test('Marketplace publisher refuses to run without its controlled parent channel', async () => {
  const result = await runPublisher('success', false);
  assert.notEqual(result.code, 0);
  assert.equal(result.accepted, false);
});
