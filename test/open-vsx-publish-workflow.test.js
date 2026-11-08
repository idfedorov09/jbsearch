'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/publish-open-vsx.yml'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const [header, jobText = ''] = workflow.split(/^jobs:\s*$/m);
const sections = jobText.split(/^  (check|publish-token|publish-trusted):\s*$/m);
const jobs = {};
for (let index = 1; index < sections.length; index += 2) jobs[sections[index]] = sections[index + 1];

test('Open VSX publication is manually dispatched and guarded to the stable repository and ref', () => {
  assert.match(header, /^on:\s*\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(header, /^  (?:push|pull_request(?:_target)?|schedule|workflow_call):/m);
  assert.match(header, /authentication:\s*\n\s+description:.*\n\s+type: choice\s*\n\s+required: true\s*\n\s+default: token\s*\n\s+options:\s*\n\s+- token\s*\n\s+- trusted/m);
  assert.match(header, /^concurrency:\s*\n  group: open-vsx-publication\s*$/m);
  assert.match(header, /^permissions:\s*\n  contents: read\s*$/m);
  const guard = "github.repository == 'idfedorov09/jbsearch' && github.ref == 'refs/heads/master'";
  assert.match(jobs.check, new RegExp(`^    if: ${guard}$`, 'm'));
  for (const mode of ['token', 'trusted']) {
    assert.match(jobs[`publish-${mode}`], new RegExp(`^    if: ${guard} && inputs.authentication == '${mode}'$`, 'm'));
  }
});

test('checks gate both jobs and each publication runner verifies the package it uploads', () => {
  const commands = ['npm ci --ignore-scripts', 'npm run check', 'npm test', 'npm run spec:check', 'npm run package'];
  let previous = -1;
  for (const command of commands) {
    const index = jobs.check.indexOf(`- run: ${command}`, previous + 1);
    assert.ok(index > previous, `${command} must follow the previous check`);
    previous = index;
  }
  for (const mode of ['token', 'trusted']) {
    const job = jobs[`publish-${mode}`];
    assert.match(job, /^    needs: check\s*$/m);
    assert.match(job, /^    environment: open-vsx\s*$/m);
    const install = job.indexOf('- run: npm ci --ignore-scripts');
    const build = job.indexOf('- run: npm run package');
    const publish = job.indexOf('./node_modules/.bin/ovsx --registryUrl https://open-vsx.org publish "$package"');
    assert.ok(install >= 0 && build > install && publish > build);
    assert.match(job, /package="jbsearch-\$\(node -p 'require\("\.\/package\.json"\)\.version'\)\.vsix"/);
    assert.doesNotMatch(job, /--skip-duplicate|npm version|git (?:push|tag|commit)/);
  }
  assert.equal(manifest.scripts.package, 'npm run prepare:client && vsce package && node scripts/verify-package.js');
  assert.equal(manifest.devDependencies.ovsx, '1.3.0');
  assert.equal(lockfile.packages[''].devDependencies.ovsx, '1.3.0');
  assert.equal(lockfile.packages['node_modules/ovsx'].version, '1.3.0');
});

test('bootstrap PAT and trusted OIDC are isolated and do not silently fall back', () => {
  const token = jobs['publish-token'];
  const trusted = jobs['publish-trusted'];
  assert.doesNotMatch(jobs.check, /id-token:|secrets\./);
  assert.match(token, /^    permissions:\s*\n      contents: read\s*$/m);
  assert.doesNotMatch(token, /id-token:|--trusted-publishing/);
  assert.match(token, /^          OVSX_PAT: \$\{\{ secrets\.OVSX_PAT \}\}\s*$/m);
  assert.match(token, /if \[ -z "\$OVSX_PAT" \]; then[\s\S]*?exit 1/);
  assert.match(trusted, /^    permissions:\s*\n      contents: read\s*\n      id-token: write\s*$/m);
  assert.match(trusted, /publish "\$package" --trusted-publishing/);
  assert.doesNotMatch(trusted, /OVSX_PAT|secrets\./);
});
