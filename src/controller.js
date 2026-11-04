'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { SearchEngine } = require('./search');
const { PreviewProvider } = require('./preview');
const { openModal } = require('./modal');
const { planReplacements } = require('./replace');
const { getHtml } = require('./ui/html');
const { FindTree } = require('./find-tree');
const { FindPreview } = require('./find-preview');
const { sortResults, trackDocumentChanges, reconcileDocumentResults,
  markDocumentUnavailable } = require('./find-results');
const VIEW_TYPE = 'jbsearch.session';
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const defaults = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  preserveCase: false,
  maskEnabled: false,
  mask: '',
  include: '',
  exclude: '',
  respectExcludes: true
};
class SearchController {
  constructor(vscode, context, engine = new SearchEngine(), preview = new PreviewProvider(vscode, context)) {
    this.v = vscode;
    this.context = context;
    this.engine = engine;
    this.preview = preview;
    this.sessions = new Map();
    this.currentId = null;
    this.disposed = false;
    this.findPreview = undefined;
    this.findTree = new FindTree(vscode, {
      onSelect: (sessionId, id) => this.findMessage(sessionId, { type: 'select', id }),
      onAction: (sessionId, message) => this.findMessage(sessionId, message),
      onSessionChange: (sessionId) => {
        this.currentId = sessionId;
        if (this.previewSessionId !== sessionId) {
          this.findPreview?.clear();
          this.previewSessionId = undefined;
        }
      }
    });
    this.registerFindCommands();
    if (this.preview.onDidChange) context.subscriptions.push(this.preview.onDidChange(() => {
      this.refreshPreviews();
    }));
    context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(VIEW_TYPE, this, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
      })
    );
    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.preview.invalidate();
        this.refreshPreviews();
      })
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => this.documentChanged(event))
    );
    context.subscriptions.push(
      vscode.window.tabGroups.onDidChangeTabs((event) => {
        if (
          ![...event.opened, ...event.closed, ...event.changed].some(
            (tab) => tab.input instanceof vscode.TabInputText
          )
        )
          return;
        for (const session of this.sessions.values())
          if (
            session.layout !== 'findWindow' && session.scope.kind === 'openEditors' &&
            session.query &&
            session.panels.size &&
            !session.replacing
          )
            this.schedule(session, 150);
      })
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('editor.tokenColorCustomizations') ||
          event.affectsConfiguration('workbench.colorTheme')
        ) {
          this.preview.invalidate();
          this.refreshPreviews();
        }
        if (
          event.affectsConfiguration('jbsearch') ||
          event.affectsConfiguration('search') ||
          event.affectsConfiguration('files.exclude')
        )
          for (const session of this.sessions.values()) {
            this.notify(session);
            if (session.query && session.layout !== 'findWindow') this.schedule(session, 150);
          }
      })
    );
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    for (const event of ['onDidChange', 'onDidCreate', 'onDidDelete'])
      context.subscriptions.push(
        watcher[event]((uri) => {
          for (const session of this.sessions.values())
            if (session.layout === 'findWindow') {
              if (session.searching && !session.replacing) {
                // A snapshot is frozen only once its search has completed. A
                // change during enumeration must not publish stale ranges over
                // edits that already arrived from the text document.
                this.schedule(session, 250);
                continue;
              }
              if (event === 'onDidDelete') {
                this.cancelValidations(session, uri.toString());
                session.results = markDocumentUnavailable(session.results, uri.toString());
                this.notify(session);
                this.updateNativePreview(session);
              } else if (session.results.some(result => result.uri === uri.toString())) {
                this.queueValidation(session, uri.toString(), 250);
              }
            } else if (session.query && session.panels.size && !session.replacing)
              this.schedule(session, 250);
        })
      );
    context.subscriptions.push(watcher, this);
  }
  create(mode = 'find', copy) {
    const id = crypto.randomUUID();
    const session = {
      id,
      uri: this.v.Uri.parse(`jbsearch:/${id}.jbsearch`),
      mode,
      layout: 'modal',
      query: copy?.query || '',
      replacement: copy?.replacement || '',
      options: {
        ...defaults,
        respectExcludes: this.v.workspace
          .getConfiguration('jbsearch')
          .get('search.respectExcludes', true),
        ...copy?.options
      },
      scope: copy ? { ...copy.scope } : { kind: 'workspace' },
      results: [],
      generation: 0,
      selectedId: null,
      panels: new Set(),
      searching: false,
      partial: false,
      error: '',
      notice: '',
      patchAcks: new Map(),
      previewRevision: 0
    };
    this.sessions.set(id, session);
    this.currentId = id;
    return session;
  }
  registerFindCommands() {
    const actions = {
      refresh: 'refresh', editSearch: 'editSearch', replace: 'replace',
      replaceAll: 'replaceAll', closeSearch: 'closeSearch', openResult: 'focusPreview'
    };
    const register = (name, callback) => this.context.subscriptions.push(
      this.v.commands.registerCommand(`jbsearch.results.${name}`, async (...args) => {
        try { return await callback(...args); }
        catch (error) { void this.v.window.showErrorMessage(`JB Search: ${error.message}`); }
      })
    );
    for (const [name, type] of Object.entries(actions))
      register(name, (node) => {
        // Toolbar actions belong to the active search. Workbench may briefly
        // retain another search's selection while refreshing the native tree.
        if (name !== 'replace' && name !== 'openResult') return this.findTree.action(type);
        const selected = node?.sessionId ? node : this.findTree.view.selection?.[0];
        return this.findTree.action(type, selected?.sessionId === this.findTree.activeId ? selected : undefined);
      });
    register('show', () => this.findTree.show());
    register('switchSearch', () => this.findTree.pickSession());
    register('next', () => this.findTree.navigate(1));
    register('previous', () => this.findTree.navigate(-1));
    register('newSearch', () => {
      const source = this.sessions.get(this.findTree.activeId);
      const session = this.create(source?.mode || 'find', source);
      return this.show(session.mode);
    });
  }
  async findMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session || session.layout !== 'findWindow') return;
    try { return await this.message(session, message); }
    catch (error) {
      session.notice = error.message;
      this.notify(session);
      throw error;
    }
  }
  async show(mode = 'find') {
    if (this.disposed) return;
    let session = this.sessions.get(this.currentId) || this.create(mode);
    if (session.layout === 'findWindow') {
      const target = session;
      const draft = this.sessions.get(target.draftId);
      session = draft?.panels.size ? draft : this.create(mode, target);
      session.targetWindowId = target.id;
      target.draftId = session.id;
    }
    this.currentId = session.id;
    session.mode = mode;
    const active = this.v.window.activeTextEditor;
    if (!session.query && active && !active.selection.isEmpty) {
      const selected = active.document.getText(active.selection);
      if (selected.length <= 2000) session.query = selected;
    }
    try {
      if (session.opening) {
        if (!(await session.opening)) return;
        this.notify(session);
        for (const panel of session.panels) void panel.webview.postMessage({ type: 'focus' });
        return;
      }
      const previousPanels = [...session.panels];
      // A fresh resource avoids a workbench race when reusing a retained view
      // across editor groups, especially over Remote SSH. Its stable prefix
      // resolves to the same in-memory session.
      const uri = previousPanels.length
        ? this.v.Uri.parse(`jbsearch:/${session.id}~${crypto.randomUUID()}.jbsearch`)
        : session.uri;
      const opening = openModal(this.v, uri, VIEW_TYPE);
      session.opening = opening;
      let opened;
      try {
        opened = await opening;
      } finally {
        if (session.opening === opening) session.opening = undefined;
      }
      if (!opened) return;
      session.uri = uri;
      for (const panel of previousPanels) panel.dispose();
      this.notify(session);
      for (const panel of session.panels) void panel.webview.postMessage({ type: 'focus' });
      if (session.query) this.schedule(session, 0);
    } catch (error) {
      void this.v.window.showErrorMessage(`JB Search: ${error.message}`);
    }
  }
  openCustomDocument(uri) {
    const id = uri.path
      .split('/')
      .filter(Boolean)[0]
      .replace(/\.jbsearch$/, '')
      .split('~')[0];
    let session = this.sessions.get(id);
    if (!session) {
      session = this.create();
      this.sessions.delete(session.id);
      session.id = id;
      session.uri = uri;
      if (new URLSearchParams(uri.query).get('view') === 'findWindow')
        session.layout = 'findWindow';
      this.sessions.set(id, session);
    }
    this.currentId = id;
    return { uri, session, dispose() {} };
  }
  resolveCustomEditor(document, panel) {
    const session = document.session;
    // Migrate retained editor resources from the former HTML Find Window.
    // Query/results still live only in memory; no source tab is opened here.
    if (session.layout === 'findWindow') {
      this.notify(session);
      return this.findTree.show(session.id).then(async () => {
        await this.closeModalEditors(session);
        panel.dispose();
        await this.v.commands.executeCommand('jbsearch.results.focus');
      });
    }
    session.panels.add(panel);
    panel.title = 'JB Search';
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.v.Uri.joinPath(this.context.extensionUri, 'media')]
    };
    this.renderPanel(session, panel);
    panel.onDidDispose(() => {
      session.panels.delete(panel);
      // The modal may be disposed by focusing the native results view during
      // transfer. Its snapshot now belongs to that view, not to this webview.
      if (session.layout === 'findWindow') return;
      if (!session.panels.size) {
        clearTimeout(session.timer);
        session.abort?.abort();
        session.searching = false;
        this.cancelValidations(session);
        if (session.targetWindowId && this.currentId === session.id)
          this.currentId = this.sessions.has(session.targetWindowId) ? session.targetWindowId : null;
        if (session.targetWindowId) {
          const target = this.sessions.get(session.targetWindowId);
          if (target?.draftId === session.id) delete target.draftId;
        }
        if (session.targetWindowId) {
          this.sessions.delete(session.id);
        }
      }
    });
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.currentId = session.id;
      }
    });
    panel.webview.onDidReceiveMessage((message) => {
      void this.message(session, message).catch((error) => {
        session.error = error.message;
        this.notify(session);
      });
    });
  }
  configuration() {
    return this.v.workspace.getConfiguration(
      'jbsearch',
      this.v.workspace.workspaceFolders?.[0]?.uri || null
    );
  }
  renderPanel(session, panel) {
    panel.webview.html = getHtml(
      panel.webview, this.context.extensionUri, this.v);
  }
  refreshPreviews() {
    for (const session of this.sessions.values()) {
      if (session.layout === 'findWindow') this.updateNativePreview(session);
      else if ([...session.panels].some(panel => panel.visible))
        void this.select(session, session.selectedId);
    }
  }
  documentChanged(event) {
    if (!event.contentChanges.length) return;
    const uri = event.document.uri;
    const open = this.v.window.tabGroups.all.some(group => group.tabs.some(tab =>
      tab.input instanceof this.v.TabInputText && tab.input.uri.toString() === uri.toString()));
    const inWorkspace = uri.scheme === 'file' && Boolean(this.v.workspace.getWorkspaceFolder(uri));
    for (const session of this.sessions.values()) {
      if (session.layout === 'findWindow') {
        const relevant = session.scope.kind === 'openEditors' ? open : inWorkspace;
        if (session.searching && relevant && !session.replacing) {
          this.schedule(session, 150);
          continue;
        }
        if (session.results.some(result => result.uri === uri.toString())) {
          session.results = trackDocumentChanges(session.results, event);
          this.queueValidation(session, uri.toString());
          this.updateNativePreview(session);
        }
        continue;
      }
      const relevant = session.scope.kind === 'openEditors' ? open : inWorkspace;
      if (relevant && !session.replacing && session.query && session.panels.size)
        this.schedule(session, 150);
    }
  }
  async setupClientPreview() {
    try {
      const resources = await this.preview.setupClient();
      void this.v.window.showInformationMessage(resources
        ? `JB Search client preview is ready (${resources.themeId}).`
        : 'JB Search already has local access to themes and grammars in this window.');
    } catch (error) {
      void this.v.window.showErrorMessage(`JB Search: ${error.message}`);
    }
  }
  snapshot(session) {
    return {
      id: session.id,
      mode: session.mode,
      layout: session.layout || 'modal',
      query: session.query,
      replacement: session.replacement,
      options: session.options,
      scope: session.scope,
      generation: session.generation,
      results: session.results.map(
        ({
          id,
          uri,
          relativePath,
          label,
          range,
          lineText,
          previewMatchStart,
          previewMatchEnd,
          rootName, initialOrder, invalid, invalidReason, pending
        }) => ({
          id,
          uri,
          relativePath,
          label,
          range,
          lineText,
          previewMatchStart,
          previewMatchEnd,
          rootName, initialOrder, invalid, invalidReason, pending
        })
      ),
      selectedId: session.selectedId,
      searching: session.searching,
      partial: session.partial,
      error: session.error,
      notice: session.notice,
      replacing: Boolean(session.replacing),
      patchAcks: Object.fromEntries(session.patchAcks || []),
      customScopes: this.configuration()
        .get('scopes', [])
        .map((scope) => scope.name)
    };
  }
  notify(session) {
    const message = { type: 'state', state: this.snapshot(session) };
    if (session.layout === 'findWindow') {
      this.findTree.update(message.state);
      return;
    }
    for (const panel of session.panels) {
      void panel.webview.postMessage(message);
    }
  }
  schedule(session, delay = this.configuration().get('search.debounceMs', 150)) {
    this.cancelValidations(session);
    clearTimeout(session.timer);
    session.abort?.abort();
    session.generation++;
    session.searching = Boolean(session.query);
    session.error = '';
    session.notice = '';
    session.partial = false;
    session.results = [];
    session.selectedId = null;
    session.autoSelected = false;
    session.validationNotice = false;
    session.previewRevision++;
    this.updateNativePreview(session);
    this.notify(session);
    session.timer = setTimeout(() => {
      void this.search(session);
    }, delay);
  }
  cancelValidations(session, onlyUri) {
    if (!session.validations) return;
    for (const [uri, entry] of session.validations) {
      if (onlyUri && uri !== onlyUri) continue;
      clearTimeout(entry.timer);
      entry.abort?.abort();
      session.validations.delete(uri);
    }
  }
  updateNativePreview(session) {
    if (this.previewSessionId !== session.id || !this.findPreview) return;
    const selected = session.results.find(result => result.id === session.selectedId);
    if (selected) this.findPreview.update?.(selected, session.results);
    else this.findPreview.clear();
  }
  queueValidation(session, uri, delay = 150) {
    if (this.disposed || (session.layout !== 'findWindow' && !session.panels.size) ||
        this.sessions.get(session.id) !== session ||
        !session.results.some(result => result.uri === uri)) return;
    this.cancelValidations(session, uri);
    session.validations ||= new Map();
    const entry = { generation: session.generation, abort: new AbortController() };
    session.validations.set(uri, entry);
    session.results = session.results.map(result => result.uri === uri ? { ...result, pending: true } : result);
    this.notify(session);
    this.updateNativePreview(session);
    entry.timer = setTimeout(() => { void this.validateDocument(session, uri, entry); }, delay);
  }
  async validateDocument(session, uri, entry) {
    const live = () => !this.disposed && !entry.abort.signal.aborted &&
      session.generation === entry.generation && session.validations?.get(uri) === entry;
    try {
      const document = await this.v.workspace.openTextDocument(this.v.Uri.parse(uri));
      if (!live()) return;
      const version = document.version;
      const config = this.configuration();
      const output = await this.engine.search({
        query: session.query,
        ...session.options,
        masksEnabled: false, fileMask: '', include: '', exclude: '', respectExcludes: false,
        scope: { kind: 'openEditors' }, roots: [],
        documents: [{ uri, text: document.getText(), version,
          displayName: path.basename(document.fileName || document.uri.fsPath || uri),
          languageId: document.languageId }],
        maxResults: 50000,
        maxFileSizeMiB: config.get('search.maxFileSizeMiB', 2),
        timeoutMs: config.get('search.timeoutMs', 10000)
      }, { signal: entry.abort.signal });
      if (!live()) return;
      if (document.version !== version) {
        this.queueValidation(session, uri);
        return;
      }
      if (output.truncated || output.stats?.timedOut || output.stats?.skippedFiles || output.stats?.errors?.length)
        throw new Error('The file check is incomplete. Rerun Search before replacing.');
      session.results = reconcileDocumentResults(session.results, uri, output.results, document);
      session.validations.delete(uri);
      if (session.validationNotice && !session.results.some(result => result.pending)) {
        session.notice = '';
        session.validationNotice = false;
      }
      this.notify(session);
      this.updateNativePreview(session);
    } catch (error) {
      if (!live()) return;
      session.validations.delete(uri);
      if (['ENOENT', 'FileNotFound', 'EntryNotFound'].includes(error.code)) {
        session.results = markDocumentUnavailable(session.results, uri);
      } else {
        session.results = session.results.map(result => result.uri === uri
          ? { ...result, pending: true, invalidReason: `Validation failed: ${error.message}` } : result);
      }
      session.validationNotice = true;
      session.notice = `Could not validate ${path.basename(uri)}: ${error.message}`;
      this.notify(session);
      this.updateNativePreview(session);
    }
  }
  async request(session) {
    const v = this.v,
      roots = v.workspace.workspaceFolders || [];
    if (roots.some((root) => root.uri.scheme !== 'file'))
      throw new Error(
        'This version supports local desktop workspaces. Remote workspaces are not supported yet.'
      );
    if (session.scope.kind !== 'openEditors' && !roots.length)
      throw new Error('Open a project folder, or choose Open Editors.');
    const config = this.configuration(),
      scope = { ...session.scope };
    if (scope.kind === 'custom') {
      const custom = config.get('scopes', []).find((item) => item.name === scope.name);
      if (!custom) throw new Error('This custom scope no longer exists. Choose another scope.');
      Object.assign(scope, { include: custom.include, exclude: custom.exclude });
    }
    const openUris = new Set(
      v.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => tab.input instanceof v.TabInputText)
        .map((tab) => tab.input.uri.toString())
    );
    const documents = new Map();
    if (scope.kind === 'openEditors')
      for (const uri of openUris) {
        const parsed = v.Uri.parse(uri);
        if (!['file', 'untitled'].includes(parsed.scheme))
          throw new Error('Open Editors currently supports local files and untitled text buffers.');
        const document = await v.workspace.openTextDocument(parsed);
        documents.set(uri, document);
      }
    else
      for (const document of v.workspace.textDocuments)
        if (document.isDirty && !document.isClosed)
          documents.set(document.uri.toString(), document);
    return {
      query: session.query,
      ...session.options,
      masksEnabled: session.options.maskEnabled,
      fileMask: session.options.mask,
      scope,
      maxResults: config.get('search.maxResults', 5000),
      maxFileSizeMiB: config.get('search.maxFileSizeMiB', 2),
      timeoutMs: config.get('search.timeoutMs', 10000),
      roots: roots.map((root) => {
        const search = v.workspace.getConfiguration('search', root.uri),
          files = v.workspace.getConfiguration('files', root.uri);
        return {
          path: root.uri.fsPath,
          name: root.name,
          exclude: { ...files.get('exclude', {}), ...search.get('exclude', {}) },
          useIgnoreFiles: search.get('useIgnoreFiles', true),
          useGlobalIgnoreFiles: search.get('useGlobalIgnoreFiles', false),
          useParentIgnoreFiles: search.get('useParentIgnoreFiles', false)
        };
      }),
      documents: [...documents.values()].map((document) => ({
        uri: document.uri.toString(),
        fsPath: document.uri.scheme === 'file' ? document.uri.fsPath : undefined,
        text: document.getText(),
        version: document.version,
        isDirty: document.isDirty,
        displayName: path.basename(document.fileName),
        languageId: document.languageId
      }))
    };
  }
  async search(session) {
    const generation = session.generation;
    if (!session.query) {
      session.searching = false;
      this.notify(session);
      return;
    }
    const abort = new AbortController();
    session.abort = abort;
    const live = () => generation === session.generation && !abort.signal.aborted && !this.disposed;
    try {
      const request = await this.request(session);
      if (!live()) return;
      const output = await this.engine.search(request, {
        signal: abort.signal,
        onBatch: (matches) => {
          if (!live()) return;
          session.results.push(...matches);
          if (!session.selectedId && session.results.length) {
            session.selectedId = session.results[0].id;
            session.autoSelected = true;
            void this.selectAutomatic(session);
          }
          this.notify(session);
        }
      });
      if (!live()) return;
      session.results = session.layout === 'findWindow' ? sortResults(output.results) : output.results;
      if (session.layout === 'findWindow' && (session.autoSelected || !session.selectedId))
        session.selectedId = session.results[0]?.id || null;
      session.searching = false;
      session.partial = output.truncated;
      session.error = '';
      session.notice =
        output.reason === 'limit'
          ? 'Result limit reached. Narrow the search before Replace All.'
          : output.stats.timedOut
            ? 'Search timed out. Results are incomplete.'
            : output.stats.skippedFiles
              ? `${output.stats.skippedFiles} files skipped (binary, encoding, size, or access). Results are incomplete.`
              : '';
      if (output.stats.errors.length) session.notice += ' Some files could not be read.';
      session.notice = session.notice || session.feedback || '';
      session.feedback = '';
      this.notify(session);
      if (session.selectedId) void this.selectAutomatic(session);
    } catch (error) {
      if (live()) {
        session.searching = false;
        session.error = error.message;
        session.results = [];
        session.selectedId = null;
        this.notify(session);
      }
    }
  }
  selectAutomatic(session) {
    // Saved searches do not navigate the central editor until an explicit
    // occurrence selection. Background batches/reruns must never move a caret.
    if (session.layout === 'findWindow') return;
    return this.select(session, session.selectedId);
  }
  async select(session, id, { preserveFocus = true } = {}) {
    const result = session.results.find((match) => match.id === id);
    if (!result) return;
    session.selectedId = id;
    const revision = ++session.previewRevision,
      generation = session.generation;
    this.notify(session);
    try {
      if (session.layout === 'findWindow') {
        if (!this.sessions.has(session.id)) return;
        this.previewSessionId = session.id;
        if (!this.findPreview) {
          this.findPreview = new FindPreview(this.v);
          this.context.subscriptions.push(this.findPreview);
        }
        await this.findPreview.show(result, session.results, { preserveFocus });
        return;
      }
      const document = await this.v.workspace.openTextDocument(this.v.Uri.parse(result.uri));
      const preview = await this.preview.render(
        document,
        result,
        session.results.filter((match) => match.uri === result.uri)
      );
      if (revision !== session.previewRevision || generation !== session.generation) return;
      for (const panel of session.panels)
        void panel.webview.postMessage({ type: 'preview', preview: { ...preview, id: result.id } });
    } catch (error) {
      if (revision === session.previewRevision) {
        session.notice = `Preview unavailable: ${error.message}`;
        this.notify(session);
      }
    }
  }
  async message(session, message) {
    if (!message || typeof message.type !== 'string') return;
    switch (message.type) {
      case 'ready':
        this.notify(session);
        if (session.selectedId) await this.selectAutomatic(session);
        break;
      case 'update': {
        if (
          typeof message.clientId === 'string' &&
          message.clientId.length <= 200 &&
          Number.isSafeInteger(message.revision) &&
          message.revision > 0
        ) {
          session.patchAcks ||= new Map();
          const acknowledged = session.patchAcks.get(message.clientId) || 0;
          if (message.revision <= acknowledged) {
            this.notify(session);
            return;
          }
          session.patchAcks.set(message.clientId, message.revision);
        }
        if (session.replacing) {
          this.notify(session);
          return;
        }
        const patch = message.patch;
        if (!patch || typeof patch !== 'object') {
          this.notify(session);
          return;
        }
        for (const key of ['query', 'replacement'])
          if (typeof patch[key] === 'string') session[key] = patch[key].slice(0, 20000);
        for (const key of [
          'caseSensitive',
          'wholeWord',
          'regex',
          'preserveCase',
          'maskEnabled',
          'respectExcludes'
        ])
          if (typeof patch[key] === 'boolean') session.options[key] = patch[key];
        for (const key of ['mask', 'include', 'exclude'])
          if (typeof patch[key] === 'string') session.options[key] = patch[key].slice(0, 4000);
        if (patch.scope && ['workspace', 'openEditors', 'custom'].includes(patch.scope.kind))
          session.scope = { kind: patch.scope.kind, name: String(patch.scope.name || '') };
        if (Object.keys(patch).every((key) => ['replacement', 'preserveCase'].includes(key)))
          this.notify(session);
        else this.schedule(session);
        break;
      }
      case 'select':
        this.currentId = session.id;
        session.autoSelected = false;
        await this.select(session, message.id);
        break;
      case 'openResult': {
        const result = session.results.find((match) => match.id === message.id);
        if (!result) return;
        if (session.layout === 'findWindow') {
          this.currentId = session.id;
          session.autoSelected = false;
          await this.select(session, result.id, { preserveFocus: false });
          return;
        }
        const document = await this.v.workspace.openTextDocument(this.v.Uri.parse(result.uri));
        if (
          document.getText().slice(result.offset, result.offset + result.length) !==
          result.matchText
        ) {
          this.schedule(session, 0);
          throw new Error('This result changed. The search has been refreshed.');
        }
        const range = new this.v.Range(
          result.range.start.line,
          result.range.start.character,
          result.range.end.line,
          result.range.end.character
        );
        await this.v.window.showTextDocument(document, { selection: range, preview: false });
        break;
      }
      case 'openTab':
        await this.openFindWindow(session, false);
        break;
      case 'newTab':
        await this.openFindWindow(session, true);
        break;
      case 'editSearch':
        this.currentId = session.id;
        await this.show(session.mode);
        break;
      case 'refresh':
        this.schedule(session, 0);
        break;
      case 'focusPreview': {
        await this.message(session, { type: 'openResult', id: session.selectedId });
        break;
      }
      case 'closeSearch':
        this.closeFindSearch(session);
        break;
      case 'settings':
        await this.v.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:idfedorov09.jbsearch'
        );
        break;
      case 'pickFolder': {
        const roots = this.v.workspace.workspaceFolders || [];
        const selected = await this.v.window.showQuickPick(
          roots.map((root) => ({ label: root.name, description: root.uri.fsPath, root })),
          { placeHolder: 'Search in workspace folder' }
        );
        if (selected) {
          session.scope = {
            kind: 'folder',
            rootPath: selected.root.uri.fsPath,
            label: selected.root.name
          };
          this.schedule(session, 0);
        }
        break;
      }
      case 'pickDirectory': {
        const chosen = await this.v.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          defaultUri: this.v.workspace.workspaceFolders?.[0]?.uri,
          openLabel: 'Search in Directory'
        });
        if (chosen?.[0]) {
          const uri = chosen[0];
          if (!this.v.workspace.getWorkspaceFolder(uri))
            throw new Error('Choose a directory inside the current workspace.');
          session.scope = {
            kind: 'directory',
            directory: uri.fsPath,
            path: uri.fsPath,
            label: this.v.workspace.asRelativePath(uri)
          };
          this.schedule(session, 0);
        }
        break;
      }
      case 'replace':
      case 'replaceAll':
        await this.replace(session, message.type === 'replaceAll', message);
        break;
    }
  }
  async openFindWindow(source, newTab) {
    if (source.layout === 'findWindow') return;
    if (source.replacing) throw new Error('Wait for the current replacement before opening Find Panel.');
    if (source.transferring) return source.transferring;
    const transfer = this.transferFindWindow(source, newTab);
    source.transferring = transfer;
    try { return await transfer; }
    finally { source.transferring = undefined; }
  }
  async closeModalEditors(session) {
    const tabs = this.v.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => {
      const uri = tab.input?.uri;
      return uri?.scheme === 'jbsearch' &&
        (uri.path === `/${session.id}.jbsearch` || uri.path.startsWith(`/${session.id}~`));
    });
    // Unlike WebviewPanel.dispose(), closing tabs acknowledges the workbench's
    // focus restoration before we focus the results view.
    if (tabs.length && !await this.v.window.tabGroups.close(tabs, true))
      throw new Error('Could not close the search dialog. Try Open in Find Panel again.');
  }
  async transferFindWindow(source, newTab) {
    const previousCurrentId = this.currentId;
    const previousFindId = this.findTree.activeId;
    const target = !newTab && this.sessions.get(source.targetWindowId);
    const window = target || (newTab ? this.create(source.mode, source) : source);
    const previous = Object.fromEntries([
      'mode', 'query', 'replacement', 'options', 'scope', 'results', 'selectedId',
      'layout', 'uri', 'searching', 'partial', 'error', 'notice'
    ].map(key => [key, window[key]]));
    const wasSearching = source.searching;
    if (window !== source) {
      this.cancelValidations(window);
      clearTimeout(window.timer);
      window.abort?.abort();
      window.generation++;
      Object.assign(window, {
        mode: source.mode, query: source.query, replacement: source.replacement,
        options: { ...source.options }, scope: { ...source.scope },
        results: source.results.map(result => ({ ...result })), selectedId: source.selectedId,
        searching: false, partial: source.partial, error: source.error, notice: source.notice
      });
    }
    window.layout = 'findWindow';
    window.results = sortResults(window.results.map(result => {
      const copy = { ...result };
      delete copy.initialOrder;
      return copy;
    }));
    if (!window.results.some(result => result.id === window.selectedId))
      window.selectedId = window.results[0]?.id || null;
    try {
      this.findTree.update(this.snapshot(window), { activate: true });
      await this.findTree.show(window.id);
      await this.closeModalEditors(source);
    } catch (error) {
      Object.assign(window, previous);
      if (target) this.findTree.update(this.snapshot(window));
      else this.findTree.remove(window.id);
      if (window !== source && !target) this.sessions.delete(window.id);
      this.currentId = previousCurrentId;
      if (this.sessions.get(previousFindId)?.layout === 'findWindow')
        await this.findTree.selectSession(previousFindId, { notify: false });
      if (target && previous.searching) this.schedule(target, 0);
      else if (target)
        for (const uri of new Set(target.results.filter(result => result.pending).map(result => result.uri)))
          this.queueValidation(target, uri, 0);
      // Focusing a native view can dispose the modal before reveal completes.
      // Rollback must restore an actual dialog, including an isolated draft.
      if (!source.panels.size) {
        this.sessions.set(source.id, source);
        const owner = this.sessions.get(source.targetWindowId);
        if (owner) owner.draftId = source.id;
        this.currentId = source.id;
        await this.show(source.mode);
        if (wasSearching) this.schedule(source, 0);
      }
      throw error;
    }
    this.currentId = window.id;
    for (const panel of [...source.panels]) panel.dispose();
    // Modal disposal restores its former focus. Finish with the results tree
    // focused so arrows/F4 work immediately after confirming the dialog.
    await this.v.commands.executeCommand('jbsearch.results.focus');
    delete window.targetWindowId;
    this.notify(window);
    if (wasSearching) this.schedule(window, 0);
    return window;
  }
  closeFindSearch(session) {
    if (session.layout !== 'findWindow' || !this.sessions.has(session.id)) return;
    if (session.replacing) throw new Error('Wait for the replacement before closing this search.');
    clearTimeout(session.timer);
    session.abort?.abort();
    this.cancelValidations(session);
    const draft = this.sessions.get(session.draftId);
    if (draft) {
      for (const panel of [...draft.panels]) panel.dispose();
      this.sessions.delete(draft.id);
    }
    this.sessions.delete(session.id);
    this.findTree.remove(session.id);
    if (this.previewSessionId === session.id) {
      this.findPreview?.clear();
      this.previewSessionId = undefined;
    }
    if (this.currentId === session.id || this.currentId === draft?.id)
      this.currentId = this.findTree.activeId || null;
  }
  async replace(session, all, message) {
    if (
      session.mode !== 'replace' ||
      session.replacing ||
      session.searching ||
      message.generation !== session.generation
    )
      throw new Error('Wait for the current search before replacing.');
    if (all && session.partial)
      throw new Error(
        'Replace All requires complete results. Narrow the search or increase its limits.'
      );
    const matches = all
      ? session.results
      : session.results.filter((match) => match.id === message.id);
    if (!matches.length) return;
    if (matches.some(match => match.invalid || match.pending))
      throw new Error('These results are INVALID or still being checked. Rerun Search before replacing.');
    session.replacing = true;
    session.error = '';
    this.notify(session);
    const generation = session.generation;
    let success = false;
    try {
      const documents = new Map(),
        opened = new Map();
      for (const uri of new Set(matches.map((match) => match.uri))) {
        const document = await this.v.workspace.openTextDocument(this.v.Uri.parse(uri));
        const text = document.getText(),
          sample = matches.find((match) => match.uri === uri);
        if (sample.contentHash && hash(text) !== sample.contentHash)
          throw new Error('A file changed since the search. Refresh the results before replacing.');
        if (sample.source === 'disk') {
          if (document.isDirty)
            throw new Error('A file has unsaved changes since the search. Refresh first.');
          const stat = await fs.stat(document.uri.fsPath);
          if (stat.mtimeMs !== sample.mtimeMs || stat.size !== sample.fileSize)
            throw new Error('A file changed on disk. Refresh the results before replacing.');
        }
        documents.set(uri, {
          text,
          version: document.version,
          eol: document.eol === this.v.EndOfLine.CRLF ? '\r\n' : '\n'
        });
        opened.set(uri, document);
      }
      const plans = planReplacements(matches, documents, {
        replacement: session.replacement,
        regex: session.options.regex,
        preserveCase: session.options.preserveCase
      });
      if (session.generation !== generation)
        throw new Error('Search changed before replacement. Try again.');
      const edit = new this.v.WorkspaceEdit();
      for (const plan of plans) {
        const r = plan.range;
        edit.replace(
          this.v.Uri.parse(plan.uri),
          new this.v.Range(r.start.line, r.start.character, r.end.line, r.end.character),
          plan.replacement
        );
      }
      for (const [uri, document] of opened)
        if (document.version !== documents.get(uri).version)
          throw new Error('A file changed before replacement. Refresh first.');
      if (!(await this.v.workspace.applyEdit(edit)))
        throw new Error('VS Code could not apply the replacement. No success was assumed.');
      success = true;
    } finally {
      session.replacing = false;
      this.notify(session);
    }
    if (success) {
      if (session.layout === 'findWindow') {
        for (const uri of new Set(matches.map(match => match.uri))) this.queueValidation(session, uri, 0);
      } else this.schedule(session, 0);
      session.feedback = `Replaced ${matches.length} matches. Changes are unsaved; use Undo in VS Code to revert.`;
      session.notice = session.feedback;
      this.notify(session);
    }
  }
  dispose() {
    this.disposed = true;
    for (const session of this.sessions.values()) {
      clearTimeout(session.timer);
      session.abort?.abort();
      this.cancelValidations(session);
    }
    this.engine.dispose();
    this.preview.dispose();
    this.findTree.dispose();
    this.findPreview?.dispose?.();
  }
}
module.exports = { SearchController, VIEW_TYPE };
