'use strict';
(() => {
  const api = acquireVsCodeApi(),
    $ = (id) => document.getElementById(id);
  const send = (type, data = {}) => api.postMessage({ type, ...data });
  const clientId = crypto.randomUUID(),
    pending = new Map();
  let revision = 0,
    acknowledgedRevision = 0;
  let state = {
      query: '',
      results: [],
      options: {},
      scope: { kind: 'workspace' },
      mode: 'find',
      selectedId: null
    },
    composing = false,
    updating = false;
  let hostState = state;
  const previous = api.getState() || {};
  // Keep virtual positions in sync with the themed row height in search.css.
  const rowHeight =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) ||
    24;
  function patch(values) {
    if (updating) return;
    if (state.replacing) {
      render(hostState);
      return;
    }
    const nextRevision = ++revision;
    for (const [key, value] of Object.entries(values))
      pending.set(key, { revision: nextRevision, value });
    render(hostState);
    send('update', { clientId, revision: nextRevision, patch: values });
  }
  function receiveState(next) {
    const acknowledged = next.patchAcks?.[clientId] || 0;
    if (acknowledged < acknowledgedRevision) return;
    acknowledgedRevision = acknowledged;
    for (const [key, value] of pending) if (value.revision <= acknowledged) pending.delete(key);
    hostState = next;
    render(next);
  }
  function replace(all = false) {
    if (
      pending.size ||
      state.searching ||
      state.replacing ||
      state.error ||
      !state.results.length ||
      (all && state.partial) ||
      (!all && !state.selectedId)
    )
      return;
    send(all ? 'replaceAll' : 'replace', {
      id: state.selectedId,
      generation: state.generation
    });
  }
  function resizeInput(input) {
    input.style.height = '22px';
    input.style.height = `${Math.min(110, input.scrollHeight)}px`;
  }
  for (const id of ['query', 'replacement', 'mask', 'include', 'exclude']) {
    $(id).addEventListener('input', () => {
      if (id === 'query' || id === 'replacement') resizeInput($(id));
      patch({ [id]: $(id).value });
    });
  }
  for (const id of ['maskEnabled', 'respectExcludes'])
    $(id).addEventListener('change', () => patch({ [id]: $(id).checked }));
  for (const id of ['caseSensitive', 'wholeWord', 'regex', 'preserveCase'])
    $(id).onclick = () => patch({ [id]: !state.options[id] });
  $('clear').onclick = () => {
    patch({ query: '' });
    $('query').focus();
  };
  function newline(id) {
    const input = $(id);
    input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input'));
    input.focus();
  }
  $('newline').onclick = () => newline('query');
  $('replaceNewline').onclick = () => newline('replacement');
  for (const button of document.querySelectorAll('[data-scope]'))
    button.onclick = () => {
      const kind = button.dataset.scope;
      if (kind === 'folder') send('pickFolder');
      else if (kind === 'directory') send('pickDirectory');
      else patch({ scope: { kind } });
    };
  $('customScope').onchange = () => {
    if ($('customScope').value) patch({ scope: { kind: 'custom', name: $('customScope').value } });
  };
  $('filtersToggle').onclick = () => {
    const visible = $('filters').hidden;
    $('filters').hidden = !visible;
    $('filtersToggle').setAttribute('aria-expanded', String(visible));
  };
  $('settings').onclick = () => send('settings');
  $('openTab').onclick = () => send($('newTab').checked ? 'newTab' : 'openTab');
  $('replace').onclick = () => replace();
  $('replaceAll').onclick = () => replace(true);
  $('query').addEventListener('compositionstart', () => (composing = true));
  $('query').addEventListener('compositionend', () => (composing = false));
  function selectedIndex() {
    return state.results.findIndex((result) => result.id === state.selectedId);
  }
  function select(index, focus = false) {
    const match = state.results[Math.max(0, Math.min(index, state.results.length - 1))];
    if (!match) return;
    state.selectedId = match.id;
    send('select', { id: match.id });
    const top = state.results.indexOf(match) * rowHeight;
    if (top < $('results').scrollTop) $('results').scrollTop = top;
    else if (top + rowHeight > $('results').scrollTop + $('results').clientHeight)
      $('results').scrollTop = top + rowHeight - $('results').clientHeight;
    renderRows();
    if (focus) $('results').focus();
  }
  document.addEventListener('keydown', (event) => {
    if (event.isComposing || composing) return;
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      send($('newTab').checked ? 'newTab' : 'openTab');
      return;
    }
    if (event.key === 'Escape') {
      if (!$('filters').hidden) {
        event.preventDefault();
        event.stopPropagation();
        $('filters').hidden = true;
        $('filtersToggle').setAttribute('aria-expanded', 'false');
      }
      // Otherwise allow the workbench's native modal Escape binding.
      return;
    }
    if (
      (event.target === $('query') || event.target === $('replacement')) &&
      event.key === 'Enter'
    ) {
      event.preventDefault();
      if (event.shiftKey) newline(event.target.id);
      else if (event.target === $('query')) select(Math.max(0, selectedIndex()), true);
      else if (state.mode === 'replace') replace();
    } else if (
      event.target === $('query') &&
      event.key === 'ArrowDown' &&
      !state.query.includes('\n')
    ) {
      event.preventDefault();
      select(0, true);
    }
  });
  $('results').addEventListener('keydown', (event) => {
    const index = selectedIndex();
    let next;
    if (event.key === 'ArrowDown') next = index + 1;
    else if (event.key === 'ArrowUp') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = state.results.length - 1;
    else if (event.key === 'PageDown') next = index + 8;
    else if (event.key === 'PageUp') next = index - 8;
    if (next !== undefined) {
      event.preventDefault();
      select(next);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      send('openResult', { id: state.selectedId });
    }
  });
  $('results').addEventListener('scroll', renderRows);
  function highlighted(text, start, end) {
    const fragment = document.createDocumentFragment();
    fragment.append(document.createTextNode(text.slice(0, start)));
    const mark = document.createElement('mark');
    mark.className = 'match';
    mark.textContent = text.slice(start, end) || '\u200b';
    fragment.append(mark, document.createTextNode(text.slice(end)));
    return fragment;
  }
  function renderRows() {
    const results = state.results,
      container = $('resultRows');
    container.style.height = `${results.length * rowHeight}px`;
    container.replaceChildren();
    const start = Math.max(0, Math.floor($('results').scrollTop / rowHeight) - 5),
      end = Math.min(results.length, start + Math.ceil($('results').clientHeight / rowHeight) + 12);
    for (let i = start; i < end; i++) {
      const result = results[i],
        row = document.createElement('div');
      row.className = 'result' + (result.id === state.selectedId ? ' selected' : '');
      row.id = `result-${i}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(result.id === state.selectedId));
      row.style.position = 'absolute';
      row.style.top = `${i * rowHeight}px`;
      row.style.left = '0';
      row.style.right = '0';
      const snippet = document.createElement('span');
      snippet.className = 'snippet';
      const rawText = result.lineText || result.preview || '';
      const start = result.previewMatchStart ?? result.range.start.character;
      const end = result.previewMatchEnd ?? result.range.end.character;
      // Omit indentation unless it is itself part of the match.
      const trimmed = Math.min(rawText.match(/^[ \t]*/)[0].length, start);
      const text = rawText.slice(trimmed);
      snippet.append(
        highlighted(text, start - trimmed, end - trimmed)
      );
      const location = document.createElement('span');
      location.className = 'location';
      location.textContent = `${result.label || result.relativePath?.split('/').pop() || 'Untitled'} ${result.range.start.line + 1}`;
      location.title = result.relativePath || result.uri;
      row.append(snippet, location);
      row.onclick = () => select(i);
      row.ondblclick = () => send('openResult', { id: result.id });
      container.append(row);
    }
    if (state.selectedId)
      $('results').setAttribute('aria-activedescendant', `result-${selectedIndex()}`);
    $('empty').hidden = results.length > 0;
  }
  function render(next) {
    updating = true;
    const reset = next.generation !== state.generation;
    state = { ...next, options: { ...next.options } };
    for (const [key, { value }] of pending) {
      if (['query', 'replacement', 'scope'].includes(key)) state[key] = value;
      else state.options[key] = value;
    }
    const pendingSearch = [...pending.keys()].some(
      (key) => !['replacement', 'preserveCase'].includes(key)
    );
    if (pendingSearch) {
      state.results = [];
      state.selectedId = null;
      state.searching = Boolean(state.query);
      state.partial = false;
      state.error = '';
      state.notice = '';
    }
    for (const control of document.querySelectorAll('input, textarea, select, button'))
      control.disabled = Boolean(state.replacing);
    $('heading').textContent = state.mode === 'replace' ? 'Replace in Files' : 'Find in Files';
    $('replacementRow').hidden = state.mode !== 'replace';
    $('replace').hidden = $('replaceAll').hidden = state.mode !== 'replace';
    for (const id of ['query', 'replacement', 'mask', 'include', 'exclude']) {
      const value =
        id === 'query'
          ? state.query
          : id === 'replacement'
            ? state.replacement
            : state.options[id] || '';
      if ($(id).value !== value) $(id).value = value;
      if (id === 'query' || id === 'replacement') resizeInput($(id));
    }
    for (const id of ['maskEnabled', 'respectExcludes']) $(id).checked = Boolean(state.options[id]);
    $('mask').disabled = state.replacing || !state.options.maskEnabled;
    for (const id of ['caseSensitive', 'wholeWord', 'regex', 'preserveCase'])
      $(id).setAttribute('aria-pressed', String(Boolean(state.options[id])));
    for (const button of document.querySelectorAll('[data-scope]')) {
      const active = button.dataset.scope === state.scope.kind;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    const custom = $('customScope');
    if (JSON.stringify(state.customScopes || []) !== custom.dataset.scopes) {
      custom.dataset.scopes = JSON.stringify(state.customScopes || []);
      custom.replaceChildren(
        new Option('Scope…', ''),
        ...(state.customScopes || []).map((name) => new Option(name, name))
      );
    }
    custom.value = state.scope.kind === 'custom' ? state.scope.name : '';
    custom.classList.toggle('active', state.scope.kind === 'custom');
    $('scopePath').textContent = state.scope.label || state.scope.path || '';
    $('scopePath').title = state.scope.path || '';
    const files = new Set(state.results.map((result) => result.uri)).size;
    $('count').textContent = state.query
      ? `${state.results.length}${state.partial ? '+' : ''} ${state.results.length === 1 ? 'match' : 'matches'} in ${files} ${files === 1 ? 'file' : 'files'}${state.searching ? ' · searching…' : ''}`
      : '';
    $('message').hidden = !state.error && !state.notice;
    $('message').className = state.error ? 'error' : '';
    $('message').textContent = state.error || state.notice || '';
    $('empty').textContent = state.error
      ? 'Fix the query or filters to continue'
      : !state.query
        ? 'Type to search in your project'
        : state.searching
          ? 'Searching…'
          : 'No matches found';
    $('replaceAll').disabled =
      pending.size > 0 ||
      state.searching ||
      state.partial ||
      !state.results.length ||
      state.replacing ||
      Boolean(state.error);
    $('replace').disabled =
      pending.size > 0 ||
      !state.selectedId ||
      state.searching ||
      state.replacing ||
      Boolean(state.error);
    if (reset || pendingSearch) {
      $('results').scrollTop = 0;
      if (!state.selectedId) {
        $('code').replaceChildren(
          Object.assign(document.createElement('div'), {
            className: 'empty',
            textContent: 'Select a result to preview its code'
          })
        );
        $('previewName').textContent = 'Preview';
        $('previewPath').textContent = '';
      }
    }
    renderRows();
    updating = false;
  }
  function renderPreview(preview) {
    if (preview.id !== state.selectedId) return;
    $('previewName').textContent = preview.name || 'Preview';
    $('previewPath').textContent = preview.path || '';
    $('previewNote').textContent = preview.note || '';
    $('previewNote').title = preview.note || '';
    const pre = document.createElement('pre');
    for (const line of preview.lines) {
      const row = document.createElement('div');
      row.className = 'code-line' + (line.selected ? ' current' : '');
      row.dataset.line = line.number;
      const number = document.createElement('span');
      number.className = 'line-number';
      number.textContent = line.number;
      const text = document.createElement('span');
      text.className = 'code-text';
      row.append(number, text);
      const markers = new Map();
      for (const range of line.highlights.filter((r) => r.start === r.end)) {
        markers.set(range.start, markers.get(range.start) || range.selected);
      }
      function appendMarker(position, container = text) {
        if (!markers.has(position)) return;
        const marker = document.createElement('span');
        marker.className =
          'match zero-width-match' + (markers.get(position) ? ' selected-match' : '');
        marker.setAttribute('aria-label', 'Zero-width match');
        container.append(marker);
        markers.delete(position);
      }
      let offset = 0;
      let activeRange;
      let highlight;
      for (const token of line.tokens) {
        const boundaries = new Set([0, token.text.length]);
        for (const range of line.highlights) {
          boundaries.add(Math.max(0, Math.min(token.text.length, range.start - offset)));
          boundaries.add(Math.max(0, Math.min(token.text.length, range.end - offset)));
        }
        const points = [...boundaries].sort((a, b) => a - b);
        for (let i = 0; i < points.length - 1; i++) {
          const start = points[i],
            end = points[i + 1],
            span = document.createElement('span');
          span.textContent = token.text.slice(start, end);
          if (token.color && /^#[\da-f]{6,8}$/i.test(token.color)) span.style.color = token.color;
          if (token.fontStyle & 1) span.style.fontStyle = 'italic';
          if (token.fontStyle & 2) span.style.fontWeight = 'bold';
          const decoration = [];
          if (token.fontStyle & 4) decoration.push('underline');
          if (token.fontStyle & 8) decoration.push('line-through');
          if (decoration.length) span.style.textDecoration = decoration.join(' ');
          const range = line.highlights.find(
            (r) => r.start < offset + end && r.end > offset + start
          );
          appendMarker(offset + start, range && range === activeRange ? highlight : text);
          if (range !== activeRange) {
            activeRange = range;
            if (range) {
              // One decoration per match, with syntax colors on its children.
              // Keep adjacent matches separate even when their styles agree.
              highlight = document.createElement('span');
              highlight.className = 'match' + (range.selected ? ' selected-match' : '');
              text.append(highlight);
            }
          }
          (range ? highlight : text).append(span);
        }
        offset += token.text.length;
      }
      appendMarker(offset);
      pre.append(row);
    }
    $('code').replaceChildren(pre);
    const selected = pre.querySelector(`[data-line="${preview.selectedLine}"]`);
    if (selected)
      $('code').scrollTop = Math.max(0, selected.offsetTop - $('code').clientHeight * 0.3);
  }
  let dragging = false;
  function setHeight(height) {
    const available = $('app').clientHeight;
    $('results').style.height = `${Math.max(56, Math.min(available * 0.6, height))}px`;
    renderRows();
  }
  $('splitter').addEventListener('pointerdown', (event) => {
    dragging = true;
    $('splitter').setPointerCapture(event.pointerId);
  });
  $('splitter').addEventListener('pointermove', (event) => {
    if (dragging) setHeight(event.clientY - $('results').getBoundingClientRect().top);
  });
  $('splitter').addEventListener('pointerup', () => {
    dragging = false;
    api.setState({ resultsHeight: $('results').offsetHeight });
  });
  $('splitter').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setHeight($('results').offsetHeight + (event.key === 'ArrowUp' ? -20 : 20));
    }
  });
  if (previous.resultsHeight) setHeight(previous.resultsHeight);
  new ResizeObserver(() => renderRows()).observe($('results'));
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'state') receiveState(message.state);
    else if (message.type === 'preview') renderPreview(message.preview);
    else if (message.type === 'focus') {
      $('query').focus();
      $('query').select();
    }
  });
  $('shortcut').textContent = /Mac/.test(navigator.platform) ? '⌘↵' : 'Ctrl+↵';
  send('ready', { clientId });
  $('query').focus();
})();
