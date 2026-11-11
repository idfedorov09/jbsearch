'use strict';

// Optional real-Chromium harness; the main extension does not depend on Playwright.
// Set PLAYWRIGHT_CORE and CHROMIUM_PATH to existing local installations.
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
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-snapshot-browser-'));
  const dirs = Object.fromEntries(['home', 'config', 'cache', 'data', 'state', 'runtime', 'profile'].map(key => [key, path.join(profile, key)]));
  for (const directory of Object.values(dirs)) await fs.mkdir(directory, { mode: 0o700 });
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === '/') {
        const source = `http://127.0.0.1:${server.address().port}`;
        const html = getHtml({ cspSource: source, asWebviewUri: value => value }, '', {
          Uri: { joinPath: (_base, _media, name) => `/media/${name}` }
        });
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html);
      } else if (request.url === '/media/search.js' || request.url === '/media/search.css') {
        const name = path.basename(request.url);
        response.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/css' });
        response.end(await fs.readFile(path.join(__dirname, '..', 'media', name)));
      } else {
        response.writeHead(404);
        response.end();
      }
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launchPersistentContext(dirs.profile, {
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox'],
      viewport: { width: 1100, height: 800 },
      env: { ...process.env, HOME: dirs.home, XDG_CONFIG_HOME: dirs.config, XDG_CACHE_HOME: dirs.cache,
        XDG_DATA_HOME: dirs.data, XDG_STATE_HOME: dirs.state, XDG_RUNTIME_DIR: dirs.runtime, DISPLAY: '', WAYLAND_DISPLAY: '' }
    });
    await browser.addInitScript(() => {
      window.testMessages = [];
      window.acquireVsCodeApi = () => ({
        getState: () => ({}), setState() {},
        postMessage: message => window.testMessages.push(message)
      });
    });
    const page = browser.pages()[0] || await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const results = Array.from({ length: 150 }, (_, index) => ({
      id: `row-${index}`, uri: `file:///fixture/file${index}.js`, label: `file${index}.js`,
      relativePath: `file${index}.js`, lineText: `needle ${index}`,
      previewMatchStart: 0, previewMatchEnd: 6,
      range: { start: { line: index, character: 0 }, end: { line: index, character: 6 } }
    }));
    const state = {
      id: 'fixture', mode: 'replace', query: 'needle', replacement: 'other',
      options: {}, scope: { kind: 'workspace' }, generation: 1, results,
      selectedId: 'row-60', searching: false, partial: false, replacing: false,
      actionBinding: { sessionId: 'fixture', generation: 1, snapshotToken: 'complete-fixture' },
      previewRevision: 0, previewRequestId: null,
      scopeStale: false, error: '', notice: '', customScopes: [], patchAcks: {}
    };
    const nextGeneration = () => {
      state.generation += 1;
      state.actionBinding = { ...state.actionBinding, generation: state.generation,
        snapshotToken: `complete-fixture-${state.generation}` };
    };
    const deliver = snapshot => page.evaluate(value => new Promise(resolve => {
      const acknowledge = event => {
        if (event.data?.type !== 'state') return;
        window.removeEventListener('message', acknowledge);
        resolve();
      };
      window.addEventListener('message', acknowledge);
      window.postMessage({ type: 'state', state: value }, '*');
    }), snapshot);
    await deliver(state);
    await page.waitForFunction(() => document.querySelector('#resultRows').children.length > 0);
    assert.equal(await page.locator('#rerunNotice').count(), 1);
    assert.equal(await page.locator('#rerunSearch').count(), 1);
    assert.equal(await page.locator('#rerunNotice').isHidden(), true);
    assert.ok(await page.locator('#resultRows > .result').count() < 60, 'virtualization must remain active');
    await page.locator('#results').evaluate(element => { element.scrollTop = 1200; });
    const before = await page.locator('#results').evaluate(element => element.scrollTop);
    assert.ok(before > 0);
    const stale = { ...state, scopeStale: true, results: results.map((result, index) =>
      index === 60 ? { ...result, invalid: true } : result) };
    await deliver(stale);
    await page.waitForFunction(() => !document.querySelector('#rerunNotice').hidden);
    assert.equal(await page.locator('#results').evaluate(element => element.scrollTop), before);
    assert.equal(await page.locator('#replace').isDisabled(), true);
    assert.equal(await page.locator('#replaceAll').isDisabled(), true);
    assert.match(await page.locator('#resultRows').innerText(), /INVALID/);
    await page.locator('#rerunSearch').click();
    assert.equal(await page.evaluate(() => window.testMessages.at(-1).type), 'refresh');
    assert.equal(await page.locator('#results').evaluate(element => element.scrollTop), before);
    // A click stays disabled until the host acknowledges a new search generation.
    assert.equal(await page.locator('#rerunSearch').isDisabled(), true);
    nextGeneration();
    for (const flags of [
      { scopeStale: false, needsRerun: true },
      { scopeStale: true, needsRerun: true }
    ]) {
      await deliver({ ...state, ...flags });
      assert.equal(await page.locator('#rerunNotice').isVisible(), true);
      assert.equal(await page.locator('#rerunSearch').isEnabled(), true);
      const count = await page.evaluate(() => window.testMessages.length);
      await page.locator('#rerunSearch').click();
      assert.equal(await page.evaluate(() => window.testMessages.length), count + 1);
      const refresh = await page.evaluate(() => window.testMessages.at(-1));
      assert.equal(refresh.type, 'refresh'); assert.equal(refresh.generation, state.generation);
      assert.match(refresh.requestId, /:rerun:\d+$/);
      nextGeneration();
    }
    for (const busy of [{ searching: true }, { replacing: true }]) {
      await deliver({ ...state, scopeStale: true, needsRerun: true, ...busy });
      assert.equal(await page.locator('#rerunNotice').isVisible(), true);
      assert.equal(await page.locator('#rerunSearch').isDisabled(), true);
      const count = await page.evaluate(() => window.testMessages.length);
      await page.locator('#rerunSearch').evaluate(button => button.onclick());
      assert.equal(await page.evaluate(() => window.testMessages.length), count);
    }
    // Replace -> Rerun can cross before the host busy state arrives. A matching
    // refusal releases only that request, never every same-generation echo.
    await deliver({ ...state, scopeStale: true });
    await page.locator('#replaceAll').click();
    await page.locator('#rerunSearch').click();
    const refused = await page.evaluate(() => window.testMessages.at(-1));
    assert.equal(refused.type, 'refresh');
    await deliver({ ...state, scopeStale: true, replacing: true });
    await deliver({ ...state, scopeStale: true });
    assert.equal(await page.locator('#rerunSearch').isDisabled(), true);
    await page.evaluate(value => window.postMessage({ type: 'refreshRejected', ...value }, '*'),
      { requestId: refused.requestId, generation: refused.generation });
    await page.waitForFunction(() => !document.querySelector('#rerunSearch').disabled);
    await page.locator('#rerunSearch').click();
    const retry = await page.evaluate(() => window.testMessages.at(-1));
    assert.notEqual(retry.requestId, refused.requestId);
    await page.evaluate(value => window.postMessage({ type: 'refreshRejected', ...value }, '*'),
      { requestId: refused.requestId, generation: refused.generation });
    await deliver({ ...state, scopeStale: true });
    assert.equal(await page.locator('#rerunSearch').isDisabled(), true);
    nextGeneration();
    await deliver({ ...state, needsRerun: true });
    await page.locator('#replacement').fill('pending replacement');
    assert.equal(await page.locator('#rerunSearch').isDisabled(), true);
    const update = await page.evaluate(() => window.testMessages.at(-1));
    const pendingCount = await page.evaluate(() => window.testMessages.length);
    await page.locator('#rerunSearch').evaluate(button => button.onclick());
    assert.equal(await page.evaluate(() => window.testMessages.length), pendingCount);
    await deliver({ ...state, needsRerun: true, replacement: 'pending replacement',
      patchAcks: { [update.clientId]: update.revision } });
    assert.equal(await page.locator('#rerunSearch').isEnabled(), true);
    await deliver({ ...state, generation: state.generation + 1, scopeStale: false, results: [...results, {
      ...results[0], id: 'new-row', uri: 'file:///fixture/new.js'
    }], patchAcks: { [update.clientId]: update.revision } });
    await page.waitForFunction(() => document.querySelector('#rerunNotice').hidden);
    assert.equal(await page.locator('#results').evaluate(element => element.scrollTop), 0);
    await page.locator('#results').evaluate(element => { element.scrollTop = 900; });
    await page.locator('#query').fill('changed');
    assert.equal(await page.locator('#results').evaluate(element => element.scrollTop), 0);
    assert.equal(await page.evaluate(() => window.testMessages.at(-1).type), 'update');
    assert.deepEqual(errors, []);
    console.log(`PASS: Chromium ${browser.browser().version()}; shared rerun states, matching busy-refusal/retry and duplicate guards, virtualization, scroll, invalid guards and query reset`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
