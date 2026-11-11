'use strict';

// Optional real Chromium renderer check with a synthetic VS Code bridge. This
// never launches VS Code or uses an ordinary HOME/XDG/browser profile. Existing
// local Playwright Core and Chromium paths must be supplied explicitly.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { getHtml } = require('../src/ui/html');

async function main() {
  if (!process.env.PLAYWRIGHT_CORE || !process.env.CHROMIUM_PATH)
    throw new Error('Set PLAYWRIGHT_CORE and CHROMIUM_PATH to existing local installations.');
  const { chromium } = require(process.env.PLAYWRIGHT_CORE);
  const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-approval-browser-'));
  const dirs = Object.fromEntries(['home', 'config', 'cache', 'data', 'runtime', 'profile'].map(key => [key, path.join(isolated, key)]));
  for (const directory of Object.values(dirs)) await fs.mkdir(directory, { mode: 0o700 });
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === '/') {
        const origin = `http://127.0.0.1:${server.address().port}`;
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(getHtml({ cspSource: origin, asWebviewUri: value => value }, '', {
          Uri: { joinPath: (_base, _media, name) => `/media/${name}` }
        }));
      } else if (['/media/search.js', '/media/search.css'].includes(request.url)) {
        response.writeHead(200, { 'content-type': request.url.endsWith('.js') ? 'text/javascript' : 'text/css' });
        response.end(await fs.readFile(path.join(__dirname, '..', request.url.slice(1))));
      } else { response.writeHead(404); response.end(); }
    } catch (error) { response.writeHead(500); response.end(error.message); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launchPersistentContext(dirs.profile, {
      executablePath: process.env.CHROMIUM_PATH, headless: true,
      args: ['--no-sandbox', '--disable-background-networking'], viewport: { width: 1100, height: 800 },
      env: { ...process.env, HOME: dirs.home, XDG_CONFIG_HOME: dirs.config, XDG_CACHE_HOME: dirs.cache,
        XDG_DATA_HOME: dirs.data, XDG_RUNTIME_DIR: dirs.runtime }
    });
    await browser.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    await browser.addInitScript(() => {
      window.testMessages = [];
      window.acquireVsCodeApi = () => ({ getState: () => ({}), setState() {},
        postMessage: message => window.testMessages.push(message) });
    });
    const page = browser.pages()[0] || await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { errors.push(`Unexpected confirmation: ${dialog.message()}`); await dialog.dismiss(); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const results = Array.from({ length: 150 }, (_, index) => ({
      id: `row-${index}`, uri: `file:///synthetic/file${index}.js`, relativePath: `file${index}.js`, label: `file${index}.js`,
      lineText: `needle ${index}`, previewMatchStart: 0, previewMatchEnd: 6,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }, resultRevision: 0
    }));
    const binding = { sessionId: 'source', generation: 1, requestFingerprint: 'synthetic-complete-150',
      resultRevision: 1, scopeEventRevision: 0, snapshotToken: 'immutable-all-150' };
    const state = { id: 'source', mode: 'replace', query: 'needle', replacement: 'other', options: {},
      scope: { kind: 'workspace' }, generation: 1, results, selectedId: 'row-60', actionBinding: binding,
      searching: false, partial: false, replacing: false, error: '', notice: '', customScopes: [], patchAcks: {} };
    const deliver = value => page.evaluate(snapshot => new Promise(resolve => {
      const done = event => { if (event.data?.type === 'state') { window.removeEventListener('message', done); resolve(); } };
      window.addEventListener('message', done); window.postMessage({ type: 'state', state: snapshot }, '*');
    }), value);
    const last = () => page.evaluate(() => window.testMessages.at(-1));
    const count = () => page.evaluate(() => window.testMessages.length);
    await deliver(state);
    await page.waitForFunction(() => document.querySelector('#resultRows').children.length > 0);
    assert.ok(await page.locator('#resultRows > .result').count() < 60);
    await page.locator('#replaceAll').click();
    assert.deepEqual((await last()).actionBinding, binding);
    assert.equal((await last()).type, 'replaceAll');
    console.log('PASS: normal Replace All sends the entire 150-row model binding despite virtualization, with no extra dialog');

    await deliver({ ...state, replacing: true, notice: 'Checking the current search scope before Replace All…' });
    assert.equal(await page.locator('#replaceAll').isDisabled(), true);
    assert.equal(await page.locator('#query').isDisabled(), true);
    await deliver({ ...state, scopeStale: true, needsRerun: true,
      notice: 'The search results changed. Rerun Search before replacing.' });
    assert.equal(await page.locator('#rerunSearch').count(), 1);
    assert.equal(await page.locator('#rerunSearch').isVisible(), true);
    assert.match(await page.locator('#count').innerText(), /150 matches/);
    await page.locator('#rerunSearch').click();
    assert.equal((await last()).type, 'refresh');
    for (const busy of [{ searching: true }, { replacing: true }]) {
      await deliver({ ...state, needsRerun: true, ...busy });
      const before = await count();
      await page.locator('#rerunSearch').evaluate(element => element.onclick());
      assert.equal(await count(), before);
    }
    console.log('PASS: refusal retains the old complete model, one Rerun control and busy admission guards');

    await deliver(state);
    await page.locator('#replacement').fill('new plan');
    const update = await last(), before = await count();
    await page.locator('#replaceAll').evaluate(element => element.onclick());
    assert.equal(await count(), before, 'pending replacement patch cannot send an old token');
    const newBinding = { ...binding, resultRevision: 2, snapshotToken: 'new-plan-all-150' };
    const acknowledged = { ...state, replacement: 'new plan', actionBinding: newBinding,
      patchAcks: { [update.clientId]: update.revision } };
    await deliver(acknowledged);
    await page.locator('#replaceAll').click();
    assert.deepEqual((await last()).actionBinding, newBinding);
    console.log('PASS: a replacement-template edit waits for ACK and sends only the newly received plan binding');

    const review = { ...acknowledged, id: 'review', reviewOnly: true, reviewSourceId: state.id,
      reviewAll: true, notice: 'Frozen replacement review.', scopeStale: true, needsRerun: true };
    await deliver(review);
    assert.equal(await page.locator('#query').isDisabled(), true);
    assert.equal(await page.locator('#replacement').isDisabled(), true);
    assert.equal(await page.locator('#openTab').isHidden(), true);
    assert.equal(await page.locator('#rerunSearch').isHidden(), true);
    assert.equal(await page.locator('#replace').isHidden(), true);
    assert.match(await page.locator('#code').innerText(), /Preview unavailable.*source may have changed/);
    const frozenCount = await count();
    await page.locator('#query').evaluate(input => { input.value = 'must not search'; input.dispatchEvent(new Event('input')); });
    await page.evaluate(() => window.postMessage({ type: 'preview', preview: { id: 'row-60', html: '<b>LIVE SOURCE</b>' } }, '*'));
    await page.waitForTimeout(10);
    assert.equal(await count(), frozenCount);
    assert.doesNotMatch(await page.locator('#code').innerText(), /LIVE SOURCE/);
    await page.getByRole('button', { name: 'Replace Reviewed Snapshot', exact: true }).click();
    assert.equal((await last()).type, 'replaceAll');
    assert.deepEqual((await last()).actionBinding, newBinding);
    assert.equal((await last()).sessionId, undefined, 'existing session routing stays on its custom editor bridge');
    console.log('PASS: frozen review cannot search/change plan or adopt live source, and its explicit action returns the frozen source token');
    assert.deepEqual(errors, []);
    console.log(`PASS: Chromium ${browser.browser().version()}; mock webview only, not VS Code/native/Remote verification`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(isolated, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
