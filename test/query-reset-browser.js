'use strict';

// Separate from npm test: point these variables at an existing Playwright Core
// installation and Chromium executable. This is a browser, not a VS Code host.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getHtml } = require('../src/ui/html');
const playwright = process.env.JBSEARCH_PLAYWRIGHT_CORE;
const executablePath = process.env.JBSEARCH_CHROMIUM;
if (!playwright || !executablePath) {
  console.error('Set JBSEARCH_PLAYWRIGHT_CORE and JBSEARCH_CHROMIUM to existing installations.');
  process.exit(2);
}
const { chromium } = require(playwright);
const base = 'https://jbsearch-test.invalid';
const html = getHtml({ cspSource: base, asWebviewUri: name => `${base}/assets/${name}` }, '.', {
  Uri: { joinPath: (...parts) => parts.at(-1) }
});
const assets = {
  '/assets/search.js': { contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../media/search.js')) },
  '/assets/search.css': { contentType: 'text/css', body: fs.readFileSync(path.join(__dirname, '../media/search.css')) }
};
const results = Array.from({ length: 80 }, (_, index) => ({
  id: `old-${index}`, uri: `file:///${index}.js`, label: `${index}.js`, lineText: 'old', resultRevision: 0,
  previewMatchStart: 0, previewMatchEnd: 3,
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }
}));
const initial = { id: 'session', mode: 'replace', query: 'old', replacement: 'new',
  options: { maskEnabled: true, mask: '*.js' }, scope: { kind: 'workspace' },
  generation: 1, previewRevision: 3, previewRequestId: null,
  results, selectedId: results[0].id, searching: false,
  partial: false, replacing: false, error: '', notice: '', customScopes: [], patchAcks: {} };

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(() => {
    window.sent = [];
    window.acquireVsCodeApi = () => ({
      getState: () => ({}), setState() {}, postMessage: message => window.sent.push(message)
    });
  });
  await page.route(`${base}/**`, route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/index') return route.fulfill({ contentType: 'text/html', body: html });
    if (assets[pathname]) return route.fulfill(assets[pathname]);
    return route.abort();
  });
  await page.goto(`${base}/index`);
  await deliver(page, initial);
  await page.waitForFunction(() => document.querySelectorAll('#resultRows .result').length > 0);
  return page;
}
async function deliver(page, state) {
  await page.evaluate(value => window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'state', state: value }
  })), state);
}
async function preview(page, value) {
  await page.evaluate(item => window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'preview', preview: { previewRevision: 3, previewRequestId: null, ...item } }
  })), value);
}
async function run() {
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'jbsearch-reset-chromium-'));
  const env = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' };
  for (const [key, dir] of Object.entries({ HOME: 'home', XDG_CONFIG_HOME: 'config',
    XDG_CACHE_HOME: 'cache', XDG_DATA_HOME: 'data', XDG_RUNTIME_DIR: 'runtime', TMPDIR: 'tmp' })) {
    env[key] = path.join(isolated, dir);
    fs.mkdirSync(env[key], { mode: 0o700 });
  }
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'], env });
    console.log(`Chromium: ${browser.version()}; Playwright Core: ${require(path.join(playwright, 'package.json')).version}`);
    for (const [name, action] of [
      ['query', page => page.locator('#query').fill('new')],
      ['cleared query', page => page.locator('#query').fill('')],
      ['mask', page => page.locator('#mask').fill('*.ts')],
      ['scope', page => page.locator('[data-scope="openEditors"]').click()],
      ['regex', page => page.locator('#regex').click()]
    ]) {
      const page = await newPage(browser);
      await preview(page, { id: 'old-0', generation: 1, resultRevision: 0, name: 'old.js',
        path: 'old.js', note: 'old warning', lines: [] });
      await page.locator('#results').evaluate(element => { element.scrollTop = 500; });
      assert.ok(await page.locator('#results').evaluate(element => element.scrollTop) > 0);
      await action(page);
      assert.equal(await page.locator('#resultRows .result').count(), 0);
      assert.equal(await page.locator('#results').evaluate(element => element.scrollTop), 0);
      assert.equal(await page.locator('#previewName').textContent(), 'Preview');
      assert.equal(await page.locator('#previewPath').textContent(), '');
      assert.equal(await page.locator('#previewNote').textContent(), '');
      assert.equal(await page.locator('#results').getAttribute('aria-activedescendant'), null);
      assert.equal(await page.locator('#replace').isDisabled(), true);
      assert.equal(await page.locator('#replaceAll').isDisabled(), true);
      await preview(page, { id: 'old-0', generation: 1, resultRevision: 0, name: 'late old preview', lines: [] });
      assert.equal(await page.locator('#previewName').textContent(), 'Preview');
      await page.locator('#results').press('Enter');
      assert.equal(await page.evaluate(() => window.sent.some(message => message.type === 'openResult')), false);
      console.log(`PASS: ${name} clears rows, aria, scroll and preview before ACK; old preview/open rejected`);
      await page.close();
    }
    {
      const page = await newPage(browser);
      await page.locator('#query').fill('a');
      await page.locator('#query').fill('ab');
      await page.locator('#query').fill('abc');
      const client = await page.evaluate(() => window.sent.find(message => message.type === 'update').clientId);
      await deliver(page, { ...initial, query: 'a', patchAcks: { [client]: 1 } });
      await deliver(page, { ...initial, query: 'ab', patchAcks: { [client]: 2 } });
      assert.equal(await page.locator('#query').inputValue(), 'abc');
      assert.equal(await page.locator('#resultRows .result').count(), 0);
      await deliver(page, { ...initial, query: 'abc', generation: 2, results: [], selectedId: null,
        searching: true, patchAcks: { [client]: 3 } });
      await deliver(page, { ...initial, query: 'ab', patchAcks: { [client]: 2 } });
      assert.equal(await page.locator('#query').inputValue(), 'abc');
      assert.equal(await page.locator('#resultRows .result').count(), 0);
      console.log('PASS: rapid query changes retain newest input and reject older ACKs');
      await page.close();
    }
    {
      const page = await newPage(browser);
      const count = await page.locator('#resultRows .result').count();
      await page.locator('#replacement').fill('different');
      assert.equal(await page.locator('#resultRows .result').count(), count);
      assert.equal(await page.locator('#replace').isDisabled(), true);
      console.log('PASS: replacement-only input retains rows while replacement waits for ACK');
      await page.close();
    }
    {
      const page = await newPage(browser);
      await page.locator('#query').fill('new');
      const client = await page.evaluate(() => window.sent.find(message => message.type === 'update').clientId);
      await deliver(page, { ...initial, query: 'new', generation: 2, previewRevision: 5, results: [results[0]],
        selectedId: results[0].id, patchAcks: { [client]: 1 } });
      // The real host rejects an obsolete preview before posting it. This
      // separately probes an already-posted old preview delivered after state.
      await preview(page, { id: 'old-0', generation: 1, resultRevision: 0, name: 'obsolete same-id preview', lines: [] });
      assert.equal(await page.locator('#previewName').textContent(), 'Preview');
      await preview(page, { id: 'old-0', generation: 2, resultRevision: 0, previewRevision: 5,
        name: 'current same-id preview', lines: [] });
      assert.equal(await page.locator('#previewName').textContent(), 'current same-id preview');
      console.log('PASS: same-ID old-generation preview rejected; current bound preview accepted');
      await page.close();
    }
    for (const [name, error, text] of [
      ['invalid regex', 'Invalid regular expression', 'Fix the query or filters to continue'],
      ['nonempty zero results', '', 'No matches found']
    ]) {
      const page = await newPage(browser);
      await preview(page, { id: 'old-0', generation: 1, resultRevision: 0,
        name: 'old.js', note: 'old warning', lines: [] });
      await deliver(page, { ...initial, results: [], selectedId: null, error });
      assert.equal(await page.locator('#resultRows .result').count(), 0);
      assert.equal(await page.locator('#results').getAttribute('aria-activedescendant'), null);
      assert.equal(await page.locator('#previewName').textContent(), 'Preview');
      assert.equal(await page.locator('#previewNote').textContent(), '');
      assert.equal(await page.locator('#empty').textContent(), text);
      assert.equal(await page.locator('#replace').isDisabled(), true);
      assert.equal(await page.locator('#replaceAll').isDisabled(), true);
      console.log(`PASS: ${name} clears preview/selection/aria and preserves the current empty/error state`);
      await page.close();
    }
    {
      const page = await newPage(browser);
      await page.locator('#results').press('ArrowDown');
      await page.locator('#results').press('ArrowUp');
      const selects = await page.evaluate(() => window.sent.filter(message => message.type === 'select'));
      assert.deepEqual(selects.map(message => message.id), ['old-1', 'old-0']);
      assert.notEqual(selects[0].previewRequestId, selects[1].previewRequestId);
      await preview(page, { id: 'old-0', generation: 1, resultRevision: 0, name: 'old A', lines: [] });
      assert.equal(await page.locator('#previewName').textContent(), 'Preview');
      await deliver(page, { ...initial, selectedId: 'old-1', previewRevision: 4,
        previewRequestId: selects[0].previewRequestId });
      assert.equal(await page.locator('#results').getAttribute('aria-activedescendant'), 'result-0');
      await preview(page, { id: 'old-1', generation: 1, resultRevision: 0, previewRevision: 4,
        previewRequestId: selects[0].previewRequestId, name: 'old B', lines: [] });
      assert.equal(await page.locator('#previewName').textContent(), 'Preview');
      await deliver(page, { ...initial, previewRevision: 5, previewRequestId: selects[1].previewRequestId });
      await preview(page, { id: 'old-0', generation: 1, resultRevision: 0, previewRevision: 5,
        previewRequestId: selects[1].previewRequestId, name: 'current A', lines: [] });
      assert.equal(await page.locator('#previewName').textContent(), 'current A');
      console.log('PASS: rapid keyboard A-to-B-to-A keeps the latest selection and preview ticket');
      await page.close();
    }
    {
      const page = await newPage(browser);
      await page.locator('#results').evaluate(element => { element.scrollTop = 1000; });
      await page.waitForFunction(() => !document.getElementById('result-0'));
      assert.equal(await page.locator('#results').getAttribute('aria-activedescendant'), null);
      await page.locator('#results').press('Home');
      const active = await page.locator('#results').getAttribute('aria-activedescendant');
      assert.equal(active, 'result-0');
      assert.equal(await page.locator(`[id="${active}"]`).count(), 1);
      await deliver(page, { ...initial, generation: 2, previewRevision: 4,
        results: [], selectedId: null, searching: true });
      await deliver(page, initial);
      assert.equal(await page.locator('#resultRows .result').count(), 0);
      assert.equal(await page.locator('#empty').textContent(), 'Searching…');
      console.log('PASS: virtualized selection has no dangling aria reference; rerun rejects old equal-ACK state');
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    fs.rmSync(isolated, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
