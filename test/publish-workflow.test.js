'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { jobsOf, jobRuns } = require('./helpers/workflow-guards');
const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/publish.yml'), 'utf8');
const manifest = require('../package.json');
const validationWorkflow = fs.readFileSync(path.join(root, '.github/workflows/test.yml'), 'utf8');
const [header] = workflow.split(/^jobs:\s*$/m);
const jobs = jobsOf(workflow);

// Exercise the checked-in GitHub expressions rather than restating them as functions.
test('Marketplace job guards admit only master stable events or a beta push in the owner repository', () => {
  const matrix = [
    ['refs/heads/master', 'push', true], ['refs/heads/master', 'workflow_dispatch', true],
    ['refs/heads/beta', 'push', true], ['refs/heads/beta', 'workflow_dispatch', false],
    ['refs/heads/dev', 'push', false], ['refs/heads/master', 'pull_request', false],
    ['refs/heads/beta', 'pull_request', false], ['refs/tags/beta', 'push', false],
    ['refs/heads/master', 'schedule', false],
  ];
  for (const name of ['check', 'publish']) for (const [ref, event, expected] of matrix) {
    assert.equal(jobRuns(jobs[name], { ref, event }), expected, `${name}: ${ref} ${event}`);
    assert.equal(jobRuns(jobs[name], { ref, event, repository: 'other/jbsearch' }), false, `${name}: foreign repository`);
    if (ref === 'refs/heads/beta' && event === 'push') {
      assert.equal(jobRuns(jobs[name], { ref, event, deleted: true }), false);
      assert.equal(jobRuns(jobs[name], { ref, event, forced: true }), false);
    }
  }
  assert.match(header, /^  push:\s*\n    branches: \[master, beta\]/m);
  assert.match(header, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(header, /^  (?:pull_request|schedule):/m);
});

test('a dev-to-beta pull request runs the ordinary checks without triggering publication', () => {
  assert.match(validationWorkflow, /^  pull_request:\s*\n    branches: \[master, dev, beta\]/m);
  assert.match(validationWorkflow, /^  push:\s*\n    branches: \[master, dev, beta\]/m);
  assert.doesNotMatch(header, /^  pull_request(?:_target)?:/m);
  assert.match(validationWorkflow, /- run: npm run check[\s\S]+?- run: npm test[\s\S]+?- run: npm run spec:check[\s\S]+?- run: npm run package/);
  assert.match(validationWorkflow, /if: github\.event_name == 'pull_request' && github\.base_ref == 'beta'\s*\n\s+run: npm run package:pre-release/);
  assert.ok(validationWorkflow.indexOf('SOURCE_DATE_EPOCH=') < validationWorkflow.indexOf('- run: npm run package'));
});

test('checks gate publication, and beta build timestamps precede both package builds', () => {
  const commands = ['npm ci --ignore-scripts', 'npm run check', 'npm test', 'npm run spec:check'];
  let previous = -1;
  for (const command of commands) {
    const index = jobs.check.indexOf(`- run: ${command}`, previous + 1);
    assert.ok(index > previous, `${command} must follow the previous check`); previous = index;
  }
  assert.match(jobs.publish, /^    needs: check\s*$/m);
  for (const name of ['check', 'publish']) {
    const job = jobs[name];
    assert.ok(job.indexOf('SOURCE_DATE_EPOCH=') > job.indexOf('npm ci --ignore-scripts'));
    assert.ok(job.indexOf('SOURCE_DATE_EPOCH=') < job.indexOf('run: npm run package:pre-release'));
    assert.match(job, /git show -s --format=%ct "\$GITHUB_SHA"/);
    assert.match(job, /if: github\.ref == 'refs\/heads\/master'\s*\n\s+run: npm run package\s*$/m);
    assert.match(job, /if: github\.ref == 'refs\/heads\/beta'\s*\n\s+run: npm run package:pre-release\s*$/m);
  }
  assert.equal(manifest.scripts.package, 'npm run prepare:client && vsce package && node scripts/verify-package.js');
  assert.equal(manifest.scripts['package:pre-release'], 'npm run prepare:client && vsce package --pre-release && node scripts/verify-package.js && node scripts/verify-release-channel.js pre-release');
});

test('stable OIDC behavior is preserved and beta duplicate success requires exact remote verification', () => {
  assert.match(header, /^permissions:\s*\n  contents: read\s*$/m);
  assert.doesNotMatch(jobs.check, /id-token:\s*write|secrets\./);
  assert.match(jobs.publish, /^    environment: marketplace\s*$/m);
  assert.match(jobs.publish, /^    permissions:\s*\n      contents: read\s*\n      id-token: write\s*$/m);
  assert.doesNotMatch(workflow, /VSCE_PAT|--pat(?:\s|=)|secrets\./);
  assert.match(jobs.publish, /if: github\.ref == 'refs\/heads\/master'\s*\n\s+run: \.\/node_modules\/\.bin\/vsce publish --oidc --skip-duplicate --packagePath \.\/\*\.vsix/m);
  assert.match(jobs.publish, /- name: Publish and verify pre-release\s*\n\s+if: github\.ref == 'refs\/heads\/beta'/);
  const beta = jobs.publish.indexOf('vsce publish --oidc --pre-release --skip-duplicate --packagePath "$package"');
  const verify = jobs.publish.indexOf('node scripts/verify-published-beta.js marketplace "$package"');
  assert.ok(beta >= 0 && verify > beta, 'beta verification must follow publication including a duplicate skip');
  assert.doesNotMatch(jobs.publish, /npm version|git (?:push|tag|commit)/);
  assert.match(header, /^concurrency:\s*\n  group: marketplace-publication\s*\n  queue: max\s*$/m);
});
