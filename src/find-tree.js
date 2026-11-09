'use strict';

const VIEW_ID = 'jbsearch.results';
const SELECT_COMMAND = 'jbsearch.results.select';

const uriText = (value) => typeof value === 'string' ? value : value?.toString() || '';
const nodeId = (sessionId, ...parts) => JSON.stringify([sessionId, ...parts]);
const normalizePath = (value) => String(value || '').replaceAll('\\', '/');

function resultUri(vscode, result) {
  return typeof result.uri === 'string' ? vscode.Uri.parse(result.uri) : result.uri;
}

function fileLocation(vscode, result) {
  const uri = resultUri(vscode, result);
  const path = normalizePath(uri?.path);
  const relative = normalizePath(result.relativePath || result.label || path.slice(path.lastIndexOf('/') + 1));
  const parts = relative.split('/').filter(Boolean);
  const rootPath = relative && path.endsWith(`/${relative}`)
    ? path.slice(0, -relative.length)
    : path.slice(0, path.lastIndexOf('/') + 1);
  const rootUri = uri?.with({ path: rootPath || '/', query: '', fragment: '' });
  return { uri, rootUri, relative, parts };
}

/** The controller owns sorting. Preserve that frozen order after file edits. */
function buildTree(vscode, snapshot) {
  const roots = [];
  const byId = new Map();
  const byResultId = new Map();
  const rootGroups = new Map();
  const createGroup = (id, label, kind, parent, uri) => {
    const node = {
      id, label, kind, sessionId: snapshot.id, parent,
      uri, children: [], groups: new Map(), total: 0, invalid: 0, pending: 0
    };
    byId.set(id, node);
    return node;
  };
  for (const result of snapshot.results || []) {
    const location = fileLocation(vscode, result);
    const rootKey = [String(result.rootName || ''), uriText(location.rootUri)];
    const rootId = nodeId(snapshot.id, 'root', ...rootKey);
    let root = rootGroups.get(rootId);
    if (!root) {
      const label = result.rootName || (snapshot.scope?.kind === 'openEditors' ? 'Open Editors' : 'Files');
      root = createGroup(rootId, label, 'root', undefined, location.rootUri);
      rootGroups.set(rootId, root);
      roots.push(root);
    }
    let parent = root;
    let directory = '';
    for (const part of location.parts.slice(0, -1)) {
      directory += `${directory ? '/' : ''}${part}`;
      const id = nodeId(snapshot.id, 'directory', ...rootKey, directory);
      let node = parent.groups.get(id);
      if (!node) {
        const uri = location.rootUri && vscode.Uri.joinPath(location.rootUri, directory);
        node = createGroup(id, part, 'directory', parent.id, uri);
        parent.groups.set(id, node);
        parent.children.push(node);
      }
      parent = node;
    }
    const fileId = nodeId(snapshot.id, 'file', uriText(location.uri) || location.relative);
    let file = parent.groups.get(fileId);
    if (!file) {
      file = createGroup(fileId, result.label || location.parts.at(-1) || 'Untitled', 'file', parent.id, location.uri);
      file.path = location.relative;
      parent.groups.set(fileId, file);
      parent.children.push(file);
    }
    const match = {
      id: nodeId(snapshot.id, 'match', result.id), kind: 'match',
      sessionId: snapshot.id, result, parent: file.id
    };
    file.children.push(match);
    byId.set(match.id, match);
    byResultId.set(result.id, match);
    for (let ancestor = file; ancestor; ancestor = byId.get(ancestor.parent)) {
      ancestor.total += 1;
      if (result.pending) ancestor.pending += 1;
      else if (result.invalid) ancestor.invalid += 1;
    }
  }
  return { roots, byId, byResultId };
}

function countsFor(results = []) {
  const counts = { total: results.length, valid: 0, invalid: 0, pending: 0, files: 0 };
  const files = new Set();
  for (const result of results) {
    files.add(uriText(result.uri));
    if (result.pending) counts.pending += 1;
    else if (result.invalid) counts.invalid += 1;
    else counts.valid += 1;
  }
  counts.files = files.size;
  return counts;
}

function snippetFor(result, original) {
  const value = result.invalid && !result.pending && original ? original : result;
  const text = String(value.lineText || '');
  const start = Math.max(0, Math.min(text.length, Number(value.previewMatchStart) || 0));
  const end = Math.max(start, Math.min(text.length, Number(value.previewMatchEnd) || 0));
  const indentation = text.length - text.trimStart().length;
  const trim = Math.min(indentation, start);
  const label = text.slice(trim);
  if (!result.invalid && start === end) return {
    label: `${text.slice(trim, start)}∣${text.slice(start)}`,
    highlights: [[start - trim, start - trim + 1]]
  };
  return {
    label: label || (start === end ? '∣' : ' '),
    highlights: !result.invalid && end > start ? [[start - trim, end - trim]] : []
  };
}

function sessionTitle(snapshot) {
  const query = String(snapshot.query || '').replace(/\s+/g, ' ').slice(0, 80);
  return `${snapshot.mode === 'replace' ? 'Replace' : 'Find'}: ${query || 'Results'}`;
}

/** Native workbench rendering; providers and actions may remain on a Remote host. */
class FindTree {
  constructor(vscode, { onSelect, onAction, onSessionChange } = {}) {
    this.v = vscode;
    this.onSelect = onSelect;
    this.onAction = onAction;
    this.onSessionChange = onSessionChange;
    this.sessions = new Map();
    this.activeId = undefined;
    this.disposed = false;
    this.contextValues = new Map();
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
    this.view = vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: false
    });
    this.disposables = [
      this.changeEmitter,
      this.view,
      this.view.onDidChangeSelection(event => this.selectionChanged(event.selection)),
      vscode.commands.registerCommand(SELECT_COMMAND, (sessionId, resultId) => this.select(sessionId, resultId))
    ];
    this.updatePresentation();
  }

  get visible() { return this.view.visible; }
  get state() { return this.sessions.get(this.activeId)?.snapshot; }

  getChildren(node) {
    return node ? this.currentNode(node)?.children || [] : this.sessions.get(this.activeId)?.tree.roots || [];
  }

  getParent(node) {
    return this.sessions.get(node.sessionId)?.tree.byId.get(node.parent);
  }

  currentNode(node) {
    return this.sessions.get(node.sessionId)?.tree.byId.get(node.id);
  }

  getTreeItem(node) {
    node = this.currentNode(node) || node;
    const match = node.kind === 'match';
    const item = new this.v.TreeItem(
      match ? this.matchLabel(node) : node.label,
      match ? this.v.TreeItemCollapsibleState.None : this.v.TreeItemCollapsibleState.Expanded
    );
    item.id = node.id;
    item.contextValue = match
      ? `jbsearch.match.${node.result.pending ? 'pending' : node.result.invalid ? 'invalid' : 'valid'}`
      : `jbsearch.${node.kind}`;
    if (match) {
      const result = node.result;
      const start = result.range?.start || {};
      const line = (start.line || 0) + 1;
      const character = (start.character || 0) + 1;
      const status = result.pending ? 'Checking…' : result.invalid ? 'INVALID' : '';
      item.description = `${line}:${character}${result.pending ? ` · ${status}` : ''}`;
      if (result.invalid && !result.pending)
        item.iconPath = new this.v.ThemeIcon('error', new this.v.ThemeColor('errorForeground'));
      item.tooltip = `${result.relativePath || result.label || result.uri}:${line}:${character}${result.invalidReason ? `\n${result.invalidReason}` : ''}\n${result.lineText || ''}`;
      item.accessibilityInformation = {
        label: `${status ? `${status}, ` : ''}${result.label || 'Occurrence'}, line ${line}, column ${character}, ${result.lineText || ''}`
      };
      // Use a command rather than reacting to programmatic TreeView.reveal:
      // synchronizing the visible selection must never open a document itself.
      item.command = { command: SELECT_COMMAND, title: 'Open Search Result', arguments: [node.sessionId, result.id] };
    } else {
      item.resourceUri = node.uri;
      // Files have match children, so relying on collapsibleState would select
      // folder icons. Let workbench choose icons for the actual resource kind.
      item.iconPath = node.kind === 'file' ? this.v.ThemeIcon.File : this.v.ThemeIcon.Folder;
      const details = [node.invalid ? `${node.invalid} invalid` : '', node.pending ? `${node.pending} checking` : ''].filter(Boolean);
      item.description = `${node.total} ${node.total === 1 ? 'result' : 'results'}${details.length ? ` · ${details.join(' · ')}` : ''}`;
      item.tooltip = node.uri?.toString() || node.path || node.label;
    }
    return item;
  }

  matchLabel(node) {
    const original = this.sessions.get(node.sessionId)?.originals.get(node.result.id);
    const snippet = snippetFor(node.result, original);
    return node.result.invalid && !node.result.pending
      ? { label: `INVALID · ${snippet.label}`, highlights: [] }
      : snippet;
  }

  selectionChanged(selection) {
    if (this.disposed) return;
    const entry = this.sessions.get(this.activeId);
    if (!entry) return;
    const node = selection[0];
    // Native selection also changes on keyboard activation and reveal. It may
    // update controls, but only TreeItem.command activates a source document.
    if (node && node.sessionId !== this.activeId) return;
    const current = node && entry.tree.byId.get(node.id);
    entry.snapshot = {
      ...entry.snapshot,
      selectedId: current?.kind === 'match' ? current.result.id : null
    };
    entry.selectionKnown = true;
    this.updatePresentation();
  }

  update(snapshot, { activate = false } = {}) {
    if (this.disposed || !snapshot?.id) return;
    const previous = this.sessions.get(snapshot.id);
    const sameGeneration = previous?.snapshot.generation === snapshot.generation;
    const originals = sameGeneration ? previous.originals : new Map();
    const state = { ...snapshot, results: Array.isArray(snapshot.results) ? snapshot.results : [] };
    // Controller notifications track the last activated editor occurrence.
    // Keep the tree's actual keyboard selection during same-snapshot validation.
    const selectionKnown = Boolean(sameGeneration && previous.selectionKnown);
    if (selectionKnown) state.selectedId = state.results.some(result => result.id === previous.snapshot.selectedId)
      ? previous.snapshot.selectedId : null;
    for (const result of state.results) {
      if (!originals.has(result.id)) originals.set(result.id, {
        lineText: result.lineText,
        previewMatchStart: result.previewMatchStart,
        previewMatchEnd: result.previewMatchEnd
      });
    }
    this.sessions.set(snapshot.id, { snapshot: state, originals, selectionKnown, tree: buildTree(this.v, state) });
    if (activate || !this.activeId) this.activeId = snapshot.id;
    this.updatePresentation();
    if (this.activeId === snapshot.id) this.changeEmitter.fire(undefined);
  }

  setSessions(snapshots, activeId = this.activeId) {
    if (this.disposed) return;
    const ids = new Set(snapshots.map(snapshot => snapshot.id));
    for (const id of this.sessions.keys()) if (!ids.has(id)) this.sessions.delete(id);
    for (const snapshot of snapshots) this.update(snapshot);
    this.activeId = this.sessions.has(activeId) ? activeId : this.sessions.keys().next().value;
    this.updatePresentation();
    this.changeEmitter.fire(undefined);
  }

  remove(sessionId) {
    if (this.disposed || !this.sessions.delete(sessionId)) return false;
    if (sessionId === this.activeId) this.activeId = [...this.sessions.keys()].at(-1);
    this.updatePresentation();
    this.changeEmitter.fire(undefined);
    return true;
  }

  async selectSession(sessionId, { notify = true } = {}) {
    if (this.disposed || !this.sessions.has(sessionId)) return false;
    const changed = this.activeId !== sessionId;
    this.activeId = sessionId;
    if (changed) {
      const entry = this.sessions.get(sessionId);
      entry.snapshot = { ...entry.snapshot, selectedId: null };
      entry.selectionKnown = true;
    }
    this.updatePresentation();
    this.changeEmitter.fire(undefined);
    if (changed && notify) await this.onSessionChange?.(sessionId);
    return true;
  }

  async pickSession() {
    if (this.disposed || !this.sessions.size) return false;
    const items = [...this.sessions.values()].map(({ snapshot }) => ({
      label: sessionTitle(snapshot),
      description: `${snapshot.id === this.activeId ? 'Current · ' : ''}${this.summary(snapshot)}`,
      detail: this.scopeSummary(snapshot),
      sessionId: snapshot.id,
      picked: snapshot.id === this.activeId
    }));
    const selected = await this.v.window.showQuickPick(items, { placeHolder: 'Switch saved search', matchOnDescription: true });
    return selected ? this.selectSession(selected.sessionId) : false;
  }

  async select(sessionId, resultId) {
    if (this.disposed) return false;
    let entry = this.sessions.get(sessionId);
    if (!entry?.tree.byResultId.has(resultId)) return false;
    await this.selectSession(sessionId);
    entry = this.sessions.get(sessionId);
    if (!entry?.tree.byResultId.has(resultId)) return false;
    entry.snapshot = { ...entry.snapshot, selectedId: resultId };
    entry.selectionKnown = true;
    this.updatePresentation();
    await this.onSelect?.(sessionId, resultId);
    return true;
  }

  async show(sessionId = this.activeId, { focus = true } = {}) {
    if (this.disposed) return false;
    if (sessionId && !await this.selectSession(sessionId, { notify: false })) return false;
    if (focus) await this.v.commands.executeCommand(`${VIEW_ID}.focus`);
    const entry = this.sessions.get(this.activeId);
    const node = entry?.tree.byResultId.get(entry.snapshot.selectedId) || entry?.tree.roots[0];
    if (node) await this.view.reveal(node, { select: node.kind === 'match', focus: false, expand: true });
    return true;
  }

  async navigate(delta) {
    const state = this.state;
    if (this.disposed || !state?.results.length) return false;
    const index = state.results.findIndex(result => result.id === state.selectedId);
    const count = state.results.length;
    const next = index === -1 ? (delta < 0 ? count - 1 : 0) : ((index + delta) % count + count) % count;
    const result = state.results[next];
    await this.select(state.id, result.id);
    const node = this.sessions.get(state.id)?.tree.byResultId.get(result.id);
    if (node) await this.view.reveal(node, { select: true, focus: true, expand: true });
    return true;
  }

  async action(type, node) {
    if (this.disposed) return false;
    if (type === 'close') type = 'closeSearch';
    const sessionId = node?.sessionId || this.activeId;
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    const state = entry.snapshot;
    const id = node?.kind === 'match' ? node.result.id : state.selectedId;
    const selected = state.results.find(result => result.id === id);
    if (node?.kind === 'match' && !selected) return false;
    const available = this.actionsFor(state, selected);
    if ((type === 'replace' && !available.canReplace) ||
        (type === 'replaceAll' && !available.canReplaceAll) ||
        (type === 'refresh' && !available.canRefresh) ||
        (type === 'editSearch' && !available.canEdit) ||
        (type === 'focusPreview' && !selected)) return false;
    await this.selectSession(sessionId);
    const message = { type: type === 'focusPreview' ? 'openResult' : type };
    if (type === 'replace' || type === 'openResult' || type === 'focusPreview') message.id = id;
    if (type === 'replace' || type === 'replaceAll') message.generation = state.generation;
    await this.onAction?.(sessionId, message);
    return true;
  }

  actionsFor(state = this.state, selected) {
    const results = state?.results || [];
    selected ||= results.find(result => result.id === state?.selectedId);
    const canReplace = Boolean(state?.mode === 'replace' && state.query &&
      !state.searching && !state.replacing && !state.error);
    return {
      hasSession: Boolean(state),
      hasResults: results.length > 0,
      hasSessions: this.sessions.size > 1,
      isReplace: state?.mode === 'replace',
      canRefresh: Boolean(state && !state.searching && !state.replacing),
      canEdit: Boolean(state && !state.replacing),
      hasSelection: Boolean(selected),
      canReplace: Boolean(canReplace && selected && !selected.invalid && !selected.pending),
      canReplaceAll: Boolean(canReplace && results.length && !state.partial &&
        results.every(result => !result.invalid && !result.pending))
    };
  }

  summary(state) {
    const counts = countsFor(state.results);
    const statuses = [counts.invalid ? `${counts.invalid} invalid` : '', counts.pending ? `${counts.pending} checking` : ''].filter(Boolean);
    return `${counts.total} ${counts.total === 1 ? 'result' : 'results'} in ${counts.files} ${counts.files === 1 ? 'file' : 'files'}${statuses.length ? ` · ${statuses.join(' · ')}` : ''}${state.partial ? ' · partial' : ''}`;
  }

  scopeSummary(state) {
    const scope = state.scope || {};
    const labels = { workspace: 'In Project', folder: 'Folder', directory: 'Directory', openEditors: 'Open Editors', custom: scope.name || 'Custom Scope' };
    const parts = [labels[scope.kind] || 'In Project'];
    const path = scope.label || scope.path || scope.directory || scope.rootPath;
    if (path) parts.push(String(path));
    const options = state.options || {};
    if (options.maskEnabled && options.mask) parts.push(`mask ${options.mask}`);
    if (options.regex) parts.push('Regex');
    if (options.caseSensitive) parts.push('Match Case');
    if (options.wholeWord) parts.push('Whole Words');
    return parts.join(' · ');
  }

  updatePresentation() {
    const state = this.state;
    this.view.title = state?.mode === 'replace' ? 'Replace' : 'Find';
    this.view.description = state ? String(state.query || '').replace(/\s+/g, ' ').slice(0, 100) : '';
    this.view.message = state
      ? [state.error || (state.searching ? 'Searching…' : this.summary(state)), this.scopeSummary(state), state.notice, state.diagnostics].filter(Boolean).join('\n')
      : 'Run a search, then choose Open in Find Panel to keep its results here.';
    this.view.badge = state ? { value: state.results.length, tooltip: this.summary(state) } : undefined;
    for (const [key, value] of Object.entries(this.actionsFor())) {
      if (this.contextValues.get(key) === value) continue;
      this.contextValues.set(key, value);
      void this.v.commands.executeCommand('setContext', `${VIEW_ID}.${key}`, value);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.sessions.clear();
    this.activeId = undefined;
    for (const disposable of this.disposables) disposable.dispose();
  }
}

module.exports = { FindTree, buildTree, countsFor, snippetFor, VIEW_ID, SELECT_COMMAND };
