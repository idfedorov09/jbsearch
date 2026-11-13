'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { jobsOf, jobRuns } = require('./helpers/workflow-guards');
const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/publish-open-vsx.yml'), 'utf8');
const manifest = require('../package.json');
const lockfile = require('../package-lock.json');
const [header] = workflow.split(/^jobs:\s*$/m);
const jobs = jobsOf(workflow);

test('Open VSX checks and authentication jobs enforce actual event, ref and repository matrix', () => {
  const cases = [
    ['refs/heads/master', 'workflow_dispatch', 'token', [true, true, false]],
    ['refs/heads/master', 'workflow_dispatch', 'trusted', [true, false, true]],
    ['refs/heads/master', 'workflow_dispatch', '', [true, false, false]],
    ['refs/heads/beta', 'push', '', [true, true, false]],
    ['refs/heads/beta', 'push', 'trusted', [true, true, false]],
    ['refs/heads/beta', 'workflow_dispatch', 'token', [false, false, false]],
    ['refs/heads/master', 'push', '', [false, false, false]],
    ['refs/heads/dev', 'push', '', [false, false, false]],
    ['refs/heads/beta', 'pull_request', '', [false, false, false]],
    ['refs/tags/beta', 'push', '', [false, false, false]],
    ['refs/heads/master', 'schedule', '', [false, false, false]],
  ];
  const names = ['check', 'publish-token', 'publish-trusted'];
  for (const [ref, event, authentication, expected] of cases) for (let i = 0; i < names.length; i++) {
    const args = { ref, event, authentication };
    assert.equal(jobRuns(jobs[names[i]], args), expected[i], `${names[i]}: ${ref} ${event} ${authentication}`);
    assert.equal(jobRuns(jobs[names[i]], { ...args, repository: 'other/jbsearch' }), false, `${names[i]}: foreign repository`);
    if (ref === 'refs/heads/beta' && event === 'push') {
      assert.equal(jobRuns(jobs[names[i]], { ...args, deleted: true }), false);
      assert.equal(jobRuns(jobs[names[i]], { ...args, forced: true }), false);
    }
  }
  assert.match(header, /^  push:\s*\n    branches: \[beta\]/m);
  assert.match(header, /^  workflow_dispatch:\s*$/m);
  assert.match(header, /authentication:[\s\S]+?default: token[\s\S]+?- token\s*\n\s+- trusted/);
  assert.doesNotMatch(header, /^  (?:pull_request|schedule|workflow_call):/m);
});

test('validation, reproducible beta packaging and verification gate both publication routes', () => {
  const commands = ['npm ci --ignore-scripts', 'npm run check', 'npm test', 'npm run spec:check'];
  let previous = -1;
  for (const command of commands) {
    const index = jobs.check.indexOf(`- run: ${command}`, previous + 1);
    assert.ok(index > previous); previous = index;
  }
  for (const mode of ['token', 'trusted']) {
    const job = jobs[`publish-${mode}`];
    assert.match(job, /^    needs: check\s*$/m);
    assert.match(job, /^    environment: open-vsx\s*$/m);
    assert.ok(job.indexOf('npm ci --ignore-scripts') < job.indexOf('npm run package'));
    const publishCommand = mode === 'token' ? 'node scripts/publish-open-vsx.js' : './node_modules/.bin/ovsx --registryUrl https://open-vsx.org publish';
    assert.ok(job.indexOf('npm run package') < job.indexOf(publishCommand));
  }
  for (const job of [jobs.check, jobs['publish-token']]) {
    assert.ok(job.indexOf('SOURCE_DATE_EPOCH=') > job.indexOf('npm ci --ignore-scripts'));
    assert.ok(job.indexOf('SOURCE_DATE_EPOCH=') < job.indexOf('run: npm run package:pre-release'));
    assert.match(job, /git show -s --format=%ct "\$GITHUB_SHA"/);
  }
  const token = jobs['publish-token'];
  assert.match(token, /- name: Publish verified stable VSIX with bootstrap token\s*\n\s+if: github\.ref == 'refs\/heads\/master'/);
  assert.match(token, /- name: Publish and verify pre-release with token\s*\n\s+if: github\.ref == 'refs\/heads\/beta'/);
  const beta = token.indexOf('node scripts/publish-open-vsx.js "$package" --skip-duplicate');
  assert.ok(beta >= 0 && token.indexOf('node scripts/verify-published-beta.js open-vsx "$package"') > beta);
  assert.doesNotMatch(token, /ovsx[^\n]*--pre-release/);
  assert.equal(manifest.devDependencies.ovsx, '1.3.0');
  assert.equal(lockfile.packages['node_modules/ovsx'].version, '1.3.0');
  assert.equal(lockfile.packages['node_modules/@vscode/vsce'].version, '4.1.0');
});

test('the beta token route is explicit, master trusted mode is preserved, and neither falls back', () => {
  const token = jobs['publish-token'], trusted = jobs['publish-trusted'];
  assert.match(header, /^permissions:\s*\n  contents: read\s*$/m);
  assert.doesNotMatch(jobs.check, /id-token:|secrets\./);
  assert.match(token, /^    permissions:\s*\n      contents: read\s*$/m);
  assert.doesNotMatch(token, /id-token:|--trusted-publishing/);
  assert.equal((token.match(/OVSX_PAT: \$\{\{ secrets\.OVSX_PAT \}\}/g) || []).length, 2);
  assert.equal((token.match(/if \[ -z "\$OVSX_PAT" \]/g) || []).length, 2);
  assert.match(trusted, /^    permissions:\s*\n      contents: read\s*\n      id-token: write\s*$/m);
  assert.match(trusted, /publish "\$package" --trusted-publishing/);
  assert.doesNotMatch(trusted, /OVSX_PAT|secrets\./);
  assert.doesNotMatch(workflow, /npm version|git (?:push|tag|commit)/);
});
