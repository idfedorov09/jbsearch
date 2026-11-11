'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getHtml } = require('../src/ui/html');
const { SearchController } = require('../src/controller');

class Element {
  constructor(tagName = 'div') {
    Object.assign(this, { tagName, value: '', checked: false, disabled: false, hidden: false,
      style: {}, dataset: {}, attributes: {}, children: [], listeners: {}, scrollTop: 0,
      clientHeight: 160, scrollHeight: 24, offsetHeight: 160, classList: { toggle() {} } });
  }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  dispatchEvent(event) {
    event.target ||= this;
    for (const callback of this.listeners[event.type] || []) callback(event);
    this[`on${event.type}`]?.(event);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) {
    for (const child of children) { child.remove?.(); child.parentElement = this; this.children.push(child); }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = undefined;
    this.children = [];
    this.append(...children);
  }
  insertBefore(child, before) {
    child.remove?.(); child.parentElement = this;
    if (before) this.children.splice(this.children.indexOf(before), 0, child);
    else this.children.push(child);
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = undefined;
  }
  querySelector() { return null; }
  focus() {}
}

function harness() {
  let onMessage;
  const html = getHtml({ cspSource: '', asWebviewUri: value => value }, '.', {
    Uri: { joinPath: (...parts) => parts.join('/') }
  });
  const elements = new Map();
  for (const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new Element(match[1]);
    element.id = match[2];
    elements.set(element.id, element);
  }
  const scopes = [...html.matchAll(/data-scope="([^"]+)"/g)].map(match => {
    const element = new Element('button'); element.dataset.scope = match[1]; return element;
  });
  const document = new Element(), window = new Element(), messages = [];
  document.documentElement = new Element('html');
  document.getElementById = id => elements.get(id);
  document.createElement = tag => new Element(tag);
  document.createTextNode = textContent => ({ textContent });
  document.createDocumentFragment = () => new Element();
  document.querySelectorAll = selector => selector === '[data-scope]' ? scopes :
    [...elements.values(), ...scopes].filter(element => ['input', 'textarea', 'select', 'button'].includes(element.tagName));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../media/search.js'), 'utf8'), {
    document, window, navigator: { platform: 'Linux' }, crypto: { randomUUID: () => 'client' },
    getComputedStyle: () => ({ getPropertyValue: () => '24px' }),
    acquireVsCodeApi: () => ({ getState: () => ({}), setState() {},
      postMessage: message => { messages.push(structuredClone(message)); onMessage?.(message); } }),
    Option: class extends Element { constructor(label, value) { super('option'); this.textContent = label; this.value = value; } },
    ResizeObserver: class { observe() {} }
  });
  const results = Array.from({ length: 80 }, (_, i) => ({
    id: `old-${i}`, uri: `file:///${i}.js`, label: `${i}.js`, lineText: 'old', resultRevision: 0,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }
  }));
  const initial = { id: 'session', mode: 'replace', query: 'old', replacement: 'new',
    options: { maskEnabled: true, mask: '*.js' }, scope: { kind: 'workspace' },
    generation: 1, previewRevision: 3, previewRequestId: null,
    results, selectedId: results[0].id, searching: false,
    partial: false, replacing: false, error: '', notice: '', customScopes: [], patchAcks: {} };
  const deliver = state => window.dispatchEvent({ type: 'message', data: { type: 'state', state: structuredClone(state) } });
  deliver(initial);
  return { elements, scopes, document, window, messages, initial, deliver,
    connect(callback) { onMessage = callback; },
    input(id, value) { const element = elements.get(id); element.value = value; element.dispatchEvent({ type: 'input' }); },
    preview(preview) { window.dispatchEvent({ type: 'message', data: { type: 'preview',
      preview: { previewRevision: 3, previewRequestId: null, ...preview } } }); }
  };
}

for (const [name, change] of [
  ['query', ui => ui.input('query', 'new')],
  ['cleared query', ui => ui.input('query', '')],
  ['mask', ui => ui.input('mask', '*.ts')],
  ['scope', ui => ui.scopes.find(button => button.dataset.scope === 'openEditors').onclick()],
  ['regex', ui => ui.elements.get('regex').onclick()]
]) {
  test(`${name} clears old rows, selection display, preview and scroll before host ACK`, () => {
    const ui = harness();
    ui.elements.get('results').scrollTop = 500;
    ui.preview({ id: 'old-0', generation: 1, resultRevision: 0, name: 'old.js', path: 'old.js', lines: [] });
    assert.equal(ui.elements.get('previewName').textContent, 'old.js');
    change(ui);
    assert.equal(ui.elements.get('resultRows').children.length, 0);
    assert.equal(ui.elements.get('results').scrollTop, 0);
    assert.equal(ui.elements.get('previewName').textContent, 'Preview');
    assert.equal(ui.elements.get('results').attributes['aria-activedescendant'], undefined);
    assert.equal(ui.elements.get('replace').disabled, true);
    assert.equal(ui.elements.get('replaceAll').disabled, true);
    ui.preview({ id: 'old-0', generation: 1, resultRevision: 0, name: 'late old preview', lines: [] });
    assert.equal(ui.elements.get('previewName').textContent, 'Preview');
    ui.elements.get('results').dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
    assert.equal(ui.messages.some(message => message.type === 'openResult'), false);
  });
}

test('rapid optimistic input rejects older ACKs without restoring old rows or text', () => {
  const ui = harness();
  ui.input('query', 'a');
  ui.input('query', 'ab');
  ui.input('query', 'abc');
  for (const revision of [1, 2]) ui.deliver({ ...ui.initial, query: 'a'.repeat(revision), patchAcks: { client: revision } });
  assert.equal(ui.elements.get('query').value, 'abc');
  assert.equal(ui.elements.get('resultRows').children.length, 0);
  ui.deliver({ ...ui.initial, generation: 2, query: 'abc', results: [], selectedId: null,
    searching: true, patchAcks: { client: 3 } });
  ui.deliver({ ...ui.initial, query: 'ab', patchAcks: { client: 2 } });
  assert.equal(ui.elements.get('query').value, 'abc');
  assert.equal(ui.elements.get('resultRows').children.length, 0);
});

test('rapid query, mask and scope edits keep the latest pending parameters', () => {
  const ui = harness();
  ui.input('query', 'needle');
  ui.input('mask', '*.ts');
  ui.scopes.find(button => button.dataset.scope === 'openEditors').onclick();
  const patches = ui.messages.filter(message => message.type === 'update');
  assert.deepEqual(patches.map(message => message.revision), [1, 2, 3]);
  ui.deliver({ ...ui.initial, query: 'needle', patchAcks: { client: 1 } });
  ui.deliver({ ...ui.initial, query: 'needle', options: { maskEnabled: true, mask: '*.ts' },
    patchAcks: { client: 2 } });
  assert.equal(ui.elements.get('query').value, 'needle');
  assert.equal(ui.elements.get('mask').value, '*.ts');
  assert.equal(ui.scopes.find(button => button.dataset.scope === 'openEditors').attributes['aria-pressed'], 'true');
  assert.equal(ui.elements.get('resultRows').children.length, 0);
  ui.deliver({ ...ui.initial, generation: 2, query: 'needle', options: { maskEnabled: true, mask: '*.ts' },
    scope: { kind: 'openEditors' }, results: [], selectedId: null, searching: true, patchAcks: { client: 3 } });
  ui.deliver({ ...ui.initial, query: 'old', patchAcks: { client: 2 } });
  assert.equal(ui.elements.get('query').value, 'needle');
  assert.equal(ui.elements.get('mask').value, '*.ts');
  assert.equal(ui.scopes.find(button => button.dataset.scope === 'openEditors').attributes['aria-pressed'], 'true');
  assert.equal(ui.elements.get('resultRows').children.length, 0);
});

test('replacement-only optimistic input preserves result rows and selection display', () => {
  const ui = harness();
  const before = ui.elements.get('resultRows').children.length;
  assert.ok(before > 0);
  ui.input('replacement', 'different');
  assert.equal(ui.elements.get('resultRows').children.length, before);
  assert.equal(ui.elements.get('replace').disabled, true);
});

test('same-ID old-generation and unbound previews cannot overwrite current preview', () => {
  const ui = harness();
  ui.deliver({ ...ui.initial, generation: 2, previewRevision: 5 });
  for (const stale of [
    { generation: 1, previewRevision: 3 },
    { generation: 2, previewRevision: 4 },
    { generation: 2, previewRevision: 5, resultRevision: 1 },
    { generation: 2, previewRevision: undefined }
  ]) {
    ui.preview({ id: 'old-0', resultRevision: 0, name: 'obsolete', lines: [], ...stale });
    assert.equal(ui.elements.get('previewName').textContent, 'Preview');
  }
  ui.preview({ id: 'old-0', generation: 2, resultRevision: 0,
    previewRevision: 5, name: 'current', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'current');
});

test('rapid keyboard A-to-B-to-A requires the latest explicit preview request', () => {
  const ui = harness();
  const list = ui.elements.get('results');
  for (const key of ['ArrowDown', 'ArrowUp'])
    list.dispatchEvent({ type: 'keydown', key, preventDefault() {} });
  const selects = ui.messages.filter(message => message.type === 'select');
  assert.deepEqual(selects.map(message => [message.id, message.generation, message.resultRevision]),
    [['old-1', 1, 0], ['old-0', 1, 0]]);
  assert.notEqual(selects[0].previewRequestId, selects[1].previewRequestId);
  ui.preview({ id: 'old-0', generation: 1, resultRevision: 0, name: 'old A', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'Preview');
  ui.deliver({ ...ui.initial, selectedId: 'old-1', previewRevision: 4,
    previewRequestId: selects[0].previewRequestId });
  assert.equal(list.attributes['aria-activedescendant'], 'result-0', 'the latest keyboard selection stays optimistic');
  ui.preview({ id: 'old-1', generation: 1, resultRevision: 0, previewRevision: 4,
    previewRequestId: selects[0].previewRequestId, name: 'old B', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'Preview');
  ui.deliver({ ...ui.initial, previewRevision: 5, previewRequestId: selects[1].previewRequestId });
  ui.preview({ id: 'old-0', generation: 1, resultRevision: 0, previewRevision: 5,
    previewRequestId: selects[1].previewRequestId, name: 'current A', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'current A');
  assert.equal(list.attributes['aria-activedescendant'], 'result-0');
  ui.deliver({ ...ui.initial, previewRevision: 4, previewRequestId: selects[0].previewRequestId });
  ui.preview({ id: 'old-0', generation: 1, resultRevision: 0, name: 'late A', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'current A');
});

test('virtualizing the selected row removes aria reference without changing logical selection', () => {
  const ui = harness(), list = ui.elements.get('results');
  assert.equal(list.attributes['aria-activedescendant'], 'result-0');
  list.scrollTop = 1200;
  list.dispatchEvent({ type: 'scroll' });
  assert.equal(list.attributes['aria-activedescendant'], undefined);
  assert.equal(list.scrollTop, 1200);
  list.dispatchEvent({ type: 'keydown', key: 'Home', preventDefault() {} });
  assert.equal(list.scrollTop, 0);
  assert.equal(list.attributes['aria-activedescendant'], 'result-0');
  assert.equal(ui.messages.at(-1).id, 'old-0');
});

for (const [name, error, message] of [
  ['invalid current regex', 'Invalid regular expression', 'Fix the query or filters to continue'],
  ['nonempty zero-result query', '', 'No matches found']
]) {
  test(`${name} leaves no old preview, note, rows or accessibility selection`, () => {
    const ui = harness();
    ui.preview({ id: 'old-0', generation: 1, resultRevision: 0,
      name: 'old.js', note: 'old warning', lines: [] });
    ui.elements.get('code').scrollTop = 200;
    ui.deliver({ ...ui.initial, results: [], selectedId: null, error });
    assert.equal(ui.elements.get('previewName').textContent, 'Preview');
    assert.equal(ui.elements.get('previewPath').textContent, '');
    assert.equal(ui.elements.get('previewNote').textContent, '');
    assert.equal(ui.elements.get('previewNote').title, '');
    assert.equal(ui.elements.get('code').scrollTop, 0);
    assert.equal(ui.elements.get('resultRows').children.length, 0);
    assert.equal(ui.elements.get('results').attributes['aria-activedescendant'], undefined);
    assert.equal(ui.elements.get('empty').textContent, message);
    assert.equal(ui.elements.get('replaceAll').disabled, true);
  });
}

test('row revision invalidates an already-rendered same-generation preview', () => {
  const ui = harness();
  ui.preview({ id: 'old-0', generation: 1, resultRevision: 0, name: 'before edit', lines: [] });
  ui.deliver({ ...ui.initial, results: ui.initial.results.map(result => ({ ...result, resultRevision: 1 })) });
  assert.equal(ui.elements.get('previewName').textContent, 'Preview');
  ui.preview({ id: 'old-0', generation: 1, resultRevision: 0, name: 'late pre-edit', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'Preview');
  ui.preview({ id: 'old-0', generation: 1, resultRevision: 1, name: 'after edit', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'after edit');
});

test('a rejected stale-row selection cannot leave a pending ticket blocking current preview', () => {
  const ui = harness();
  ui.elements.get('results').dispatchEvent({ type: 'keydown', key: 'Home', preventDefault() {} });
  const rejected = ui.messages.at(-1);
  const results = ui.initial.results.map(result => ({ ...result, resultRevision: 1 }));
  // The host rejects the old row revision and echoes its actual model without
  // adopting that request; a later automatic/current preview must still work.
  ui.deliver({ ...ui.initial, results });
  ui.preview({ id: 'old-0', generation: 1, resultRevision: 1,
    previewRequestId: rejected.previewRequestId, name: 'rejected request', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'Preview');
  ui.preview({ id: 'old-0', generation: 1, resultRevision: 1, name: 'current revision', lines: [] });
  assert.equal(ui.elements.get('previewName').textContent, 'current revision');
});

test('an equal-ACK old-generation state cannot undo an explicit rerun', () => {
  const ui = harness();
  ui.deliver({ ...ui.initial, generation: 2, previewRevision: 4, results: [], selectedId: null,
    searching: true });
  ui.deliver(ui.initial);
  assert.equal(ui.elements.get('resultRows').children.length, 0);
  assert.equal(ui.elements.get('empty').textContent, 'Searching…');
});

test('production controller and webview agree on reset, same-ID delivery and keyboard preview tickets', async t => {
  const ui = harness(), pending = [], intents = [], posted = [];
  const controller = Object.create(SearchController.prototype);
  const session = { ...structuredClone(ui.initial), results: ui.initial.results.slice(0, 2),
    patchAcks: new Map(), panels: new Set() };
  Object.assign(controller, { sessions: new Map([[session.id, session]]), disposed: false,
    configuration: () => ({ get: (key, fallback) => key === 'search.debounceMs' ? 60000 : fallback }),
    request: async current => ({ query: current.query }),
    v: { Uri: { parse: value => value }, workspace: { openTextDocument: async () => ({ version: 1 }) } },
    preview: { render: () => new Promise(resolve => pending.push(resolve)) },
    engine: { search: async (_request, { onBatch }) => {
      const results = ui.initial.results.slice(0, 2);
      onBatch(results);
      return { results, stats: { errors: [], skippedFiles: 0 }, truncated: false };
    } }
  });
  session.panels.add({ webview: { postMessage(message) {
    posted.push(structuredClone(message));
    if (message.type === 'state') ui.deliver(message.state);
    else ui.preview(message.preview);
  } } });
  ui.connect(message => intents.push(Promise.resolve().then(() => controller.message(session, message))));
  t.after(() => { clearTimeout(session.timer); session.abort?.abort(); });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const oldPreview = controller.selectAutomatic(session);
  await tick();
  ui.input('query', 'new');
  assert.equal(ui.elements.get('resultRows').children.length, 0);
  await Promise.all(intents);
  assert.equal(session.generation, 2);
  clearTimeout(session.timer);
  await controller.search(session);
  await tick();
  assert.equal(ui.elements.get('resultRows').children.length, 2);
  assert.equal(ui.elements.get('query').value, 'new');
  pending[0]({ name: 'old asynchronous preview', lines: [] });
  await oldPreview;
  assert.equal(posted.filter(message => message.type === 'preview').length, 0);
  pending.at(-1)({ name: 'current automatic preview', lines: [] });
  await tick();
  assert.equal(ui.elements.get('previewName').textContent, 'current automatic preview');
  const automatic = posted.find(message => message.type === 'preview').preview;
  assert.equal(automatic.generation, 2);
  ui.elements.get('results').dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault() {} });
  await tick();
  const selected = ui.messages.at(-1);
  assert.equal(selected.type, 'select');
  assert.equal(session.previewRequestId, selected.previewRequestId);
  pending.at(-1)({ name: 'current keyboard preview', lines: [] });
  await Promise.all(intents);
  assert.equal(ui.elements.get('previewName').textContent, 'current keyboard preview');
  assert.equal(ui.elements.get('results').attributes['aria-activedescendant'], 'result-1');
  ui.preview(automatic);
  assert.equal(ui.elements.get('previewName').textContent, 'current keyboard preview');
  // Settle the superseded automatic render too; it must not post over selection.
  pending[1]({ name: 'superseded automatic preview', lines: [] });
  await tick();
  assert.equal(ui.elements.get('previewName').textContent, 'current keyboard preview');
});
