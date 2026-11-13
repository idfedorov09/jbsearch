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
  removeAttribute(name) { delete this.attributes[name]; }
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
    generation: 1, previewRevision: 0, previewRequestId: null,
    actionBinding: { sessionId: 'session', generation: 1, snapshotToken: 'full-model' },
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
    elements, scopes,
    receive: data => window.dispatchEvent({ type: 'message', data: structuredClone(data) }),
    messages,
    snapshot,
    deliver,
    preview(value) {
      window.dispatchEvent({ type: 'message', data: { type: 'preview', preview: { generation: snapshot.generation, resultRevision: snapshot.results.find(row => row.id === value.id)?.resultRevision || 0, previewRevision: snapshot.previewRevision || 0, previewRequestId: snapshot.previewRequestId || null, ...value } } });
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
  ui.preview({ id: 'match', generation: 1, resultRevision: 0, previewRevision: 0, previewRequestId: null, name: 'one.js', path: 'one.js', selectedLine: 1, lines });
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

test('a failed preflight offers rerun without hiding the existing result list', () => {
  const ui = harness();
  assert.equal(ui.elements.get('rerunSearch').hidden, true);
  ui.deliver({ ...ui.snapshot, replacing: true, notice: 'Checking the current search scope before Replace All…' });
  assert.equal(ui.elements.get('replaceAll').disabled, true);
  assert.match(ui.elements.get('message').textContent, /Checking/);
  ui.deliver({ ...ui.snapshot, error: 'The search results changed. Rerun Search before replacing.', needsRerun: true });
  assert.equal(ui.elements.get('rerunSearch').hidden, false);
  assert.equal(ui.elements.get('rerunSearch').disabled, false);
  assert.equal(ui.elements.get('empty').hidden, true);
  ui.click('rerunSearch');
  assert.equal(ui.messages.at(-1).type, 'refresh');
  ui.deliver({ ...ui.snapshot, searching: true, results: [], selectedId: null });
  assert.equal(ui.elements.get('rerunSearch').hidden, true);
});

test('modal diagnostics show only the summary and do not block complete searches', () => {
  const ui = harness();
  const diagnosticsSummary = '1 binary file excluded from text search; contents are not searched or replaced.';
  const diagnostics = `${diagnosticsSummary}\n/workspace/<script>.png — binary file excluded\n5 additional paths are not shown.`;
  ui.deliver({ ...ui.snapshot, diagnostics, diagnosticsSummary });
  const element = ui.elements.get('diagnostics');
  assert.equal(element.hidden, false);
  assert.equal(element.textContent, diagnosticsSummary);
  assert.doesNotMatch(element.textContent, /workspace|<script>|additional paths/);
  assert.equal(ui.elements.get('replaceAll').disabled, false);
  ui.click('replaceAll');
  assert.equal(ui.messages.at(-1).type, 'replaceAll');
});

test('modal diagnostics have no detailed fallback when the summary is absent or empty', () => {
  const ui = harness();
  const diagnostics = '/workspace/template.docx — ZIP container excluded';
  for (const diagnosticsSummary of [undefined, '']) {
    ui.deliver({ ...ui.snapshot, diagnostics, diagnosticsSummary });
    assert.equal(ui.elements.get('diagnostics').hidden, true);
    assert.equal(ui.elements.get('diagnostics').textContent, '');
  }
});

test('modal summaries remain plain text', () => {
  const ui = harness();
  const diagnosticsSummary = '<img src=x onerror=alert(1)> & incomplete inputs';
  ui.deliver({ ...ui.snapshot, diagnosticsSummary });
  const element = ui.elements.get('diagnostics');
  assert.equal(element.hidden, false);
  assert.equal(element.textContent, diagnosticsSummary);
  assert.deepEqual(element.children, [], 'summary text must not be interpreted as HTML');
});

test('compact diagnostics preserve incomplete-search guards, general messages and Rerun', () => {
  const ui = harness();
  const diagnosticsSummary = '1 file could not be searched; results are incomplete.';
  const diagnostics = `${diagnosticsSummary}\n/workspace/large.txt — exceeds the text file size limit`;
  const current = { ...ui.snapshot, diagnostics, diagnosticsSummary, partial: true, needsRerun: true };
  ui.deliver({ ...current, notice: 'Result limit reached. Narrow the search before Replace All.' });
  assert.match(ui.elements.get('message').textContent, /Result limit reached/);
  assert.equal(ui.elements.get('diagnostics').textContent, diagnosticsSummary);
  assert.equal(ui.elements.get('diagnostics').hidden, false);
  assert.equal(ui.elements.get('replaceAll').disabled, true);
  ui.click('replaceAll');
  assert.equal(ui.messages.some(message => message.type === 'replaceAll'), false);
  ui.deliver({ ...current, error: 'The search results changed. Rerun Search before replacing.' });
  assert.match(ui.elements.get('message').textContent, /search results changed/);
  assert.equal(ui.elements.get('message').className, 'error');
  assert.equal(ui.elements.get('rerunSearch').hidden, false);
  assert.equal(ui.elements.get('rerunSearch').disabled, false);
  assert.equal(ui.elements.get('diagnostics').textContent, diagnosticsSummary);
  ui.click('rerunSearch');
  assert.equal(ui.messages.at(-1).type, 'refresh');
});

for (const field of ['query', 'mask', 'include', 'exclude', 'caseSensitive', 'maskEnabled', 'scope', 'clear']) {
  test(`pending ${field} search edits immediately clear the old modal summary`, () => {
    const ui = harness();
    const diagnosticsSummary = '2 binary files excluded from text search; contents are not searched or replaced.';
    const current = { ...ui.snapshot, diagnostics: `${diagnosticsSummary}\n/workspace/old.bin — binary file excluded`, diagnosticsSummary };
    ui.deliver(current);
    assert.equal(ui.elements.get('diagnostics').hidden, false);
    if (['caseSensitive', 'clear'].includes(field)) ui.click(field);
    else if (field === 'maskEnabled') ui.elements.get(field).dispatchEvent({ type: 'change' });
    else if (field === 'scope') ui.scopes.find(button => button.dataset.scope === 'openEditors').onclick();
    else ui.input(field, field === 'query' ? 'next query' : '*.js');
    const diagnostics = ui.elements.get('diagnostics');
    assert.equal(diagnostics.hidden, true);
    assert.equal(diagnostics.textContent, '');
    ui.deliver(current);
    assert.equal(diagnostics.hidden, true, 'an unacknowledged host echo cannot restore an old summary');
    assert.equal(diagnostics.textContent, '');
    ui.deliver({ ...ui.snapshot, generation: 2, patchAcks: { 'test-client': 1 }, diagnosticsSummary: '' });
    assert.equal(diagnostics.hidden, true);
  });
}

for (const field of ['replacement', 'preserveCase']) {
  test(`pending ${field} edits retain diagnostics for the unchanged search`, () => {
    const ui = harness();
    const diagnosticsSummary = '1 binary file excluded from text search; contents are not searched or replaced.';
    ui.deliver({ ...ui.snapshot, diagnosticsSummary });
    if (field === 'replacement') ui.input(field, 'new replacement');
    else ui.click(field);
    assert.equal(ui.elements.get('diagnostics').hidden, false);
    assert.equal(ui.elements.get('diagnostics').textContent, diagnosticsSummary);
    assert.equal(ui.elements.get('replaceAll').disabled, true, 'pending acknowledgement still guards replacement');
  });
}

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
      { type: 'openResult', id: 'match', generation: 1, resultRevision: 0 }
    ]);
  });
}

test('Enter activates the selected result with its search generation', () => {
  const ui = harness();
  ui.elements.get('results').dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  assert.deepEqual(ui.messages.at(-1), { type: 'openResult', id: 'match', generation: 1, resultRevision: 0 });
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

test('Replace All returns the full-model binding independently of virtual visible rows', () => {
  const ui = harness();
  const results = Array.from({ length: 150 }, (_, index) => ({ ...ui.snapshot.results[0], id: `many-${index}` }));
  const actionBinding = { ...ui.snapshot.actionBinding, snapshotToken: 'all-150-not-visible-rows' };
  ui.deliver({ ...ui.snapshot, results, selectedId: results[0].id, actionBinding });
  assert.ok(ui.elements.get('resultRows').children.length < results.length);
  ui.click('replaceAll');
  assert.deepEqual(ui.messages.at(-1), { type: 'replaceAll', id: 'many-0', generation: 1, resultRevision: 0, actionBinding });
  ui.elements.get('results').scrollTop = 3000;
  ui.elements.get('results').dispatchEvent({ type: 'scroll' });
  ui.click('replaceAll');
  assert.deepEqual(ui.messages.at(-1).actionBinding, actionBinding);
});

test('frozen review disables query/plan mutation and has an explicit bound action, not a searching draft', () => {
  const ui = harness(), binding = { ...ui.snapshot.actionBinding, snapshotToken: 'frozen-review' };
  ui.deliver({ ...ui.snapshot, reviewOnly: true, reviewAll: true, actionBinding: binding });
  assert.equal(ui.elements.get('query').disabled, true);
  assert.equal(ui.elements.get('replacement').disabled, true);
  assert.equal(ui.elements.get('openTab').hidden, true);
  assert.equal(ui.elements.get('rerunSearch').hidden, true);
  assert.equal(ui.elements.get('replaceAll').disabled, false);
  assert.equal(ui.elements.get('replaceAll').textContent, 'Replace Reviewed Snapshot');
  assert.match(ui.elements.get('code').children[0].textContent, /Preview unavailable/);
  ui.input('query', 'silently new query');
  ui.input('replacement', 'silently new replacement');
  assert.equal(ui.messages.some(message => message.type === 'update'), false);
  ui.click('rerunSearch');
  assert.equal(ui.messages.some(message => message.type === 'refresh'), false);
  ui.click('replaceAll');
  assert.deepEqual(ui.messages.at(-1).actionBinding, binding);
});

test('Single and All controls and handlers reject unknown or unavailable selected identity', () => {
  for (const status of [{ identityUnknown: true }, { unavailable: true }]) {
    const ui = harness();
    ui.deliver({ ...ui.snapshot, results: [{ ...ui.snapshot.results[0], ...status }] });
    assert.equal(ui.elements.get('replace').disabled, true);
    assert.equal(ui.elements.get('replaceAll').disabled, true);
    ui.click('replace'); ui.click('replaceAll');
    assert.equal(ui.messages.some(message => ['replace', 'replaceAll'].includes(message.type)), false);
  }
});

test('stale modal snapshot keeps its scroll and offers an explicit rerun', () => {
  const ui = harness();
  ui.elements.get('results').scrollTop = 120;
  ui.deliver({ ...ui.snapshot, scopeStale: true });
  assert.equal(ui.elements.get('rerunNotice').hidden, false);
  assert.equal(ui.elements.get('results').scrollTop, 120);
  ui.click('rerunSearch');
  assert.equal(ui.messages.at(-1).type, 'refresh');
  ui.deliver({ ...ui.snapshot, scopeStale: true, searching: true });
  assert.equal(ui.elements.get('rerunSearch').disabled, true);
  ui.deliver({ ...ui.snapshot, generation: 2, scopeStale: false });
  assert.equal(ui.elements.get('rerunNotice').hidden, true);
  assert.equal(ui.elements.get('results').scrollTop, 0);
});

for (const flags of [
  { scopeStale: true, needsRerun: false },
  { scopeStale: false, needsRerun: true },
  { scopeStale: true, needsRerun: true }
]) {
  test(`one contextual rerun works for ${JSON.stringify(flags)}`, () => {
    const ui = harness();
    ui.deliver({ ...ui.snapshot, ...flags });
    assert.equal(ui.elements.get('rerunNotice').hidden, false);
    assert.equal(ui.elements.get('rerunSearch').disabled, false);
    const count = ui.messages.length;
    ui.click('rerunSearch');
    assert.equal(ui.messages.length, count + 1);
    assert.deepEqual(ui.messages.at(-1), { type: 'refresh', generation: 1, requestId: 'test-client:rerun:1' });
    ui.deliver({ ...ui.snapshot, generation: 2, scopeStale: false, needsRerun: false });
    assert.equal(ui.elements.get('rerunNotice').hidden, true);
    ui.elements.get('rerunSearch').onclick();
    assert.equal(ui.messages.length, count + 1, 'a hidden stale action must not refresh');
  });
}


test('contextual rerun cannot refresh during a search, replacement, or pending patch', () => {
  const ui = harness(), button = ui.elements.get('rerunSearch');
  for (const busy of [{ searching: true }, { replacing: true }]) {
    ui.deliver({ ...ui.snapshot, scopeStale: true, needsRerun: true, ...busy });
    assert.equal(ui.elements.get('rerunNotice').hidden, false);
    assert.equal(button.disabled, true);
    const count = ui.messages.length;
    button.onclick();
    assert.equal(ui.messages.length, count, 'the handler must also reject late clicks');
  }
  ui.deliver({ ...ui.snapshot, scopeStale: false, needsRerun: true });
  ui.input('query', 'changed');
  assert.equal(ui.elements.get('rerunNotice').hidden, true);
  assert.equal(button.disabled, true);
  const count = ui.messages.length;
  button.onclick();
  assert.equal(ui.messages.length, count);
  ui.deliver({ ...ui.snapshot, query: 'changed', generation: 2, needsRerun: false,
    scopeStale: false, patchAcks: { 'test-client': 1 } });
  assert.equal(ui.elements.get('rerunNotice').hidden, true);
});

test('a busy refresh rejection releases only its own Rerun latch, not a newer or accepted request', () => {
  const ui = harness(), button = ui.elements.get('rerunSearch');
  const stale = { ...ui.snapshot, scopeStale: true };
  ui.deliver(stale);
  ui.click('replaceAll');
  ui.click('rerunSearch'); // Host replacement busy state has not arrived yet.
  const first = ui.messages.at(-1);
  assert.equal(first.type, 'refresh');
  ui.deliver({ ...stale, replacing: true });
  ui.receive({ type: 'refreshRejected', requestId: 'unrelated', generation: 1 });
  ui.deliver(stale);
  assert.equal(button.disabled, true, 'same-generation echoes are not a refresh ACK');
  ui.receive({ type: 'refreshRejected', requestId: first.requestId, generation: 1 });
  assert.equal(button.disabled, false, 'refused Rerun is usable after busy clears');
  ui.click('rerunSearch');
  const second = ui.messages.at(-1);
  assert.notEqual(second.requestId, first.requestId);
  ui.receive({ type: 'refreshRejected', requestId: first.requestId, generation: 1 });
  assert.equal(button.disabled, true, 'a late refusal cannot release a later request');
  ui.deliver({ ...stale, searching: true });
  ui.deliver(stale);
  assert.equal(button.disabled, true, 'no duplicate refresh from busy/complete same-generation echoes');
  ui.deliver({ ...ui.snapshot, generation: 2 });
  ui.deliver({ ...ui.snapshot, generation: 2, needsRerun: true });
  assert.equal(button.disabled, false, 'accepted new generation releases admission');
});


test('modal displays checking and invalid rows and disables unsafe replacements', () => {
  const ui = harness();
  const row = { ...ui.snapshot.results[0], pending: true };
  ui.deliver({ ...ui.snapshot, results: [row] });
  assert.equal(ui.elements.get('replace').disabled, true);
  assert.equal(ui.elements.get('replaceAll').disabled, true);
  assert.match(textOf(ui.elements.get('resultRows').children[0]), /Checking/);
  ui.deliver({ ...ui.snapshot, results: [{ ...row, pending: false, invalid: true }] });
  assert.equal(ui.elements.get('replace').disabled, true);
  assert.match(textOf(ui.elements.get('resultRows').children[0]), /INVALID/);
});

function codeText(row) {
  return row.children.slice(1).map(textOf).join('');
}


test('modal blocks invalid, unknown and checking occurrences and includes result revision in Replace', () => {
  const ui = harness();
  const original = ui.snapshot.results[0];
  for (const flag of ['invalid', 'pending', 'identityUnknown']) {
    ui.deliver({ ...ui.snapshot, results: [{ ...original, [flag]: true, resultRevision: 1 }] });
    const before = ui.messages.length;
    ui.click('replace');
    assert.equal(ui.elements.get('replace').disabled, true);
    assert.equal(ui.messages.length, before);
  }
  ui.deliver({ ...ui.snapshot, results: [{ ...original, resultRevision: 7 }] });
  ui.click('replace');
  assert.deepEqual(ui.messages.at(-1), { type: 'replace', id: original.id, generation: 1, resultRevision: 7, actionBinding: ui.snapshot.actionBinding });
});


test('modal discards preview replies for a stale generation or row revision', () => {
  const ui = harness();
  const lines = [{ number: 1, selected: true, tokens: [{ text: 'x' }], highlights: [] }];
  ui.deliver({ ...ui.snapshot, generation: 2,
    results: [{ ...ui.snapshot.results[0], resultRevision: 3 }] });
  ui.preview({ id: 'match', generation: 2, resultRevision: 3, name: 'current', lines, selectedLine: 1 });
  assert.equal(ui.elements.get('previewName').textContent, 'current');
  ui.preview({ id: 'match', generation: 1, resultRevision: 3, name: 'old generation', lines, selectedLine: 1 });
  ui.preview({ id: 'match', generation: 2, resultRevision: 2, name: 'old result', lines, selectedLine: 1 });
  assert.equal(ui.elements.get('previewName').textContent, 'current');
});


test('modal ignores a delayed state from an older search generation', () => {
  const ui = harness();
  ui.deliver({ ...ui.snapshot, generation: 2, query: 'new' });
  ui.deliver({ ...ui.snapshot, generation: 1, query: 'stale' });
  assert.equal(ui.elements.get('query').value, 'new');
});


test('same-generation updates retain the visible result and its offset without changing selection', () => {
  const ui = harness(), list = ui.elements.get('results');
  const results = Array.from({ length: 100 }, (_, index) => ({
    ...ui.snapshot.results[0], id: `match-${index}`
  }));
  ui.deliver({ ...ui.snapshot, results, selectedId: 'match-39' });
  list.scrollTop = 35 * 24 + 7;
  list.dispatchEvent({ type: 'scroll' });
  const before = ui.messages.length;
  const inserted = [0, 1, 2].map(index => ({ ...results[0], id: `inserted-${index}` }));
  ui.deliver({ ...ui.snapshot, results: [...inserted, ...results], selectedId: 'match-39' });
  assert.equal(list.scrollTop, 38 * 24 + 7);
  assert.equal(list.attributes['aria-activedescendant'], 'result-42');
  assert.equal(ui.messages.length, before, 'scrolling and viewport restoration do not request search or selection');
  const anchor = ui.elements.get('resultRows').children.find(row => row.id === 'result-38');
  assert.ok(anchor, 'the original top result remains rendered');
  assert.equal(anchor.style.top, `${38 * 24}px`);
});


test('viewport anchoring never prevents a new search or pending input from resetting scroll', () => {
  const ui = harness(), list = ui.elements.get('results');
  const results = Array.from({ length: 100 }, (_, index) => ({
    ...ui.snapshot.results[0], id: `match-${index}`
  }));
  ui.deliver({ ...ui.snapshot, results, selectedId: 'match-0' });
  list.scrollTop = 500;
  ui.deliver({ ...ui.snapshot, generation: 2, results, selectedId: 'match-0' });
  assert.equal(list.scrollTop, 0, 'a new generation resets scroll even when IDs happen to match');
  list.scrollTop = 500;
  ui.input('query', 'another query');
  assert.equal(list.scrollTop, 0, 'pending query input resets scroll immediately');
  assert.equal(ui.elements.get('resultRows').children.length, 0);
});


test('mask and scope reset the viewport while replacement-only edits do not', () => {
  const resultsFor = ui => Array.from({ length: 100 }, (_, index) => ({
    ...ui.snapshot.results[0], id: `match-${index}`
  }));
  const mask = harness(), maskResults = resultsFor(mask), maskList = mask.elements.get('results');
  mask.deliver({ ...mask.snapshot, results: maskResults, selectedId: 'match-0' });
  maskList.scrollTop = 500;
  mask.input('mask', '*.js');
  assert.equal(maskList.scrollTop, 0);
  assert.equal(mask.elements.get('resultRows').children.length, 0);

  const scope = harness(), scopeResults = resultsFor(scope), scopeList = scope.elements.get('results');
  scope.deliver({ ...scope.snapshot, results: scopeResults, selectedId: 'match-0' });
  scopeList.scrollTop = 500;
  scope.scopes.find(button => button.dataset.scope === 'openEditors').onclick();
  assert.equal(scopeList.scrollTop, 0);
  assert.equal(scope.elements.get('resultRows').children.length, 0);

  const replacement = harness(), replacementResults = resultsFor(replacement);
  const replacementList = replacement.elements.get('results');
  replacement.deliver({ ...replacement.snapshot, results: replacementResults, selectedId: 'match-0' });
  replacementList.scrollTop = 500;
  replacement.input('replacement', 'updated');
  assert.equal(replacementList.scrollTop, 500);
  assert.ok(replacement.elements.get('resultRows').children.length > 0);
});


test('one modal Rerun covers both scope and approval staleness, including busy and duplicate-click guards', () => {
  const ui = harness(), rerun = ui.elements.get('rerunSearch'), notice = ui.elements.get('rerunNotice');
  for (const flags of [{ scopeStale: true }, { needsRerun: true }, { scopeStale: true, needsRerun: true }]) {
    ui.deliver({ ...ui.snapshot, ...flags });
    assert.equal(notice.hidden, false);
    assert.equal(rerun.disabled, false);
  }
  for (const busy of [{ searching: true }, { replacing: true }]) {
    ui.deliver({ ...ui.snapshot, scopeStale: true, needsRerun: true, ...busy });
    assert.equal(rerun.disabled, true);
    const before = ui.messages.length;
    rerun.onclick();
    assert.equal(ui.messages.length, before);
  }
  ui.deliver({ ...ui.snapshot, scopeStale: true, needsRerun: true });
  ui.click('rerunSearch');
  assert.deepEqual(ui.messages.at(-1), { type: 'refresh', generation: 1, requestId: 'test-client:rerun:1' });
  assert.equal(rerun.disabled, true);
  rerun.onclick();
  assert.equal(ui.messages.filter(message => message.type === 'refresh').length, 1);
  ui.deliver({ ...ui.snapshot, generation: 2, results: [], selectedId: null });
  assert.equal(notice.hidden, true);
  ui.deliver({ ...ui.snapshot, generation: 2, needsRerun: true });
  assert.equal(rerun.disabled, false, 'a generation reset releases the old click guard');
  ui.deliver({ ...ui.snapshot, generation: 2, scopeStale: true, needsRerun: true, reviewOnly: true });
  assert.equal(notice.hidden, true, 'a frozen approval review must never turn into a new search');
  rerun.onclick();
  assert.equal(ui.messages.filter(message => message.type === 'refresh').length, 1);
});


test('same-generation status, revalidation and Rerun banners preserve the anchor and selected occurrence', () => {
  const ui = harness(), list = ui.elements.get('results'), rows = ui.elements.get('resultRows');
  const results = Array.from({ length: 100 }, (_, index) => ({
    ...ui.snapshot.results[0], id: `match-${index}`, resultRevision: 0
  }));
  const state = { ...ui.snapshot, results, selectedId: 'match-36' };
  ui.deliver(state);
  list.scrollTop = 35 * 24 + 7;
  list.dispatchEvent({ type: 'scroll' });
  const before = ui.messages.length;
  for (const extra of [
    { scopeStale: true },
    { needsRerun: true, notice: 'The current set changed.' },
    { results: results.map(row => ({ ...row, pending: true, resultRevision: 1 })) },
    { results: results.map(row => ({ ...row, invalid: row.id === 'match-36', resultRevision: 2,
      range: { start: { ...row.range.start, line: row.range.start.line + 3 },
        end: { ...row.range.end, line: row.range.end.line + 3 } } })) }
  ]) {
    ui.deliver({ ...state, ...extra });
    assert.equal(list.scrollTop, 35 * 24 + 7);
    assert.equal(list.attributes['aria-activedescendant'], 'result-36');
    assert.equal(rows.children.find(row => row.id === 'result-36').attributes['aria-selected'], 'true');
  }
  assert.equal(ui.elements.get('replace').disabled, true);
  assert.equal(ui.elements.get('replaceAll').disabled, true);
  assert.match(textOf(rows.children.find(row => row.id === 'result-36')), /INVALID/);
  assert.equal(ui.messages.length, before, 'status/anchor restoration does not search or select');
  ui.deliver({ ...state, scopeStale: true, needsRerun: true });
  ui.input('mask', '*.md');
  assert.equal(ui.elements.get('rerunNotice').hidden, true, 'optimistic parameter reset hides both stale flags');
  assert.equal(list.scrollTop, 0);
  assert.equal(rows.children.length, 0);
});


test('a valid Single remains usable beside an invalid, pending or unknown row; All remains blocked', () => {
  const ui = harness(), valid = ui.snapshot.results[0];
  for (const flags of [{ invalid: true }, { pending: true }, { identityUnknown: true }]) {
    ui.deliver({ ...ui.snapshot, results: [valid, { ...valid, id: 'other', ...flags }] });
    assert.equal(ui.elements.get('replace').disabled, false);
    assert.equal(ui.elements.get('replaceAll').disabled, true);
    const before = ui.messages.length;
    ui.elements.get('replaceAll').onclick();
    assert.equal(ui.messages.length, before);
    ui.deliver({ ...ui.snapshot, results: [valid, { ...valid, id: 'other', ...flags }], selectedId: 'other' });
    assert.equal(ui.elements.get('replace').disabled, true);
    ui.elements.get('replace').onclick();
    assert.equal(ui.messages.length, before);
  }
});
