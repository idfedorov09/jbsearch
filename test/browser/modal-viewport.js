'use strict';

// Optional browser integration test; see docs/testing/issue-3-scroll-order.md.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { getHtml } = require('../../src/ui/html');

async function main() {
  const executablePath = process.env.JBSEARCH_CHROMIUM;
  if (!executablePath) throw new Error('Set JBSEARCH_CHROMIUM to a Chromium executable.');
  const { chromium } = require(process.env.JBSEARCH_PLAYWRIGHT_CORE || 'playwright-core');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'jbsearch-modal-chromium-'));
  let context;
  try {
    const home = path.join(temporary, 'home');
    const env = { ...process.env, HOME: home, DISPLAY: '', WAYLAND_DISPLAY: '' };
    for (const [name, directory] of Object.entries({
      XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', XDG_DATA_HOME: 'data',
      XDG_STATE_HOME: 'state', XDG_RUNTIME_DIR: 'runtime', TMPDIR: 'tmp'
    })) {
      env[name] = path.join(home, directory);
      await fs.mkdir(env[name], { recursive: true, mode: 0o700 });
    }
    const html = getHtml({ cspSource: 'file:', asWebviewUri: value => pathToFileURL(value).href },
      path.resolve(__dirname, '../..'), { Uri: { joinPath: path.join } });
    const file = path.join(temporary, 'modal.html');
    await fs.writeFile(file, html);
    context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
      executablePath, headless: true, args: ['--no-sandbox'], env,
      viewport: { width: 1100, height: 720 }
    });
    const page = context.pages()[0] || await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__messages = [];
      window.acquireVsCodeApi = () => ({
        getState: () => ({}), setState() {}, postMessage: message => window.__messages.push(message)
      });
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.__messages?.some(message => message.type === 'ready'));
    const base = { id: 'session', mode: 'find', query: 'needle', replacement: '', options: {},
      scope: { kind: 'workspace' }, generation: 1, searching: false, partial: false,
      replacing: false, error: '', notice: '', customScopes: [], patchAcks: {} };
    const row = index => ({ id: `match-${index}`, uri: `file:///${index}.js`, label: `${index}.js`,
      lineText: 'needle', previewMatchStart: 0, previewMatchEnd: 6,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } });
    const results = Array.from({ length: 100 }, (_, index) => row(index));
    const send = state => page.evaluate(value => window.postMessage({ type: 'state', state: value }, '*'), state);
    await send({ ...base, results, selectedId: 'match-36' });
    await page.waitForFunction(() => document.querySelector('#count').textContent.startsWith('100 '));
    await page.evaluate(() => {
      const list = document.querySelector('#results');
      list.scrollTop = 35 * 24 + 7;
      list.dispatchEvent(new Event('scroll'));
    });
    const before = await page.evaluate(() => {
      const list = document.querySelector('#results'), row = document.querySelector('#result-35');
      return { top: list.scrollTop, offset: row.getBoundingClientRect().top - list.getBoundingClientRect().top,
        messages: window.__messages.length };
    });
    const prefix = Array.from({ length: 3 }, (_, index) => ({ ...row(index), id: `inserted-${index}` }));
    await send({ ...base, results: [...prefix, ...results], selectedId: 'match-36' });
    await page.waitForFunction(() => document.querySelector('#results').getAttribute('aria-activedescendant') === 'result-39');
    const after = await page.evaluate(() => {
      const list = document.querySelector('#results'), row = document.querySelector('#result-38');
      return { top: list.scrollTop, offset: row.getBoundingClientRect().top - list.getBoundingClientRect().top,
        selected: document.querySelector('#result-39')?.getAttribute('aria-selected'),
        messages: window.__messages.length, rendered: document.querySelector('#resultRows').children.length };
    });
    assert.equal(before.top, 847);
    assert.equal(after.top, 919);
    assert.ok(Math.abs(after.offset - before.offset) < 0.51);
    assert.equal(after.selected, 'true');
    assert.equal(after.messages, before.messages, 'scrolling and anchoring do not send a search request');
    assert.ok(after.rendered < results.length, 'the list remains virtualized');

    const streamed = [...prefix, ...results];
    await send({ ...base, results: streamed, selectedId: 'match-36', scopeStale: true, needsRerun: true });
    await page.waitForFunction(() => !document.querySelector('#rerunNotice').hidden);
    assert.equal(await page.locator('#rerunSearch').count(), 1);
    const statusBefore = await page.evaluate(() => ({ top: document.querySelector('#results').scrollTop,
      selected: document.querySelector('#results').getAttribute('aria-activedescendant') }));
    await send({ ...base, results: streamed.map(row => ({ ...row, pending: true, resultRevision: 1 })),
      selectedId: 'match-36', scopeStale: true, needsRerun: true });
    await page.waitForFunction(() => document.querySelector('#result-39 .location')?.textContent.includes('Checking'));
    await send({ ...base, results: streamed.map(row => ({ ...row,
      invalid: row.id === 'match-36', resultRevision: 2,
      range: { start: { ...row.range.start, line: row.range.start.line + 3 },
        end: { ...row.range.end, line: row.range.end.line + 3 } }
    })), selectedId: 'match-36', scopeStale: true, needsRerun: true });
    await page.waitForFunction(() => document.querySelector('#result-39 .location')?.textContent.includes('INVALID'));
    const statusAfter = await page.evaluate(() => ({ top: document.querySelector('#results').scrollTop,
      selected: document.querySelector('#results').getAttribute('aria-activedescendant') }));
    assert.deepEqual(statusAfter, statusBefore);
    await page.locator('#rerunSearch').click();
    assert.equal(await page.locator('#rerunSearch').isDisabled(), true);
    await page.evaluate(() => document.querySelector('#rerunSearch').onclick());
    assert.equal(await page.evaluate(() => window.__messages.filter(message => message.type === 'refresh').length), 1);
    await send({ ...base, results: streamed, selectedId: 'match-36' });
    await page.waitForFunction(() => document.querySelector('#rerunNotice').hidden);

    await page.locator('#results').focus();
    await page.keyboard.press('End');
    const navigation = await page.evaluate(() => ({ top: document.querySelector('#results').scrollTop,
      last: window.__messages.at(-1) }));
    assert.equal(navigation.last.type, 'select');
    assert.equal(navigation.last.id, 'match-99');
    assert.ok(navigation.top > after.top, 'explicit navigation may scroll');

    const short = results.slice(0, 20);
    await send({ ...base, generation: 2, results: short, selectedId: 'match-0' });
    await page.waitForFunction(() => document.querySelector('#count').textContent.startsWith('20 '));
    assert.equal(await page.evaluate(() => document.querySelector('#results').scrollTop), 0);
    const bottom = await page.evaluate(() => {
      const list = document.querySelector('#results');
      list.scrollTop = list.scrollHeight - list.clientHeight;
      list.dispatchEvent(new Event('scroll'));
      const index = Math.floor(list.scrollTop / 24), row = document.querySelector(`#result-${index}`);
      return { index, top: list.scrollTop, offset: row.getBoundingClientRect().top - list.getBoundingClientRect().top };
    });
    await send({ ...base, generation: 2, results: [...prefix, ...short], selectedId: 'match-0' });
    await page.waitForFunction(() => document.querySelector('#count').textContent.startsWith('23 '));
    const bottomAfter = await page.evaluate(index => {
      const list = document.querySelector('#results'), row = document.querySelector(`#result-${index + 3}`);
      return { top: list.scrollTop, offset: row.getBoundingClientRect().top - list.getBoundingClientRect().top };
    }, bottom.index);
    assert.equal(bottomAfter.top, bottom.top + 72, 'the new spacer height must be set before restoring an end anchor');
    assert.ok(Math.abs(bottomAfter.offset - bottom.offset) < 0.51);

    await page.locator('#query').fill('changed');
    const pending = await page.evaluate(() => ({ top: document.querySelector('#results').scrollTop,
      rows: document.querySelector('#resultRows').children.length, type: window.__messages.at(-1).type }));
    assert.deepEqual(pending, { top: 0, rows: 0, type: 'update' });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: await page.evaluate(() => navigator.userAgent),
      environment: 'headless Linux; disposable profile, HOME, XDG, and synthetic webview host',
      before, after, statusBefore, statusAfter, rerun: { buttons: 1, requests: 1, generation: 1 },
      navigation, bottom, bottomAfter, pending, pageErrors: errors }, null, 2));
  } finally {
    if (context) await context.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
