'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const workflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'publish.yml'),
  'utf8',
);
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// These focused checks protect the release workflow's security-critical shape;
// a GitHub Actions validator is still needed to validate the whole YAML file.
const beforeJobs = workflow.split(/^jobs:\s*$/m)[0];
const jobs = workflow.split(/^jobs:\s*$/m)[1] || '';
const checkJob = (jobs.split(/^  publish:\s*$/m)[0] || '');
const publishJob = (jobs.split(/^  publish:\s*$/m)[1] || '');

test('publication is triggered by master pushes or a guarded manual run', () => {
  assert.match(beforeJobs, /^on:\s*\n  push:\s*\n    branches: \[master\]\s*\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(beforeJobs, /^  pull_request(?:_target)?:/m);
  const guard = /^    if: github\.repository == 'idfedorov09\/jbsearch' && github\.ref == 'refs\/heads\/master'\s*$/m;
  assert.match(checkJob, guard);
  assert.match(publishJob, guard);
});

test('checks and package creation gate publication', () => {
  const commands = [
    'npm ci --ignore-scripts',
    'npm run check',
    'npm test',
    'npm run spec:check',
    'npm run package',
  ];
  let previous = -1;
  for (const command of commands) {
    const next = checkJob.indexOf(`- run: ${command}`, previous + 1);
    assert.ok(next > previous, `${command} must follow the previous check`);
    previous = next;
  }
  assert.match(publishJob, /^    needs: check\s*$/m);
});

test('only the protected publishing job can request an OIDC token', () => {
  assert.match(beforeJobs, /^permissions:\s*\n  contents: read\s*$/m);
  assert.doesNotMatch(checkJob, /id-token:\s*write/);
  assert.match(publishJob, /^    environment: marketplace\s*$/m);
  assert.match(publishJob, /^    permissions:\s*\n      contents: read\s*\n      id-token: write\s*$/m);
  assert.doesNotMatch(workflow, /VSCE_PAT|--pat(?:\s|=)|secrets\./);
});

test('publication builds and verifies the bundled client in its own runner', () => {
  const install = publishJob.indexOf('- run: npm ci --ignore-scripts');
  const build = publishJob.indexOf('- run: npm run package');
  const publish = publishJob.indexOf('run: ./node_modules/.bin/vsce publish');
  assert.ok(install >= 0 && build > install && publish > build,
    'the publishing runner must build and verify its VSIX after installing dependencies');

  const stages = manifest.scripts.package.split('&&').map(command => command.trim());
  const client = stages.indexOf('npm run prepare:client');
  const packageMain = stages.indexOf('vsce package');
  const verify = stages.indexOf('node scripts/verify-package.js');
  assert.ok(client >= 0 && packageMain > client && verify > packageMain,
    'the package command must prepare the nested client and verify the resulting main VSIX');
  assert.equal(manifest.scripts['prepare:client'], 'node scripts/package-client.js');
  assert.match(publishJob, /vsce publish --oidc --skip-duplicate --packagePath \.\/\*\.vsix\s*$/m,
    'publication must consume the prepared VSIX instead of packaging the source again');
});

test('publication uses the checked-in version and skips duplicates', () => {
  assert.match(beforeJobs, /^concurrency:\s*\n  group: marketplace-publication\s*\n  queue: max\s*$/m);
  assert.match(publishJob, /^        run: \.\/node_modules\/\.bin\/vsce publish --oidc --skip-duplicate --packagePath \.\/\*\.vsix\s*$/m);
  assert.doesNotMatch(publishJob, /npm version|vsce publish (?:patch|minor|major)|git (?:push|tag|commit)/);
});
