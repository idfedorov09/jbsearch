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

test('checks, reproducible timestamps and verified matrix builds gate both publication modes', () => {
  const commands = ['npm ci --ignore-scripts', 'npm run check', 'npm test', 'npm run spec:check'];
  let previous = -1;
  for (const command of commands) {
    const index = jobs.check.indexOf(`- run: ${command}`, previous + 1);
    assert.ok(index > previous); previous = index;
  }
  for (const name of ['check', 'publish-token', 'publish-trusted']) {
    const job = jobs[name];
    if (name !== 'check') {
      assert.match(job, /^    needs: check\s*$/m);
      assert.match(job, /^    environment: open-vsx\s*$/m);
    }
    assert.ok(job.indexOf('SOURCE_DATE_EPOCH=') > job.indexOf('npm ci --ignore-scripts'));
    assert.ok(job.indexOf('SOURCE_DATE_EPOCH=') < job.indexOf('run: npm run package:matrix'));
    assert.match(job, /git show -s --format=%ct "\$GITHUB_SHA"/);
    if (name !== 'check') assert.ok(job.indexOf('run: npm run package:matrix') < job.indexOf('node scripts/publish-platforms.js'));
  }
  const token = jobs['publish-token'];
  assert.match(token, /if: github\.ref == 'refs\/heads\/master'[\s\S]+?node scripts\/publish-platforms\.js open-vsx stable token/);
  assert.match(token, /if: github\.ref == 'refs\/heads\/beta'[\s\S]+?node scripts\/publish-platforms\.js open-vsx pre-release token/);
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
  assert.match(trusted, /node scripts\/publish-platforms\.js open-vsx stable trusted/);
  assert.doesNotMatch(trusted, /OVSX_PAT|secrets\./);
  assert.doesNotMatch(workflow, /npm version|git (?:push|tag|commit)/);
});
