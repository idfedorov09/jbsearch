'use strict';
(() => {
  const api = acquireVsCodeApi(),
    $ = (id) => document.getElementById(id);
  const send = (type, data = {}) => api.postMessage({ type, ...data });
  const clientId = crypto.randomUUID(),
    pending = new Map();
  let revision = 0,
    acknowledgedRevision = 0,
    selectionRevision = 0,
    pendingPreviewRequest = null,
    pendingSelectedId = null,
    pendingSelectedRevision = null;
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
  let rerunGeneration, rerunRequestId, rerunRevision = 0;
  const previous = api.getState() || {};
  // Keep virtual positions in sync with the themed row height in search.css.
  const rowHeight =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) ||
    24;
  function patch(values) {
    if (updating || state.reviewOnly) return;
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
    if (next.id === hostState.id &&
        (next.generation < hostState.generation ||
         (next.generation === hostState.generation && next.previewRevision < hostState.previewRevision)))
      return;
    const acknowledged = next.patchAcks?.[clientId] || 0;
    if (acknowledged < acknowledgedRevision) return;
    acknowledgedRevision = acknowledged;
    if (next.generation !== rerunGeneration || (!next.scopeStale && !next.needsRerun)) {
      rerunGeneration = undefined;
      rerunRequestId = undefined;
    }
    for (const [key, value] of pending) if (value.revision <= acknowledged) pending.delete(key);
    const pendingResult = next.results.find(result => result.id === pendingSelectedId);
    if (next.previewRequestId === pendingPreviewRequest ||
        (pendingPreviewRequest && (!pendingResult ||
         (pendingResult.resultRevision || 0) !== pendingSelectedRevision))) {
      pendingPreviewRequest = null;
      pendingSelectedId = null;
      pendingSelectedRevision = null;
    }
    hostState = next;
    render(next);
  }
  function replace(all = false) {
    const targets = all ? state.results : state.results.filter(result => result.id === state.selectedId);
    if (!targets.length || targets.some(result => result.invalid || result.pending || result.unavailable || result.identityUnknown)) return;
    if (
      pending.size ||
      state.searching ||
      state.replacing ||
      state.error ||
      !state.actionBinding ||
      !state.results.length ||
      (all && state.partial) ||
      (!all && !state.selectedId)
    )
      return;
    send(all ? 'replaceAll' : 'replace', {
      id: state.selectedId,
      generation: state.generation,
      resultRevision: state.results.find(result => result.id === state.selectedId)?.resultRevision || 0,
      actionBinding: state.actionBinding
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
  $('rerunSearch').onclick = () => {
    if (pending.size || state.searching || state.replacing || state.reviewOnly ||
        rerunGeneration !== undefined || (!state.scopeStale && !state.needsRerun)) return;
    rerunGeneration = state.generation;
    rerunRequestId = `${clientId}:rerun:${++rerunRevision}`;
    render(hostState);
    send('refresh', { generation: rerunGeneration, requestId: rerunRequestId });
  };
  $('query').addEventListener('compositionstart', () => (composing = true));
  $('query').addEventListener('compositionend', () => (composing = false));
  function selectedIndex() {
    return state.results.findIndex((result) => result.id === state.selectedId);
  }
  function openResult(id, generation = state.generation) {
    if (pending.size || state.reviewOnly || state.replacing || generation !== state.generation ||
        !state.results.some((result) => result.id === id)) return;
    send('openResult', { id, generation, resultRevision: state.results.find(result => result.id === id).resultRevision || 0 });
  }
  function select(index, focus = false) {
    const match = state.results[Math.max(0, Math.min(index, state.results.length - 1))];
    if (!match) return;
    if (state.reviewOnly && !state.reviewAll && match.id !== state.reviewMatchId) return;
    state.selectedId = match.id;
    pendingSelectedId = match.id;
    pendingSelectedRevision = match.resultRevision || 0;
    pendingPreviewRequest = `${clientId}:${++selectionRevision}`;
    send('select', { id: match.id, generation: state.generation,
      resultRevision: match.resultRevision || 0, previewRequestId: pendingPreviewRequest });
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
      if (!state.reviewOnly) send($('newTab').checked ? 'newTab' : 'openTab');
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
    } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      openResult(state.selectedId);
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
  const renderedRows = new Map();
  let renderedGeneration;
  function renderRows() {
    const results = state.results,
      container = $('resultRows');
    container.style.height = `${results.length * rowHeight}px`;
    if (renderedGeneration !== state.generation) {
      container.replaceChildren();
      renderedRows.clear();
      renderedGeneration = state.generation;
    }
    const visibleStart = Math.max(0, Math.floor($('results').scrollTop / rowHeight) - 5),
      visibleEnd = Math.min(results.length, visibleStart + Math.ceil($('results').clientHeight / rowHeight) + 12);
    const visible = new Set(results.slice(visibleStart, visibleEnd).map((result) => result.id));
    for (const [id, entry] of renderedRows) {
      if (visible.has(id)) continue;
      entry.row.remove();
      renderedRows.delete(id);
    }
    for (let i = visibleStart; i < visibleEnd; i++) {
      const result = results[i];
      let entry = renderedRows.get(result.id);
      if (!entry) {
        const row = document.createElement('div'), generation = state.generation;
        entry = { row };
        renderedRows.set(result.id, entry);
        row.onclick = () => {
          const index = state.results.findIndex((match) => match.id === result.id);
          if (generation === state.generation && index >= 0) select(index);
        };
        row.ondblclick = () => openResult(result.id, generation);
      }
      const row = entry.row;
      if (container.children[i - visibleStart] !== row)
        container.insertBefore(row, container.children[i - visibleStart] || null);
      row.className = 'result' + (result.id === state.selectedId ? ' selected' : '') +
        (result.pending ? ' pending' : result.invalid ? ' invalid' : '');
      row.id = `result-${i}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(result.id === state.selectedId));
      row.style.position = 'absolute';
      row.style.top = `${i * rowHeight}px`;
      row.style.left = '0';
      row.style.right = '0';
      const signature = JSON.stringify([
        result.lineText, result.preview, result.previewMatchStart, result.previewMatchEnd,
        result.range, result.label, result.relativePath, result.uri,
        result.pending, result.invalid, result.invalidReason
      ]);
      // Selection/state echoes must retain the same click targets between the
      // two clicks of a native double click, including the snippet's children.
      if (signature === entry.signature) continue;
      entry.signature = signature;
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
      location.textContent = `${result.label || result.relativePath?.split('/').pop() || 'Untitled'} ${result.range.start.line + 1}${result.pending ? ' · Checking…' : result.invalid ? ' · INVALID' : ''}`;
      location.title = [result.relativePath || result.uri, result.invalidReason].filter(Boolean).join('\n');
      row.replaceChildren(snippet, location);
    }
    const selectedRow = renderedRows.get(state.selectedId)?.row;
    if (selectedRow) $('results').setAttribute('aria-activedescendant', selectedRow.id);
    else $('results').removeAttribute('aria-activedescendant');
    $('empty').hidden = results.length > 0;
  }
  function render(next) {
    updating = true;
    const reset = next.generation !== state.generation;
    const top = $('results').scrollTop;
    const topIndex = Math.floor(top / rowHeight);
    const anchor = !reset && state.results[topIndex]
      ? { id: state.results[topIndex].id, index: topIndex, offset: top - topIndex * rowHeight }
      : undefined;
    const previousSelected = state.results.find(result => result.id === state.selectedId);
    state = { ...next, options: { ...next.options } };
    for (const [key, { value }] of pending) {
      if (['query', 'replacement', 'scope'].includes(key)) state[key] = value;
      else state.options[key] = value;
    }
    if (!reset && pendingPreviewRequest && state.results.some(result => result.id === pendingSelectedId))
      state.selectedId = pendingSelectedId;
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
      state.diagnostics = '';
      state.diagnosticsSummary = '';
      state.scopeStale = state.needsRerun = false;
    }
    for (const control of document.querySelectorAll('input, textarea, select, button'))
      control.disabled = Boolean(state.replacing || state.reviewOnly);
    $('heading').textContent = state.reviewOnly ? 'Review Frozen Replacement' : state.mode === 'replace' ? 'Replace in Files' : 'Find in Files';
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
    $('mask').disabled = state.replacing || state.reviewOnly || !state.options.maskEnabled;
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
    $('diagnostics').hidden = !state.diagnosticsSummary;
    $('diagnostics').textContent = state.diagnosticsSummary || '';
    const rerunNeeded = !state.reviewOnly && Boolean(state.scopeStale || state.needsRerun);
    $('rerunNotice').hidden = !rerunNeeded;
    $('rerunSearch').hidden = !rerunNeeded;
    $('rerunMessage').textContent = state.needsRerun
      ? 'The approved results changed. Rerun Search to review current matches.'
      : state.scopeStale ? 'Files in this scope changed. New matches appear after Rerun Search.' : '';
    $('rerunSearch').disabled = !rerunNeeded || pending.size > 0 || state.searching ||
      state.replacing || rerunGeneration !== undefined;
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
      Boolean(state.error) || !state.actionBinding || state.results.some(result => result.invalid || result.pending || result.unavailable || result.identityUnknown);
    $('replace').disabled =
      pending.size > 0 ||
      !state.selectedId ||
      state.searching ||
      state.replacing ||
      Boolean(state.error) || !state.actionBinding || !state.results.some(result => result.id === state.selectedId && !result.invalid && !result.pending && !result.unavailable && !result.identityUnknown);
    $('replaceAll').textContent = state.reviewOnly ? 'Replace Reviewed Snapshot' : 'Replace All';
    $('replace').textContent = state.reviewOnly ? 'Replace Reviewed Occurrence' : 'Replace';
    $('newTabLabel').hidden = Boolean(state.reviewOnly);
    $('openTab').hidden = $('shortcut').hidden = Boolean(state.reviewOnly);
    if (state.reviewOnly) {
      $('replaceAll').hidden = !state.reviewAll;
      $('replace').hidden = state.reviewAll;
      $('code').replaceChildren(Object.assign(document.createElement('div'), {
        className: 'empty',
        textContent: 'Preview unavailable in this frozen review. Rows and replacement parameters are frozen; the source may have changed.'
      }));
      $('previewName').textContent = 'Frozen Snapshot';
      $('previewPath').textContent = '';
    }
    if (reset || pendingSearch) {
      pendingPreviewRequest = null;
      pendingSelectedId = null;
      pendingSelectedRevision = null;
      $('results').scrollTop = 0;
    } else if (anchor) {
      const index = state.results[anchor.index]?.id === anchor.id
        ? anchor.index : state.results.findIndex(result => result.id === anchor.id);
      if (index !== -1) {
        $('resultRows').style.height = `${state.results.length * rowHeight}px`;
        $('results').scrollTop = index * rowHeight + anchor.offset;
      }
    }
    const selected = state.results.find(result => result.id === state.selectedId);
    if (reset || pendingSearch || !selected ||
        (selected.id === previousSelected?.id &&
         (selected.resultRevision || 0) !== (previousSelected.resultRevision || 0)))
      clearPreview();
    renderRows();
    updating = false;
  }
  function clearPreview() {
    $('code').replaceChildren(Object.assign(document.createElement('div'), {
      className: 'empty', textContent: state.reviewOnly ? 'Preview unavailable in this frozen review. Rows and replacement parameters are frozen; the source may have changed.' : 'Select a result to preview its code'
    }));
    $('code').scrollTop = 0;
    $('previewName').textContent = state.reviewOnly ? 'Frozen Snapshot' : 'Preview';
    $('previewPath').textContent = '';
    $('previewNote').textContent = '';
    $('previewNote').title = '';
  }
  function renderPreview(preview) {
    const match = state.results.find(result => result.id === state.selectedId);
    if (state.reviewOnly || !match || !Number.isSafeInteger(preview.previewRevision) ||
        preview.id !== match.id || preview.generation !== state.generation ||
        preview.resultRevision !== (match.resultRevision || 0) ||
        preview.previewRevision !== state.previewRevision ||
        preview.previewRequestId !== (pendingPreviewRequest || state.previewRequestId || null)) return;
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
    if (selected && !preview.preserveScroll)
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
    else if (message.type === 'refreshRejected' && message.requestId === rerunRequestId &&
        message.generation === rerunGeneration) {
      rerunGeneration = undefined;
      rerunRequestId = undefined;
      render(hostState);
    }
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
