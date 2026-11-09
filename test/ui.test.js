'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const { getHtml } = require('../src/ui/html');

class Element {
  constructor(tagName = 'div') {
    Object.assign(this, {
      tagName,
      value: '',
      checked: false,
      disabled: false,
      hidden: false,
      style: {},
      dataset: {},
      attributes: {},
      children: [],
      listeners: {},
      scrollTop: 0,
      clientHeight: 200,
      scrollHeight: 24,
      offsetHeight: 200,
      classList: { toggle() {} }
    });
  }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  dispatchEvent(event) {
    event.target ||= this;
    for (const callback of this.listeners[event.type] || []) callback(event);
    this[`on${event.type}`]?.(event);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  append(...children) {
    for (const child of children) {
      child.remove?.();
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = undefined;
    this.children = [];
    this.append(...children);
  }
  insertBefore(child, before) {
    child.remove?.();
    child.parentElement = this;
    if (!before) this.children.push(child);
    else this.children.splice(this.children.indexOf(before), 0, child);
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = undefined;
  }
  querySelector() {
    return null;
  }
  focus() {}
}

function harness() {
  const html = getHtml({ cspSource: '', asWebviewUri: (value) => value }, '.', {
    Uri: { joinPath: (...parts) => parts.join('/') }
  });
  const elements = new Map();
  for (const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new Element(match[1]);
    element.id = match[2];
    elements.set(element.id, element);
  }
  const scopes = [...html.matchAll(/data-scope="([^"]+)"/g)].map((match) => {
    const element = new Element('button');
    element.dataset.scope = match[1];
    return element;
  });
  const document = new Element(),
    window = new Element(),
    messages = [];
  document.documentElement = new Element('html');
  document.getElementById = (id) => elements.get(id);
  document.createElement = (tagName) => new Element(tagName);
  document.createTextNode = (textContent) => ({ textContent });
  document.createDocumentFragment = () => new Element();
  document.querySelectorAll = (selector) => {
    if (selector === '[data-scope]') return scopes;
    if (selector === 'input, textarea, select, button')
      return [...elements.values(), ...scopes].filter((element) =>
        ['input', 'textarea', 'select', 'button'].includes(element.tagName)
      );
    throw new Error(`Unexpected selector: ${selector}`);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../media/search.js'), 'utf8'), {
    document,
    window,
    getComputedStyle: () => ({
      getPropertyValue: () =>
        fs.readFileSync(path.join(__dirname, '../media/search.css'), 'utf8').match(/--row-height:\s*([^;]+);/)[1]
    }),
    navigator: { platform: 'Linux' },
    crypto: { randomUUID: () => 'test-client' },
    acquireVsCodeApi: () => ({
      getState: () => ({}),
      setState() {},
      postMessage: (message) => messages.push(structuredClone(message))
    }),
    Option: class extends Element {
      constructor(label, value) {
        super('option');
        this.textContent = label;
        this.value = value;
      }
    },
    ResizeObserver: class {
      observe() {}
    }
  });
  const match = {
    id: 'match',
    uri: 'file:///one.js',
    label: 'one.js',
    lineText: 'original',
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } }
  };
  const snapshot = {
    id: 'session',
    mode: 'replace',
    query: 'original',
    replacement: 'new',
    options: { caseSensitive: false },
    scope: { kind: 'workspace' },
    generation: 1,
    results: [match],
    selectedId: match.id,
    searching: false,
    partial: false,
    replacing: false,
    error: '',
    notice: '',
    customScopes: [],
    patchAcks: {}
  };
  const deliver = (state) =>
    window.dispatchEvent({
      type: 'message',
      data: { type: 'state', state: structuredClone(state) }
    });
  deliver(snapshot);
  return {
    elements,
    messages,
    snapshot,
    deliver,
    preview(value) {
      window.dispatchEvent({ type: 'message', data: { type: 'preview', preview: value } });
    },
    input(id, value) {
      const element = elements.get(id);
      element.value = value;
      element.dispatchEvent({ type: 'input' });
    },
    click(id) {
      const element = elements.get(id);
      if (!element.disabled) element.onclick();
    },
    enter(id) {
      document.dispatchEvent({
        type: 'keydown',
        key: 'Enter',
        target: elements.get(id),
        preventDefault() {}
      });
    }
  };
}

function textOf(node) {
  return node.children?.length
    ? node.children.map(textOf).join('')
    : String(node.textContent || '');
}

function previewRows(ui, lines) {
  ui.preview({ id: 'match', name: 'one.js', path: 'one.js', selectedLine: 1, lines });
  return ui.elements.get('code').children[0].children;
}

function matchSpans(row) {
  const matches = [];
  function visit(node) {
    if (node.className?.split(' ').includes('match')) matches.push(node);
    for (const child of node.children || []) visit(child);
  }
  for (const child of row.children.slice(1)) visit(child);
  return matches;
}

function codeText(row) {
  return row.children.slice(1).map(textOf).join('');
}

test('match highlights preserve theme color and combined TextMate font styles', () => {
  const ui = harness();
  const [row] = previewRows(ui, [{
    number: 1, selected: true,
    tokens: [{ text: 'original', color: '#123456', fontStyle: 15 }],
    highlights: [{ start: 0, end: 8, selected: true }]
  }]);
  const matches = matchSpans(row);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].className, 'match selected-match');
  const token = matches[0].children[0];
  assert.equal(token.textContent, 'original');
  assert.equal(token.style.color, '#123456');
  assert.equal(token.style.fontStyle, 'italic');
  assert.equal(token.style.fontWeight, 'bold');
  assert.equal(token.style.textDecoration, 'underline line-through');
  assert.equal(token.className?.includes('match') || false, false);
});

test('one regex match has one outline across syntax tokens and whitespace', () => {
  const ui = harness();
  const [row] = previewRows(ui, [{
    number: 1, selected: true,
    tokens: [
      { text: 'static', color: '#ff7b72', fontStyle: 2 },
      { text: ' ' },
      { text: 'public', color: '#ff7b72' },
      { text: ' ' },
      { text: 'final', color: '#ff7b72', fontStyle: 1 },
      { text: ' ' },
      { text: 'guid', color: '#d2a8ff', fontStyle: 4 },
      { text: ' Shared = ' },
      { text: '"value"', color: '#a5d6ff' },
      { text: ';' }
    ],
    highlights: [{ start: 0, end: 24, selected: true }]
  }]);
  const matches = matchSpans(row);
  assert.equal(codeText(row), 'static public final guid Shared = "value";');
  assert.equal(matches.length, 1, 'a syntax boundary must not add another match outline');
  const match = matches[0];
  assert.equal(match.className, 'match selected-match');
  assert.equal(textOf(match), 'static public final guid');
  assert.deepEqual(match.children.map((token) => token.textContent), [
    'static', ' ', 'public', ' ', 'final', ' ', 'guid'
  ]);
  assert.equal(match.children[0].style.color, '#ff7b72');
  assert.equal(match.children[0].style.fontWeight, 'bold');
  assert.equal(match.children[4].style.fontStyle, 'italic');
  assert.equal(match.children[6].style.color, '#d2a8ff');
  assert.equal(match.children[6].style.textDecoration, 'underline');
});

test('partial syntax tokens keep adjacent matches as separate highlighted ranges', () => {
  const ui = harness();
  const [row] = previewRows(ui, [{
    number: 1, selected: true,
    tokens: [
      { text: 'preab', color: '#112233', fontStyle: 1 },
      { text: 'cde', color: '#445566', fontStyle: 2 },
      { text: 'fpost', color: '#778899', fontStyle: 4 }
    ],
    highlights: [
      { start: 3, end: 6, selected: false },
      { start: 6, end: 9, selected: false }
    ]
  }]);
  const matches = matchSpans(row);
  assert.equal(codeText(row), 'preabcdefpost');
  assert.equal(matches.length, 2, 'adjacent search results must not share a highlight');
  assert.deepEqual(matches.map(textOf), ['abc', 'def']);
  assert.deepEqual(matches.map((match) => match.className), ['match', 'match']);
  assert.deepEqual(matches[0].children.map((token) => token.style.color), ['#112233', '#445566']);
  assert.deepEqual(matches[1].children.map((token) => token.style.color), ['#445566', '#778899']);
  const content = row.children[1].children;
  assert.equal(textOf(content[0]), 'pre');
  assert.equal(content[0].style.fontStyle, 'italic');
  assert.equal(textOf(content.at(-1)), 'post');
  assert.equal(content.at(-1).style.textDecoration, 'underline');
});

test('a multiline match keeps one highlighted fragment per preview line', () => {
  const ui = harness();
  const rows = previewRows(ui, [
    {
      number: 10, selected: true,
      tokens: [{ text: 'before static', color: '#ff7b72' }, { text: ' public', color: '#d2a8ff' }],
      highlights: [{ start: 7, end: 20, selected: true }]
    },
    {
      number: 11, selected: true,
      tokens: [{ text: 'final', color: '#ff7b72' }, { text: ' guid after', color: '#d2a8ff' }],
      highlights: [{ start: 0, end: 10, selected: true }]
    }
  ]);
  assert.deepEqual(rows.map(codeText), ['before static public', 'final guid after']);
  assert.deepEqual(rows.map((row) => matchSpans(row).map(textOf)), [['static public'], ['final guid']]);
  assert.ok(rows.every((row) => matchSpans(row)[0].className === 'match selected-match'));
});

test('zero-width matches stay at exact offsets including token boundaries, EOL and empty lines', () => {
  const ui = harness();
  const rows = previewRows(ui, [
    {
      number: 1, selected: true,
      tokens: [{ text: 'abc', color: '#112233' }, { text: 'def', color: '#445566' }],
      highlights: [
        { start: 0, end: 0 },
        { start: 1, end: 1 },
        { start: 3, end: 3, selected: true },
        { start: 6, end: 6 }
      ]
    },
    { number: 2, selected: true, tokens: [], highlights: [{ start: 0, end: 0, selected: true }] }
  ]);
  function markers(row) {
    let offset = 0;
    const positions = [];
    function visit(node) {
      const classes = node.className?.split(' ') || [];
      if (classes.includes('zero-width-match')) {
        assert.equal(node.attributes['aria-label'], 'Zero-width match');
        positions.push({ offset, selected: classes.includes('selected-match') });
      } else if (node.children?.length) {
        node.children.forEach(visit);
      } else {
        offset += textOf(node).length;
      }
    }
    row.children.slice(1).forEach(visit);
    return positions;
  }
  assert.deepEqual(rows.map(codeText), ['abcdef', '']);
  assert.deepEqual(markers(rows[0]), [
    { offset: 0, selected: false },
    { offset: 1, selected: false },
    { offset: 3, selected: true },
    { offset: 6, selected: false }
  ]);
  assert.deepEqual(markers(rows[1]), [{ offset: 0, selected: true }]);
});

test('late input echoes cannot erase newer text and acknowledged normalization is accepted', () => {
  const ui = harness(),
    { elements, snapshot } = ui;
  ui.input('query', 'a');
  ui.input('query', 'ab');
  ui.input('query', 'abc');
  assert.equal(elements.get('query').value, 'abc');
  assert.equal(elements.get('resultRows').children.length, 0);
  assert.equal(elements.get('replaceAll').disabled, true);
  ui.deliver({ ...snapshot, query: 'a', patchAcks: { 'test-client': 1 } });
  ui.deliver({ ...snapshot, query: 'ab', patchAcks: { 'test-client': 2 } });
  assert.equal(elements.get('query').value, 'abc');
  assert.equal(elements.get('resultRows').children.length, 0);
  ui.deliver({ ...snapshot, query: 'ABC', patchAcks: { 'test-client': 3 } });
  assert.equal(elements.get('query').value, 'ABC');
  assert.equal(elements.get('replaceAll').disabled, false);
  ui.deliver({ ...snapshot, query: 'ab', patchAcks: { 'test-client': 2 } });
  assert.equal(elements.get('query').value, 'ABC');
  ui.click('clear');
  assert.equal(elements.get('query').value, '');
  assert.equal(elements.get('resultRows').children.length, 0);
  ui.deliver({ ...snapshot, query: 'ABC', patchAcks: { 'test-client': 3 } });
  assert.equal(elements.get('query').value, '');
  ui.deliver({
    ...snapshot,
    query: '',
    results: [],
    selectedId: null,
    patchAcks: { 'test-client': 4 }
  });
  assert.equal(elements.get('query').value, '');
});

test('rapid option toggles remain optimistic until their own acknowledgement', () => {
  const ui = harness();
  ui.click('caseSensitive');
  ui.click('caseSensitive');
  const patches = ui.messages.filter((message) => message.type === 'update');
  assert.deepEqual(
    patches.map((message) => message.patch.caseSensitive),
    [true, false]
  );
  assert.equal(ui.elements.get('caseSensitive').attributes['aria-pressed'], 'false');
  ui.deliver({
    ...ui.snapshot,
    options: { caseSensitive: true },
    patchAcks: { 'test-client': 1 }
  });
  assert.equal(ui.elements.get('caseSensitive').attributes['aria-pressed'], 'false');
  assert.equal(ui.elements.get('replaceAll').disabled, true);
  ui.deliver({ ...ui.snapshot, patchAcks: { 'test-client': 2 } });
  assert.equal(ui.elements.get('replaceAll').disabled, false);
});

test('pending replacement blocks both mouse and Enter and rejected patches roll back', () => {
  const ui = harness();
  ui.input('replacement', 'local pending replacement');
  ui.click('replace');
  ui.click('replaceAll');
  ui.enter('replacement');
  assert.equal(
    ui.messages.some((message) => /^replace/.test(message.type)),
    false
  );
  ui.deliver({ ...ui.snapshot, replacing: true });
  assert.equal(ui.elements.get('replacement').value, 'local pending replacement');
  assert.equal(ui.elements.get('query').disabled, true);
  assert.equal(ui.elements.get('caseSensitive').disabled, true);
  ui.deliver({ ...ui.snapshot, replacing: true, patchAcks: { 'test-client': 1 } });
  assert.equal(ui.elements.get('replacement').value, 'new');
  ui.deliver({ ...ui.snapshot, patchAcks: { 'test-client': 1 } });
  assert.equal(ui.elements.get('query').disabled, false);
  assert.equal(ui.elements.get('replace').disabled, false);
  ui.enter('replacement');
  assert.equal(ui.messages.at(-1).type, 'replace');
});

test('diagnostics render file paths as text and do not block complete searches', () => {
  const ui = harness();
  const diagnostics = '1 binary file excluded from text search.\n/workspace/<script>.png — binary file excluded';
  ui.deliver({ ...ui.snapshot, diagnostics });
  const element = ui.elements.get('diagnostics');
  assert.equal(element.hidden, false);
  assert.equal(element.textContent, diagnostics);
  assert.deepEqual(element.children, [], 'paths must not be interpreted as HTML');
  assert.equal(ui.elements.get('replaceAll').disabled, false);
  ui.deliver({ ...ui.snapshot, diagnostics, partial: true });
  assert.equal(ui.elements.get('replaceAll').disabled, true);
  ui.deliver({ ...ui.snapshot, diagnostics: '' });
  assert.equal(element.hidden, true);
});

test('compact virtualized results stay navigable at the end of a long list', () => {
  const ui = harness();
  const results = Array.from({ length: 150 }, (_, index) => ({
    id: `match-${index}`,
    uri: `file:///${index}.js`,
    label: `${index}.js`,
    lineText: '    original',
    previewMatchStart: 4,
    previewMatchEnd: 12,
    range: { start: { line: 0, character: 4 }, end: { line: 0, character: 12 } }
  }));
  ui.deliver({ ...ui.snapshot, results, selectedId: results[0].id });
  const list = ui.elements.get('results'), rows = ui.elements.get('resultRows');
  assert.ok(rows.children.length < results.length);
  const snippet = rows.children[0].children[0].children[0];
  assert.equal(snippet.children[0].textContent, '');
  assert.equal(snippet.children[1].textContent, 'original');
  list.dispatchEvent({ type: 'keydown', key: 'End', preventDefault() {} });
  assert.equal(ui.messages.at(-1).id, 'match-149');
  assert.equal(list.attributes['aria-activedescendant'], 'result-149');
  assert.ok(rows.children.some((row) => row.id === 'result-149'));
  assert.ok(list.scrollTop > 0);
});

test('result snippets retain whitespace that is part of the match', () => {
  const ui = harness();
  const match = {
    ...ui.snapshot.results[0],
    lineText: '    original',
    previewMatchStart: 1,
    previewMatchEnd: 3
  };
  ui.deliver({ ...ui.snapshot, results: [match] });
  const snippet = ui.elements.get('resultRows').children[0].children[0].children[0];
  assert.equal(snippet.children[1].textContent, '  ');
  assert.equal(snippet.children[2].textContent, ' original');
});

for (const mode of ['find', 'replace']) {
  test(`${mode} result double click survives selection and host-state echoes`, () => {
    const ui = harness(), rows = ui.elements.get('resultRows');
    ui.deliver({ ...ui.snapshot, mode, selectedId: null });
    const row = rows.children[0], snippet = row.children[0], highlight = snippet.children[0].children[1];
    row.dispatchEvent({ type: 'click', detail: 1, target: highlight });
    assert.equal(ui.messages.at(-1).type, 'select');
    assert.equal(rows.children[0], row, 'selection must preserve the first click target');
    ui.deliver({ ...ui.snapshot, mode });
    assert.equal(rows.children[0], row, 'a host echo must preserve the first click target');
    assert.equal(row.children[0], snippet);
    assert.equal(snippet.children[0].children[1], highlight);
    row.dispatchEvent({ type: 'click', detail: 2, target: highlight });
    row.dispatchEvent({ type: 'dblclick', detail: 2, target: highlight });
    assert.deepEqual(ui.messages.filter(message => message.type === 'openResult'), [
      { type: 'openResult', id: 'match', generation: 1 }
    ]);
  });
}

test('Enter activates the selected result with its search generation', () => {
  const ui = harness();
  ui.elements.get('results').dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  assert.deepEqual(ui.messages.at(-1), { type: 'openResult', id: 'match', generation: 1 });
  const opened = ui.messages.length;
  ui.elements.get('results').dispatchEvent({ type: 'keydown', key: 'Enter', ctrlKey: true, preventDefault() {} });
  assert.equal(ui.messages.length, opened, 'Ctrl+Enter belongs to Open in Find Panel');
});

test('an old result node cannot activate a newer search or a pending query', () => {
  const ui = harness(), row = ui.elements.get('resultRows').children[0];
  ui.deliver({ ...ui.snapshot, generation: 2 });
  assert.notEqual(ui.elements.get('resultRows').children[0], row);
  row.dispatchEvent({ type: 'dblclick', detail: 2 });
  assert.equal(ui.messages.some(message => message.type === 'openResult'), false);
  const currentRow = ui.elements.get('resultRows').children[0];
  ui.input('query', 'pending');
  currentRow.dispatchEvent({ type: 'dblclick', detail: 2 });
  assert.equal(ui.messages.some(message => message.type === 'openResult'), false);
});

test('virtualized rows keep document order when scrolling back into the list', () => {
  const ui = harness(), list = ui.elements.get('results'), rows = ui.elements.get('resultRows');
  const results = Array.from({ length: 80 }, (_, index) => ({
    ...ui.snapshot.results[0], id: `match-${index}`
  }));
  ui.deliver({ ...ui.snapshot, results, selectedId: 'match-0' });
  list.scrollTop = 600;
  list.dispatchEvent({ type: 'scroll' });
  list.scrollTop = 500;
  list.dispatchEvent({ type: 'scroll' });
  const indices = rows.children.map(row => Number(row.id.replace('result-', '')));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
});
