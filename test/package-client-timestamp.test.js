'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');

test('nested client cache respects release timestamp without changing its source build identity', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbsearch-client-timestamp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts/package-client.js'), path.join(dir, 'scripts/package-client.js'));
  fs.cpSync(path.join(root, 'client'), path.join(dir, 'client'), { recursive: true });
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(dir, 'LICENSE'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  const run = epoch => {
    const env = { ...process.env }; delete env.SOURCE_DATE_EPOCH;
    if (epoch !== undefined) env.SOURCE_DATE_EPOCH = epoch;
    return spawnSync(process.execPath, [path.join(dir, 'scripts/package-client.js')], { cwd: dir, env, encoding: 'utf8' });
  };
  const read = () => ({
    metadata: JSON.parse(fs.readFileSync(path.join(dir, 'bundled/client.json'), 'utf8')),
    hash: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'bundled/jbsearch-client.vsix'))).digest('hex'),
  });
  assert.equal(run('1700000000').status, 0); const first = read();
  const same = run('1700000000'); assert.equal(same.status, 0, same.stderr);
  assert.match(same.stdout, /up to date/); assert.deepEqual(read(), first);
  assert.equal(run('1700000010').status, 0); const next = read();
  assert.equal(next.metadata.build, first.metadata.build);
  assert.equal(next.metadata.sourceDateEpoch, '1700000010');
  assert.notEqual(next.hash, first.hash);
  assert.equal(run('1700000000').status, 0); assert.deepEqual(read(), first);
  assert.notEqual(run('123x').status, 0); assert.deepEqual(read(), first);
  assert.equal(run().status, 0); assert.equal(read().metadata.sourceDateEpoch, null);
});
