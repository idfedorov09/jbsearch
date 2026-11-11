'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { SearchEngine } = require('./search');
const { incompleteSearch, skipDiagnostics, completePreflight } = require('./search/diagnostics');
const { PreviewProvider } = require('./preview');
const { openModal } = require('./modal');
const { planReplacements, replacementMeaning } = require('./replace');
const { requestFingerprint, documentFingerprint, knownProvenance, knownDiskBaseline, sameOccurrences, samePlans } = require('./replace-preflight');
const { PreparationDeadline } = require('./replace-deadline');
const { approvalFor, assertApproval, copy } = require('./replace-approval');
const { PhysicalOpenGate, PHYSICAL_OPEN_DEFAULTS } = require('./validation-open-boundary');
const { readDocumentSnapshot, snapshotByteLimit } = require('./document-snapshot');
const { assertReplaceableMatch } = require('./replace-safety');
const { diskBaselineFor, commonDiskBaseline, assertDiskBaseline, readStableDiskBaseline } = require('./disk-baseline');
const { bindDocumentAuthority, hasCurrentDocumentAuthority, observeDocumentSave,
  discardDocumentBaseline, prepareDiskBaseline, observeDocumentDelta, commitDiskObservation,
  captureDocumentAuthority, admitDocumentAuthority } = require('./source-authority');
const { getHtml } = require('./ui/html');
const { FindTree } = require('./find-tree');
const { FindPreview } = require('./find-preview');
const { sortResults, trackDocumentChanges, reconcileDocumentResults,
  markDocumentUnavailable, markDocumentIdentityUnknown } = require('./find-results');
const { isPathWithin, acceptsFile, matchesPatterns } = require('./search/matcher');
const VIEW_TYPE = 'jbsearch.session';
const { contentHash: hash } = require('./content-hash');
function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
const MAX_INVALIDATIONS = 512;
const MAX_VALIDATIONS = 4;
// Includes debounce timers, the controller FIFO and running validation callers
// across every saved session. Physical host requests have their own shared cap.
const MAX_VALIDATION_BACKLOG = 512;
const VALIDATION_MAX_WAIT_MS = 1000;
function ignoreRulesDirectory(filePath) {
  if (!filePath) return undefined;
  const name = path.basename(filePath);
  if (['.gitignore', '.ignore', '.rgignore'].includes(name)) return path.dirname(filePath);
  if (name === 'exclude' && path.basename(path.dirname(filePath)) === 'info' &&
      path.basename(path.dirname(path.dirname(filePath))) === '.git')
    return path.dirname(path.dirname(path.dirname(filePath)));
  return undefined;
}
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
    this.validationQueue = [];
    this.validationEntries = new Set();
    this.activeValidations = 0;
    this.documentOpenGate = new PhysicalOpenGate(uri => vscode.workspace.openTextDocument(uri));
    this.validationOpenGate = this.documentOpenGate;
    this.diskChecks = new PhysicalOpenGate(job => job());
    this.findPreview = undefined;
    this.findTree = new FindTree(vscode, {
      onSelect: (sessionId, id, binding) => this.findMessage(sessionId, { type: 'select', id, ...binding }),
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
    if (vscode.workspace.onDidSaveTextDocument)
      context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document =>
        this.documentLifecycleChanged(document, 'save')));
    if (vscode.workspace.onDidCloseTextDocument)
      context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document =>
        this.documentLifecycleChanged(document, 'close')));
    context.subscriptions.push(
      vscode.window.tabGroups.onDidChangeTabs((event) => {
        const membershipChanged = [...event.opened, ...event.closed]
          .some(tab => tab.input instanceof vscode.TabInputText);
        const changedTextTab = event.changed.some(tab => tab.input instanceof vscode.TabInputText);
        if (!membershipChanged && !changedTextTab) return;
        this.sourceEventEpoch = (this.sourceEventEpoch || 0) + 1;
        for (const session of this.sessions.values()) {
          if (session.scope.kind !== 'openEditors' || !this.activeSession(session)) continue;
          const uris = this.currentOpenEditorUris();
          const current = new Set(uris.map(uri => uri.toString()));
          const previous = session.observedOpenEditorUris;
          const differs = !previous || current.size !== previous.size ||
            [...current].some(uri => !previous.has(uri));
          session.observedOpenEditorUris = current;
          if (!differs) continue;
          const changedUris = previous && [...new Set([...previous, ...current])]
            .filter(uri => previous.has(uri) !== current.has(uri));
          const relevant = !changedUris || changedUris.some(value => {
            if (session.results.some(result => result.uri === value)) return true;
            try {
              const uri = uris.find(candidate => candidate.toString() === value) || this.v.Uri.parse(value);
              return this.editorMayBeIncluded(session, uri);
            } catch { return true; }
          });
          if (relevant) this.scopeChanged(session);
        }
      })
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (['jbsearch.search', 'jbsearch.scopes', 'search', 'files.exclude']
          .some(key => event.affectsConfiguration(key)))
          this.sourceEventEpoch = (this.sourceEventEpoch || 0) + 1;
        if (
          event.affectsConfiguration('editor.tokenColorCustomizations') ||
          event.affectsConfiguration('workbench.colorTheme')
        ) {
          this.preview.invalidate();
          this.refreshPreviews();
        }
        if (
          event.affectsConfiguration('jbsearch.search.maxResults') ||
          event.affectsConfiguration('jbsearch.search.maxFileSizeMiB') ||
          event.affectsConfiguration('jbsearch.search.timeoutMs') ||
          event.affectsConfiguration('search') ||
          event.affectsConfiguration('files.exclude')
        )
          for (const session of this.sessions.values()) {
            if (this.activeSession(session)) this.scopeChanged(session);
          }
        else if (event.affectsConfiguration('jbsearch.scopes'))
          for (const session of this.sessions.values()) {
            if (!this.activeSession(session)) continue;
            if (session.scope.kind === 'custom') this.scopeChanged(session);
            else if (session.layout !== 'findWindow') this.notify(session);
          }
      })
    );
    if (vscode.workspace.onDidChangeWorkspaceFolders)
      context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.sourceEventEpoch = (this.sourceEventEpoch || 0) + 1;
        for (const session of this.sessions.values()) {
          if (this.activeSession(session)) this.scopeChanged(session);
        }
      }));
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    for (const event of ['onDidChange', 'onDidCreate', 'onDidDelete'])
      context.subscriptions.push(
        watcher[event]((uri) => {
          this.fileChanged(uri, event === 'onDidDelete' ? 'delete' :
            event === 'onDidCreate' ? 'create' : 'change');
        })
      );
    if (vscode.workspace.onDidRenameFiles)
      context.subscriptions.push(vscode.workspace.onDidRenameFiles(event => {
        for (const file of event.files) {
          this.fileChanged(file.oldUri, 'delete');
          this.fileChanged(file.newUri, 'create');
        }
      }));
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
      lifetimeRevision: 0,
      selectedId: null,
      panels: new Set(),
      searching: false,
      partial: false,
      scopeEventRevision: 0,
      scopeStale: false,
      error: '',
      notice: '',
      diagnostics: '',
      needsRerun: false,
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
        catch (error) { void this.v.window.showErrorMessage(`JB Search: ${error.obsoleteDispatchedReplacement
          ? 'An earlier submitted replacement failed: ' : ''}${error.message}`); }
      })
    );
    for (const [name, type] of Object.entries(actions))
      register(name, (...args) => {
        // Toolbar actions belong to the active search. Workbench may briefly
        // retain another search's selection while refreshing the native tree.
        if (!['replace', 'replaceAll', 'openResult'].includes(name)) return this.findTree.action(type);
        if (name === 'openResult') {
          const selected = args.length ? args[0] : this.findTree.view.selection?.[0];
          if (!selected || selected.sessionId !== this.findTree.activeId) return false;
          return this.findTree.action(type, selected, { provided: true });
        }
        // An expired native handle can arrive as an explicit undefined. Never
        // reinterpret it as a toolbar action on a newer provider snapshot.
        if (args.length && (!args[0] || args[0].sessionId !== this.findTree.activeId)) return false;
        return this.findTree.action(type, args[0], { provided: args.length > 0 });
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
    const generation = session.generation, lifetime = session.lifetimeRevision;
    let operation;
    try {
      const delivery = this.message(session, message);
      operation = session.replacementOperation;
      return await delivery;
    }
    catch (error) {
      if (this.sessions.get(sessionId) === session && !this.disposed && session.generation === generation &&
          session.lifetimeRevision === lifetime && session.replacementOperation === operation) {
        session.notice = error.message;
        this.notify(session);
      }
      throw error;
    }
  }
  async showInDirectory(uri) {
    if (this.disposed) return;
    const invocation = this.directoryInvocation = (this.directoryInvocation || 0) + 1;
    try {
      if (uri?.scheme !== 'file' || typeof uri.fsPath !== 'string' || !uri.fsPath)
        throw new Error('Choose a filesystem folder in Explorer to use Find in Files.');
      if (!this.v.workspace.getWorkspaceFolder(uri))
        throw new Error('The search directory must be inside an open workspace folder.');
      const stat = await this.v.workspace.fs.stat(uri);
      if (this.disposed || invocation !== this.directoryInvocation) return;
      if (!(stat.type & this.v.FileType.Directory))
        throw new Error('The selected search resource is not a directory.');
      await this.show('find', {
        kind: 'directory',
        directory: uri.fsPath,
        path: uri.fsPath,
        label: this.v.workspace.asRelativePath(uri, true)
      });
    } catch (error) {
      if (!this.disposed && invocation === this.directoryInvocation)
        void this.v.window.showErrorMessage(`JB Search: ${error.message}`);
    }
  }
  async show(mode = 'find', initialScope, { search = true, restoreCurrent } = {}) {
    if (this.disposed || (restoreCurrent && !restoreCurrent())) return false;
    let session = this.sessions.get(this.currentId) || this.create(mode);
    if (session.reviewOnly) {
      // Global Find/Replace is an ordinary editable search, never a way to
      // repurpose the frozen model/token currently displayed by a review.
      session = this.create(mode, session);
    }
    if (session.transferOperation) {
      this.cancelTransfer(session);
      // A provisional native destination is not yet an ordinary saved owner.
      // A new global invocation gets an independent editable search instead.
      session = this.create(mode, session);
    }
    if (initialScope && (session.replacing || this.sessions.get(session.targetWindowId)?.replacing))
      throw new Error('Wait for the current replacement to finish before changing the search directory.');
    if (initialScope && (session.layout === 'findWindow' || session.targetWindowId)) {
      // Explorer starts a separate search; it must never edit the saved snapshot
      // or its gear draft when that draft happens to be the current modal.
      session = this.create(mode, session);
    } else if (session.layout === 'findWindow') {
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
    if (initialScope) {
      session.scope = { ...initialScope };
      this.resetSearch(session);
    }
    const generation = session.generation, lifetime = session.lifetimeRevision;
    const live = () => !this.disposed && this.sessions.get(session.id) === session &&
      session.lifetimeRevision === lifetime && (!restoreCurrent || restoreCurrent());
    let restoreToken;
    try {
      if (session.opening) {
        if (!(await session.opening) || !live()) return false;
        this.notify(session);
        for (const panel of session.panels) void panel.webview.postMessage({ type: 'focus' });
        if (search && session.query && session.generation === generation) this.schedule(session, 0);
        return Boolean(session.panels.size);
      }
      const previousPanels = [...session.panels];
      // A fresh resource avoids a workbench race when reusing a retained view
      // across editor groups, especially over Remote SSH. Its stable prefix
      // resolves to the same in-memory session.
      const uri = previousPanels.length
        ? this.v.Uri.parse(`jbsearch:/${session.id}~${crypto.randomUUID()}.jbsearch`)
        : session.uri;
      let openingUri = uri;
      if (restoreCurrent) {
        // A rollback resource cannot recreate a closed owner if the host opens
        // it late. Keep the ordinary resource for later explicit invocations.
        restoreToken = crypto.randomUUID();
        this.modalRestores ||= new Map();
        this.modalRestores.set(restoreToken, { session, current: live });
        openingUri = this.v.Uri.parse(`${uri.toString()}${uri.query ? '&' : '?'}restore=${restoreToken}`);
      }
      const opening = openModal(this.v, openingUri, VIEW_TYPE);
      session.opening = opening;
      let opened;
      try {
        opened = await opening;
      } finally {
        if (session.opening === opening) session.opening = undefined;
      }
      if (!opened || !live()) return false;
      session.uri = uri;
      for (const panel of previousPanels) panel.dispose();
      this.notify(session);
      for (const panel of session.panels) void panel.webview.postMessage({ type: 'focus' });
      if (search && session.query && session.generation === generation) this.schedule(session, 0);
      return Boolean(session.panels.size);
    } catch (error) {
      if (live()) void this.v.window.showErrorMessage(`JB Search: ${error.message}`);
      return false;
    } finally { if (restoreToken) this.modalRestores.delete(restoreToken); }
  }
  openCustomDocument(uri) {
    if (this.disposed) throw new Error('The search controller was closed before its dialog opened.');
    const id = uri.path
      .split('/')
      .filter(Boolean)[0]
      .replace(/\.jbsearch$/, '')
      .split('~')[0];
    let session = this.sessions.get(id);
    const restoreToken = new URLSearchParams(uri.query).get('restore');
    const restore = restoreToken && this.modalRestores?.get(restoreToken);
    if (restoreToken && (!restore || restore.session !== session || !restore.current()))
      throw new Error('This search dialog was closed or changed before rollback could reopen it.');
    if (!session) {
      if (new URLSearchParams(uri.query).get('review') === '1')
        throw new Error('This frozen replacement review was closed before it opened.');
      session = this.create();
      this.sessions.delete(session.id);
      session.id = id;
      session.uri = uri;
      if (new URLSearchParams(uri.query).get('view') === 'findWindow')
        session.layout = 'findWindow';
      this.sessions.set(id, session);
    }
    this.currentId = id;
    return { uri, session, lifetime: session.lifetimeRevision, current: restore?.current, dispose() {} };
  }
  resolveCustomEditor(document, panel) {
    const session = document.session;
    if (this.disposed || this.sessions.get(session.id) !== session ||
        (document.lifetime !== undefined && document.lifetime !== session.lifetimeRevision) ||
        (document.current && !document.current())) { panel.dispose(); return; }
    // Migrate retained editor resources from the former HTML Find Window.
    // Query/results still live only in memory; no source tab is opened here.
    if (session.layout === 'findWindow') {
      const generation = session.generation, lifetime = session.lifetimeRevision;
      const current = () => !this.disposed && this.sessions.get(session.id) === session &&
        session.generation === generation && session.lifetimeRevision === lifetime;
      this.notify(session);
      return this.findTree.show(session.id, { current }).then(async () => {
        if (!current()) return;
        await this.closeModalEditors(session, { current });
        if (!current()) return;
        panel.dispose();
        if (!current()) return;
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
      const transfer = session.transferOperation;
      // Only the explicit, already admitted close belongs to this transfer.
      // An unrelated last-panel close is a lifetime break, not permission to
      // resurrect a modal just because native focus might also close one.
      if (!session.panels.size && transfer?.source === session && transfer.closingSource) return;
      if (!session.panels.size) {
        session.lifetimeRevision = (session.lifetimeRevision || 0) + 1;
        this.cancelTransfer(session, { closed: true });
      }
      if (session.reviewOnly && !session.panels.size) {
        const source = this.sessions.get(session.reviewSourceId);
        if (session.reviewDispatching)
          source?.replacementAbort?.abort(new Error('The frozen review was closed before replacement.'));
        if (source?.reviewId === session.id) delete source.reviewId;
        this.sessions.delete(session.id);
        if (this.currentId === session.id) this.currentId = source?.id || this.findTree.activeId || null;
        return;
      }
      // The modal may be disposed by focusing the native results view during
      // transfer. Its snapshot now belongs to that view, not to this webview.
      if (session.layout === 'findWindow' && transfer?.source !== session) return;
      if (!session.panels.size) {
        this.closeReplacementReview(session);
        clearTimeout(session.timer);
        session.abort?.abort();
        session.previewAbort?.abort();
        if (!session.openingResultOwnsClose) session.openResultAbort?.abort();
        session.replacementAbort?.abort(new Error('Search was closed before replacement.'));
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
      if (event.webviewPanel.active && !this.disposed && this.sessions.get(session.id) === session && session.panels.has(panel)) {
        this.currentId = session.id;
      }
    });
    panel.webview.onDidReceiveMessage((message) => {
      if (this.disposed || this.sessions.get(session.id) !== session || !session.panels.has(panel)) return;
      const generation = session.generation, lifetime = session.lifetimeRevision;
      const delivery = this.message(session, message), operation = session.replacementOperation;
      void delivery.catch((error) => {
        if (!this.disposed && this.sessions.get(session.id) === session && session.panels.has(panel) &&
            session.generation === generation && session.lifetimeRevision === lifetime &&
            session.replacementOperation === operation) {
          if (error.code === 'TRANSFER_CANCELLED') session.notice = error.message;
          else session.error = error.message;
          this.notify(session);
        } else if (error.obsoleteDispatchedReplacement && !this.disposed) {
          void this.v.window.showErrorMessage(`JB Search: An earlier submitted replacement failed: ${error.message} No success or zero-modification outcome was assumed.`);
        }
      });
    });
  }
  configuration() {
    return this.v.workspace.getConfiguration(
      'jbsearch',
      this.v.workspace.workspaceFolders?.[0]?.uri || null
    );
  }
  openDocument(uri, options) {
    // Laziness also supports narrowly mocked controllers in unit tests. Every
    // controller still owns exactly one gate; caller cancellation never frees
    // an unresolved underlying host open.
    this.documentOpenGate ||= new PhysicalOpenGate(value => this.v.workspace.openTextDocument(value));
    return this.documentOpenGate.open(uri, { timeoutMs: this.documentOpenTimeout(), ...options });
  }
  snapshotLimit() {
    return snapshotByteLimit(Number(this.configuration().get('search.maxFileSizeMiB', 2)) * 1024 * 1024);
  }
  runDiskCheck(job, options) {
    // The slot covers the whole promise, including descriptor.close(). A timed
    // out caller does not release a still-running physical filesystem check.
    this.diskChecks ||= new PhysicalOpenGate(operation => operation());
    return this.diskChecks.open(job, options).catch(error => {
      const wrapped = new Error(`Disk baseline check failed (${error.code || 'IO'}): ${error.message}`);
      wrapped.code = error.code;
      throw wrapped;
    });
  }
  async prepareReplacementSource(session, document, selected, fresh, { signal, check, remaining, maxBytes }) {
    const gated = job => this.runDiskCheck(() => { check(); return job(); },
      { signal, timeoutMs: remaining() });
    // Missing/malformed historical provenance is not a changed, verified
    // baseline and must never become eligible merely because Save was observed.
    const baselineKnown = rows => rows.every(row => knownDiskBaseline(diskBaselineFor(row),
      document.uri.toString(), value => this.v.Uri.parse(value).toString()));
    if (document.uri.scheme === 'file' && !baselineKnown(selected))
      throw new Error('The source disk baseline is incomplete or unverified. Rerun Search before replacing.');
    const baseline = await prepareDiskBaseline(session, document, selected, {
      signal, check, maxBytes,
      readDisk: (uri, options) => gated(async () => Object.freeze({
        ...await readStableDiskBaseline(uri, options), uri: uri.toString()
      })),
      assertDisk: (uri, value, options) => gated(() => assertDiskBaseline(uri, value, options))
    });
    check();
    if (fresh?.length) {
      const freshBaseline = commonDiskBaseline(fresh);
      if (document.uri.scheme === 'file' && !baselineKnown(fresh))
        throw new Error('The fresh search has no independent disk baseline. Rerun Search.');
      if (freshBaseline) {
        await gated(() => assertDiskBaseline(document.uri, freshBaseline, { signal }));
        check();
        // Only compare after the old baseline was verified or lazily rebased
        // under a guarded observed Save. Do not reject a legitimate Save just
        // because fresh discovery captured the newer disk state.
        commonDiskBaseline([{ diskBaseline: baseline }, { diskBaseline: freshBaseline }]);
      }
    }
    return baseline;
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
    this.sourceEventEpoch = (this.sourceEventEpoch || 0) + 1;
    const uri = event.document.uri;
    for (const session of this.sessions.values()) {
      if (!this.activeSession(session) || !this.potentiallyInScope(session, uri, { document: true })) continue;
      const hadOverflow = session.searchInvalidationOverflow;
      const wasScopeInvalidated = session.searchScopeInvalidated;
      const staleChanged = this.recordScopeEvent(session, uri, 'change');
      const overflowChanged = !hadOverflow && session.searchInvalidationOverflow;
      const membershipChanged = !wasScopeInvalidated && session.searchScopeInvalidated;
      if ((overflowChanged || membershipChanged) && session.results.length)
        session.results = this.invalidateInitialResults(session, session.results);
      if (session.searching) {
        const affected = session.results.some(result => result.uri === uri.toString());
        if (affected) session.results = this.markIdentityUnknown(session.results, uri, 'change');
        if (affected || staleChanged || overflowChanged || membershipChanged) this.notify(session);
      } else if (!event.contentChanges.length) {
        // Encoding and dirty-state notifications have no edit delta. They still
        // invalidate an in-flight scope check, but must not be treated as text edits.
        if (staleChanged) this.notify(session);
      } else if (session.results.some(result => result.uri === uri.toString())) {
        const affected = session.results.filter(result => result.uri === uri.toString());
        const continuous = affected.every(result => {
          const prior = result.trackedDocumentVersion ?? result.documentVersion;
          return Number.isSafeInteger(prior) && event.document.version === prior + 1;
        });
        observeDocumentDelta(session, event.document, continuous);
        session.results = continuous ? trackDocumentChanges(session.results, event, { maxBytes: this.snapshotLimit() }) :
          this.markIdentityUnknown(session.results, uri, 'change');
        if (session.results.some(row => row.uri === uri.toString() && !row.identityUnknown && !row.unavailable))
          bindDocumentAuthority(session, event.document);
        this.queueValidation(session, uri.toString());
        this.updateNativePreview(session);
      } else if (staleChanged) this.notify(session);
    }
  }
  affectedByUri(result, uri) {
    const eventUri = uri.toString();
    if (result.uri === eventUri) return true;
    if (uri.scheme !== 'file' || !uri.fsPath) return false;
    if (result.fsPath) return isPathWithin(result.fsPath, uri.fsPath);
    try {
      const target = this.v.Uri.parse(result.uri);
      return target.scheme === 'file' && isPathWithin(target.fsPath, uri.fsPath);
    } catch {
      return false;
    }
  }
  currentOpenEditorUris() {
    const uris = new Map();
    for (const group of this.v.window.tabGroups.all || [])
      for (const tab of group.tabs || [])
        if (tab.input instanceof this.v.TabInputText)
          uris.set(tab.input.uri.toString(), tab.input.uri);
    return [...uris.values()];
  }
  openEditorUris(session) {
    const uris = new Map((session.openEditorUris || []).map(uri => [uri.toString(), uri]));
    for (const uri of this.currentOpenEditorUris()) uris.set(uri.toString(), uri);
    return [...uris.values()];
  }
  editorMayHaveConditionalExcludes(session, candidate) {
    if (session.options?.respectExcludes === false) return false;
    if (session.scopePolicyChanged) return true;
    const roots = session.searchRoots || this.v.workspace.workspaceFolders || [];
    const root = roots.filter(item => isPathWithin(candidate.fsPath, item.path || item.uri?.fsPath))
      .sort((a, b) => (b.path || b.uri?.fsPath || '').length - (a.path || a.uri?.fsPath || '').length)[0];
    if (!root) return false;
    let exclude = root.exclude;
    try {
      if (!Object.hasOwn(root, 'exclude') && root.uri && this.v.workspace.getConfiguration) {
        const search = this.v.workspace.getConfiguration('search', root.uri);
        const files = this.v.workspace.getConfiguration('files', root.uri);
        exclude = { ...files.get('exclude', {}), ...search.get('exclude', {}) };
      }
    } catch { return true; }
    if (!exclude) return true;
    return Object.values(exclude).some(value =>
      value && typeof value === 'object' && typeof value.when === 'string');
  }
  editorMayBeIncluded(session, uri) {
    if (session.scopePolicyChanged || uri.scheme !== 'file' || !uri.fsPath) return true;
    const roots = session.searchRoots || this.v.workspace.workspaceFolders || [];
    const root = roots.filter(item => isPathWithin(uri.fsPath, item.path || item.uri?.fsPath))
      .sort((a, b) => (b.path || b.uri?.fsPath || '').length - (a.path || a.uri?.fsPath || '').length)[0];
    try {
      let policy = root || {};
      if (root && !Object.hasOwn(root, 'exclude') && root.uri && this.v.workspace.getConfiguration) {
        const search = this.v.workspace.getConfiguration('search', root.uri);
        const files = this.v.workspace.getConfiguration('files', root.uri);
        policy = { ...root, exclude: { ...files.get('exclude', {}), ...search.get('exclude', {}) } };
      }
      const rootPath = root?.path || root?.uri?.fsPath;
      const relative = rootPath ? path.relative(rootPath, uri.fsPath).replace(/\\/g, '/') : path.basename(uri.fsPath);
      const options = session.options || {};
      return acceptsFile(relative, { ...options, masksEnabled: options.maskEnabled,
        fileMask: options.mask, scope: session.effectiveScope || session.scope }, policy);
    } catch { return true; }
  }
  potentiallyInScope(session, uri, { document = false, kind } = {}) {
    if (session.results.some(result => this.affectedByUri(result, uri))) return true;
    const eventPath = uri.scheme === 'file' ? uri.fsPath : undefined;
    // A later preflight resolves the current roots and named scope, not only
    // the ones used by the displayed snapshot. Once policy has changed, include
    // both old and current boundaries when advancing the event revision.
    if (session.scopePolicyChanged && eventPath && session.scope.kind !== 'openEditors') {
      let current = session.scope;
      if (current.kind === 'custom') {
        try { current = this.resolveNamedScope(current.name).scope; }
        catch { current = { kind: 'workspace' }; }
      }
      let currentBoundaries = (this.v.workspace.workspaceFolders || [])
        .map(root => root.uri?.fsPath).filter(Boolean);
      if (current.kind === 'folder' && current.rootPath) currentBoundaries = [current.rootPath];
      if (current.kind === 'directory' && (current.directory || current.path))
        currentBoundaries = [current.directory || current.path];
      const ignoreDirectory = ignoreRulesDirectory(eventPath);
      if (currentBoundaries.some(boundary => isPathWithin(eventPath, boundary) ||
          isPathWithin(boundary, eventPath) ||
          (ignoreDirectory && isPathWithin(boundary, ignoreDirectory)))) return true;
    }
    let scope = session.effectiveScope || session.scope;
    if (scope.kind === 'custom' && !session.effectiveScope) {
      try { scope = this.resolveNamedScope(scope.name).scope; }
      catch { /* A missing binding is uncertain, not proof of irrelevance. */ }
    }
    if (scope.kind === 'openEditors') {
      const open = this.openEditorUris(session);
      const ignoreDirectory = ignoreRulesDirectory(eventPath);
      if (ignoreDirectory && open.some(candidate => candidate.scheme === 'file' && candidate.fsPath &&
          isPathWithin(candidate.fsPath, ignoreDirectory))) return true;
      const exact = open.some(candidate => candidate.toString() === uri.toString());
      if (exact && this.editorMayBeIncluded(session, uri)) return true;
      if (!eventPath || (document && kind !== 'save')) return false;
      return open.some(candidate => candidate.scheme === 'file' && candidate.fsPath &&
        ((candidate.toString() !== uri.toString() && isPathWithin(candidate.fsPath, eventPath)) ||
         (kind !== 'change' && path.dirname(candidate.fsPath) === path.dirname(eventPath) &&
          this.editorMayHaveConditionalExcludes(session, candidate))));
    }
    if (!eventPath) return false;
    const roots = session.searchRoots || this.v.workspace.workspaceFolders || [];
    const rootPaths = roots.map(root => root.path || root.uri?.fsPath).filter(Boolean);
    let boundaries = rootPaths;
    if (scope.kind === 'folder' && scope.rootPath) boundaries = [scope.rootPath];
    if (scope.kind === 'directory' && (scope.directory || scope.path))
      boundaries = [scope.directory || scope.path];
    if (!boundaries.length && this.v.workspace.getWorkspaceFolder?.(uri)) boundaries = [eventPath];
    const ignoreDirectory = ignoreRulesDirectory(eventPath);
    const inside = boundaries.some(boundary => isPathWithin(eventPath, boundary) ||
      isPathWithin(boundary, eventPath) ||
      (ignoreDirectory && isPathWithin(boundary, ignoreDirectory)));
    if (!inside) return false;
    if (!ignoreDirectory) {
      const candidates = roots.filter(root => isPathWithin(eventPath, root.path || root.uri?.fsPath));
      const root = (scope.kind === 'folder' && scope.rootPath
        ? candidates.find(candidate => (candidate.path || candidate.uri?.fsPath) === scope.rootPath)
        : undefined) || candidates.sort((a, b) =>
        (b.path || b.uri?.fsPath || '').length - (a.path || a.uri?.fsPath || '').length)[0];
      const rootPath = root?.path || root?.uri?.fsPath;
      if (rootPath) {
        const relative = path.relative(rootPath, eventPath).replace(/\\/g, '/');
        const options = session.options || {};
        const request = { ...options, masksEnabled: options.maskEnabled,
          fileMask: options.mask, scope };
        let policy = root;
        if (!Object.hasOwn(root, 'exclude') && root.uri && this.v.workspace.getConfiguration) {
          const search = this.v.workspace.getConfiguration('search', root.uri);
          const files = this.v.workspace.getConfiguration('files', root.uri);
          policy = { ...root, exclude: { ...files.get('exclude', {}), ...search.get('exclude', {}) } };
        }
        try {
          const conditional = options.respectExcludes !== false && Object.values(policy.exclude || {}).some(value =>
            value && typeof value === 'object' && typeof value.when === 'string');
          const excludes = [scope.exclude, ...(options.respectExcludes === false
            ? [] : [options.exclude, policy.exclude])];
          // Create/delete or a saved new sibling can affect a different file's
          // conditional exclusion even when this path fails the current mask.
          const mayAffectSibling = conditional && ['create', 'delete', 'save'].includes(kind);
          if (!mayAffectSibling &&
              excludes.some(patterns => matchesPatterns(relative, patterns, { descendants: true }))) return false;
          const knownDocument = document || (kind === 'change' &&
            this.v.workspace.textDocuments?.some(item => item.uri.toString() === uri.toString()));
          // A known text document is a file; an arbitrary watcher URI could be a directory.
          if (knownDocument && !mayAffectSibling && !acceptsFile(relative, request, policy)) return false;
        }
        catch { /* An invalid or uncertain pattern must not hide a change. */ }
      }
    }
    return true;
  }
  scopeChanged(session) {
    this.sourceEventEpoch = (this.sourceEventEpoch || 0) + 1;
    session.scopePolicyChanged = true;
    const staleChanged = this.recordScopeEvent(session);
    if (session.searching && session.results.length)
      session.results = this.invalidateInitialResults(session, session.results);
    if (staleChanged || (session.searching && session.results.length)) this.notify(session);
  }
  invalidateInitialResults(session, results) {
    if (session.searchInvalidationOverflow || session.searchScopeInvalidated)
      return results.map(result => markDocumentIdentityUnknown([result], result.uri,
        'Source changes could not be tracked. Rerun Search.')[0]);
    if (!session.searchInvalidations?.size) return results;
    const byPath = new Map();
    const key = value => {
      const resolved = path.resolve(value);
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    };
    for (const entry of session.searchInvalidations.values())
      if (entry.uri.scheme === 'file' && entry.uri.fsPath) {
        const name = key(entry.uri.fsPath), previous = byPath.get(name);
        if (!previous || previous.revision < entry.revision) byPath.set(name, entry);
      }
    return results.map(result => {
      let latest = session.searchInvalidations.get(result.uri);
      let filePath = result.fsPath;
      if (!filePath) {
        try {
          const parsed = this.v.Uri.parse(result.uri);
          if (parsed.scheme === 'file') filePath = parsed.fsPath;
        } catch { /* The exact URI comparison above is still valid. */ }
      }
      if (filePath) {
        let current = path.resolve(filePath);
        for (;;) {
          const entry = byPath.get(key(current));
          if (entry && (!latest || entry.revision > latest.revision)) latest = entry;
          const parent = path.dirname(current);
          if (parent === current) break;
          current = parent;
        }
      }
      return latest ? this.markIdentityUnknown([result], latest.uri, latest.kind)[0] : result;
    });
  }
  pumpValidations() {
    this.validationQueue ||= [];
    this.activeValidations ||= 0;
    while (!this.disposed && this.activeValidations < MAX_VALIDATIONS && this.validationQueue.length) {
      const { session, uri, entry } = this.validationQueue.shift();
      if (entry.abort.signal.aborted || session.validations?.get(uri) !== entry) continue;
      this.activeValidations++;
      void this.validateDocument(session, uri, entry).finally(() => {
        this.activeValidations--;
        this.pumpValidations();
      });
    }
  }
  documentOpenTimeout() {
    const value = Number(this.configuration().get('search.timeoutMs', PHYSICAL_OPEN_DEFAULTS.timeoutMs));
    return Number.isFinite(value) ? Math.min(300000, Math.max(100, value)) : PHYSICAL_OPEN_DEFAULTS.timeoutMs;
  }
  activeSession(session) {
    return Boolean(!session.reviewOnly && this.sessions.get(session.id) === session && session.query &&
      (session.layout === 'findWindow' || session.panels?.size || this.transferEventSources?.get(session)?.()));
  }
  recordScopeEvent(session, uri, kind) {
    session.scopeEventRevision = (session.scopeEventRevision || 0) + 1;
    if (session.replacing) session.replacementRevision = (session.replacementRevision || 0) + 1;
    const changed = !session.scopeStale;
    session.scopeStale = true;
    if (session.searching) {
      session.searchScopeChanged = true;
      if (!uri || ignoreRulesDirectory(uri.fsPath)) session.searchScopeInvalidated = true;
      if (uri) {
        session.searchInvalidations ||= new Map();
        if (session.searchInvalidations.size < MAX_INVALIDATIONS ||
            session.searchInvalidations.has(uri.toString()))
          session.searchInvalidations.set(uri.toString(), { uri, kind, revision: session.scopeEventRevision });
        else session.searchInvalidationOverflow = true;
      }
    }
    return changed;
  }
  markIdentityUnknown(results, uri, kind) {
    const reason = kind === 'delete' ? 'File is unavailable.' :
      'The occurrence identity is unknown after an external change. Rerun Search.';
    return results.map(result => {
      if (!this.affectedByUri(result, uri)) return result;
      return { ...markDocumentIdentityUnknown([result], result.uri, reason)[0],
        pending: false, unavailable: kind === 'delete' || Boolean(result.unavailable) };
    });
  }
  fileChanged(uri, kind) {
    this.sourceEventEpoch = (this.sourceEventEpoch || 0) + 1;
    for (const session of this.sessions.values()) {
      if (!this.activeSession(session) || !this.potentiallyInScope(session, uri, { kind })) continue;
      const hadOverflow = session.searchInvalidationOverflow;
      const wasScopeInvalidated = session.searchScopeInvalidated;
      const staleChanged = this.recordScopeEvent(session, uri, kind);
      const overflowChanged = !hadOverflow && session.searchInvalidationOverflow;
      // Enumeration can change beyond the event URI: ignore rules affect
      // descendants and create/delete can change conditional sibling excludes.
      if (session.searching && kind !== 'change') session.searchScopeInvalidated = true;
      const membershipChanged = !wasScopeInvalidated && session.searchScopeInvalidated;
      if ((overflowChanged || membershipChanged) && session.results.length)
        session.results = this.invalidateInitialResults(session, session.results);
      const affectedRows = session.results.filter(result => this.affectedByUri(result, uri));
      const affected = [...new Set(affectedRows.map(result => result.uri))];
      if (!affected.length) {
        if (staleChanged || overflowChanged || membershipChanged) this.notify(session);
        continue;
      }
      const modelChanged = affectedRows.some(result => !result.identityUnknown ||
        !result.invalid || (kind === 'delete' ? !result.unavailable || result.pending :
          result.unavailable || (session.searching ? result.pending : !result.pending)));
      for (const target of affected) {
        const document = this.v.workspace.textDocuments?.find(item => item.uri.toString() === target);
        if (kind === 'delete' || session.searching ||
            !hasCurrentDocumentAuthority(session, document, { maxBytes: this.snapshotLimit() })) {
          discardDocumentBaseline(session, target);
          session.results = this.markIdentityUnknown(session.results, this.v.Uri.parse(target), kind);
        }
      }
      if (kind === 'delete') {
        for (const target of affected) this.cancelValidations(session, target);
        if (staleChanged || modelChanged || overflowChanged || membershipChanged) this.notify(session);
        this.updateNativePreview(session);
      } else if (session.searching) {
        if (staleChanged || modelChanged || overflowChanged || membershipChanged) this.notify(session);
        this.updateNativePreview(session);
      } else {
        for (const target of affected)
          this.queueValidation(session, target, 250, { notify: Boolean(staleChanged || modelChanged || overflowChanged) });
      }
    }
  }
  documentLifecycleChanged(document, kind) {
    this.sourceEventEpoch = (this.sourceEventEpoch || 0) + 1;
    const uri = document.uri, key = uri.toString();
    for (const session of this.sessions.values()) {
      if (!this.activeSession(session) || !this.potentiallyInScope(session, uri, { document: true, kind })) continue;
      const hadOverflow = session.searchInvalidationOverflow;
      const wasScopeInvalidated = session.searchScopeInvalidated;
      const staleChanged = this.recordScopeEvent(session, uri, kind);
      const overflowChanged = !hadOverflow && session.searchInvalidationOverflow;
      if (session.searching && kind === 'save') session.searchScopeInvalidated = true;
      const membershipChanged = !wasScopeInvalidated && session.searchScopeInvalidated;
      if ((overflowChanged || membershipChanged) && session.results.length)
        session.results = this.invalidateInitialResults(session, session.results);
      if (kind === 'close') {
        discardDocumentBaseline(session, key);
        // Closing a source invalidates both queued and physically opening previews,
        // even when the first row has not yet acquired a document-version binding.
        if (session.results.some(row => row.uri === key)) {
          session.previewAbort?.abort();
          session.openResultAbort?.abort();
          session.previewRevision++;
          if (this.previewSessionId === session.id) this.findPreview?.clear();
        }
      } else if (!session.searching) observeDocumentSave(session, document, { maxBytes: this.snapshotLimit() });
      const affected = session.results.some(result => result.uri === key &&
        (kind === 'close' || session.searching || Number.isSafeInteger(result.documentVersion) ||
         Number.isSafeInteger(result.trackedDocumentVersion) || session.validations?.has(key)));
      if (affected && (kind === 'close' || session.searching)) {
        this.cancelValidations(session, key);
        session.results = this.markIdentityUnknown(session.results, uri, kind);
        session.previewRevision++;
        this.updateNativePreview(session);
        this.notify(session);
      } else if (kind === 'save' && !session.searching && session.results.some(result => result.uri === key)) {
        this.queueValidation(session, key, 0);
      } else if (staleChanged || overflowChanged || membershipChanged) this.notify(session);
    }
  }
  validationTickets(session) {
    return new Map([...new Set(session.results.filter(row => row.pending).map(row => row.uri))]
      .map(uri => { const entry = session.validations?.get(uri);
        return [uri, entry && { firstQueued: entry.firstQueued, deadline: entry.deadline }]; }));
  }
  handoffValidations(session, tickets) {
    for (const uri of new Set(session.results.filter(row => row.pending).map(row => row.uri))) {
      if (session.validations?.has(uri)) continue;
      const ticket = tickets.get(uri);
      if (ticket) this.queueValidation(session, uri, 0, { ticket });
      else this.validationFailed(session, uri, Object.assign(new Error(
        'The original file check is no longer available.'), { code: 'GATE_TIMEOUT' }));
    }
  }
  validationFailed(session, uri, error) {
    discardDocumentBaseline(session, uri);
    if (['ENOENT', 'FileNotFound', 'EntryNotFound'].includes(error.code)) {
      session.results = markDocumentUnavailable(session.results, uri);
    } else {
      session.needsRerun = true;
      session.results = markDocumentIdentityUnknown(session.results, uri, `${error.message} Rerun Search.`);
    }
    session.validationNotice = true;
    session.notice = `Could not validate ${path.basename(uri)}: ${error.message}`;
    this.notify(session);
    this.updateNativePreview(session);
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
    const approval = approvalFor(session);
    return {
      id: session.id,
      mode: session.mode,
      layout: session.layout || 'modal',
      query: session.query,
      replacement: session.replacement,
      options: session.options,
      scope: session.scope,
      generation: session.generation,
      resultRevision: session.resultRevision || 0,
      previewRevision: session.previewRevision || 0,
      previewRequestId: session.previewRequestId || null,
      scopeEventRevision: session.scopeEventRevision || 0,
      actionBinding: approval?.binding || null,
      reviewOnly: Boolean(session.reviewOnly),
      reviewSourceId: session.reviewSourceId,
      reviewAll: session.reviewAll,
      reviewMatchId: session.reviewMatchId,
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
          rootName, initialOrder, invalid, invalidReason, pending, unavailable, identityUnknown, resultRevision
        }) => ({
          id,
          uri,
          relativePath,
          label,
          range,
          lineText,
          previewMatchStart,
          previewMatchEnd,
          rootName, initialOrder, invalid, invalidReason, pending, unavailable, identityUnknown, resultRevision
        })
      ),
      selectedId: session.selectedId,
      searching: session.searching,
      partial: session.partial,
      error: session.error,
      notice: session.layout === 'findWindow' && session.scopeStale
        ? [session.notice, 'Results may be out of date. Use Rerun Search.'].filter(Boolean).join(' ')
        : session.notice,
      diagnostics: session.diagnostics || '',
      replacing: Boolean(session.replacing),
      needsRerun: Boolean(session.needsRerun),
      scopeStale: Boolean(session.scopeStale),
      patchAcks: Object.fromEntries(session.patchAcks || []),
      customScopes: this.configuration()
        .get('scopes', [])
        .map((scope) => scope.name)
    };
  }
  notify(session) {
    if (this.disposed || (this.sessions && this.sessions.get(session.id) !== session)) return;
    const message = { type: 'state', state: this.snapshot(session) };
    if (session.layout === 'findWindow') {
      this.findTree.update(message.state);
      return;
    }
    for (const panel of session.panels) {
      void panel.webview.postMessage(message);
    }
  }
  resetSearch(session) {
    if (session.reviewOnly) return;
    this.cancelTransfer(session);
    this.cancelValidations(session);
    clearTimeout(session.timer);
    session.abort?.abort();
    session.previewAbort?.abort();
    session.openResultAbort?.abort();
    session.replacementAbort?.abort(new Error('Search changed. Rerun Search before replacing.'));
    this.closeReplacementReview(session);
    session.generation++;
    session.replaceApproval = undefined;
    discardDocumentBaseline(session);
    session.searchRequestFingerprint = undefined;
    session.previewRequestId = null;
    session.searching = Boolean(session.query);
    session.error = '';
    session.notice = '';
    session.diagnostics = '';
    session.partial = false;
    session.scopeStale = false;
    session.needsRerun = false;
    session.searchScopeChanged = false;
    session.searchInvalidations = new Map();
    session.searchInvalidationOverflow = false;
    session.searchScopeInvalidated = false;
    session.scopePolicyChanged = false;
    session.effectiveScope = undefined;
    session.searchRoots = undefined;
    session.openEditorUris = undefined;
    session.observedOpenEditorUris = undefined;
    session.results = [];
    session.namedScopeBinding = undefined;
    session.selectedId = null;
    session.autoSelected = false;
    session.validationNotice = false;
    session.previewRevision++;
    this.updateNativePreview(session);
    this.notify(session);
  }
  schedule(session, delay = this.configuration().get('search.debounceMs', 150)) {
    if (session.reviewOnly || this.disposed || this.sessions.get(session.id) !== session) return;
    this.resetSearch(session);
    session.timer = setTimeout(() => {
      void this.search(session);
    }, delay);
  }
  cancelValidations(session, onlyUri) {
    if (!session.validations) return;
    for (const [uri, entry] of session.validations) {
      if (onlyUri && uri !== onlyUri) continue;
      clearTimeout(entry.timer);
      clearTimeout(entry.deadlineTimer);
      entry.abort?.abort();
      session.validations.delete(uri);
      // A canceled running check remains in the global admission count until
      // its logical async operation settles (physical opens have a separate lease).
      if (!entry.running) this.validationEntries?.delete(entry);
    }
    if (this.validationQueue)
      this.validationQueue = this.validationQueue.filter(item =>
        item.session !== session || (onlyUri && item.uri !== onlyUri));
  }
  updateNativePreview(session) {
    if (this.previewSessionId !== session.id || !this.findPreview) return;
    const selected = session.results.find(result => result.id === session.selectedId);
    if (selected) this.findPreview.update?.(selected, session.results);
    else this.findPreview.clear();
  }
  queueValidation(session, uri, delay = 150, { notify = true, ticket } = {}) {
    if (this.disposed || (session.layout !== 'findWindow' && !session.panels.size && !this.transferEventSources?.get(session)?.()) ||
        this.sessions.get(session.id) !== session ||
        !session.results.some(result => result.uri === uri)) return;
    const prior = session.validations?.get(uri);
    const firstQueued = ticket?.firstQueued ?? prior?.firstQueued ?? Date.now();
    const deadline = ticket?.deadline ?? prior?.deadline ?? firstQueued + this.documentOpenTimeout();
    this.cancelValidations(session, uri);
    session.validations ||= new Map();
    this.validationEntries ||= new Set();
    if (this.validationEntries.size >= MAX_VALIDATION_BACKLOG) {
      session.needsRerun = true;
      discardDocumentBaseline(session, uri);
      session.results = markDocumentIdentityUnknown(session.results, uri,
        'Too many files need checking. Rerun Search.');
      this.notify(session);
      this.updateNativePreview(session);
      return;
    }
    if (!Number.isFinite(firstQueued) || !Number.isFinite(deadline) || deadline <= Date.now()) {
      this.validationFailed(session, uri, Object.assign(new Error('The file check timed out.'), { code: 'GATE_TIMEOUT' }));
      return;
    }
    const entry = { generation: session.generation, abort: new AbortController(), firstQueued, deadline };
    session.validations.set(uri, entry);
    this.validationEntries.add(entry);
    session.results = session.results.map(result => result.uri === uri ? {
      ...result, pending: true,
      // Pending is a new presentation/action state even if no content delta
      // preceded it (for example observed Save or initial document binding).
      // Retire an in-flight same-ID preview that still depicts a verified row.
      resultRevision: result.pending ? (result.resultRevision || 0) :
        (Number.isSafeInteger(result.resultRevision) ? result.resultRevision : 0) + 1
    } : result);
    if (notify) this.notify(session);
    this.updateNativePreview(session);
    // The caller's total budget starts at admission, before debounce/FIFO/open.
    // A busy validation lane must not leave an unbounded-duration pending row.
    entry.deadlineTimer = setTimeout(() => {
      if (session.validations?.get(uri) !== entry) return;
      this.cancelValidations(session, uri);
      this.validationFailed(session, uri, Object.assign(
        new Error('The file check timed out. A host opening may still be running.'), { code: 'GATE_TIMEOUT' }));
    }, Math.max(0, entry.deadline - Date.now()));
    entry.timer = setTimeout(() => {
      this.validationQueue ||= [];
      this.validationQueue.push({ session, uri, entry });
      this.pumpValidations();
    }, Math.min(delay, Math.max(0, VALIDATION_MAX_WAIT_MS - (Date.now() - firstQueued))));
  }
  async validateDocument(session, uri, entry) {
    entry.running = true;
    const checkDeadline = () => {
      if (Date.now() >= entry.deadline)
        throw Object.assign(new Error('The file check timed out.'), { code: 'GATE_TIMEOUT' });
    };
    const live = () => this.sessions.get(session.id) === session && !this.disposed && !entry.abort.signal.aborted &&
      session.generation === entry.generation && session.validations?.get(uri) === entry;
    try {
      checkDeadline();
      const document = await this.openDocument(this.v.Uri.parse(uri),
        { signal: entry.abort.signal, timeoutMs: entry.deadline - Date.now() });
      if (!live()) return;
      checkDeadline();
      const snapshot = readDocumentSnapshot(document, this.snapshotLimit());
      const version = snapshot.version;
      const config = this.configuration();
      const output = await this.engine.search({
        query: session.query,
        ...session.options,
        masksEnabled: false, fileMask: '', include: '', exclude: '', respectExcludes: false,
        scope: { kind: 'openEditors' }, roots: [], sourcePolicy: 'buffer-validation',
        documents: [{ uri, text: snapshot.text, version,
          displayName: path.basename(document.fileName || document.uri.fsPath || uri),
          languageId: document.languageId }],
        maxResults: 50000,
        maxFileSizeMiB: config.get('search.maxFileSizeMiB', 2),
        timeoutMs: config.get('search.timeoutMs', 10000)
      }, { signal: entry.abort.signal });
      if (!live()) return;
      checkDeadline();
      if (document.isClosed) throw new Error('The document was closed before validation completed.');
      if (document.version !== version) {
        this.queueValidation(session, uri);
        return;
      }
      const after = readDocumentSnapshot(document, this.snapshotLimit());
      if (after.contentHash !== snapshot.contentHash || after.encoding !== snapshot.encoding) {
        discardDocumentBaseline(session, uri);
        session.results = markDocumentIdentityUnknown(session.results, uri,
          'The source changed without continuous document edits. Rerun Search.');
        throw new Error('The document changed without a versioned edit. Rerun Search.');
      }
      if (incompleteSearch(output))
        throw new Error('The file check is incomplete. Rerun Search before replacing.');
      session.results = reconcileDocumentResults(session.results, uri, output.results, document, { snapshot });
      if (!session.results.some(row => row.uri === uri && row.identityUnknown))
        bindDocumentAuthority(session, document);
      session.validations.delete(uri);
      clearTimeout(entry.deadlineTimer);
      if (session.validationNotice && !session.results.some(result => result.pending)) {
        session.notice = '';
        session.validationNotice = false;
      }
      this.notify(session);
      this.updateNativePreview(session);
      const selected = session.results.find(row => row.id === session.selectedId);
      if (session.layout !== 'findWindow' && session.panels.size && selected?.uri === uri &&
          !selected.pending && !selected.invalid && !selected.identityUnknown && !selected.unavailable)
        void this.select(session, selected.id, { preserveScroll: true });
    } catch (error) {
      if (!live()) return;
      this.cancelValidations(session, uri);
      this.validationFailed(session, uri, error);
    } finally {
      entry.running = false;
      this.validationEntries?.delete(entry);
    }
  }
  resolveNamedScope(name, roots = this.v.workspace.workspaceFolders || []) {
    const custom = this.configuration().get('scopes', []).find((item) => item.name === name);
    if (!custom) throw new Error('This custom scope no longer exists. Choose another scope.');
    const scope = { kind: 'custom', name, include: custom.include, exclude: custom.exclude };
    if (!Object.hasOwn(custom, 'root')) return { scope };
    if (typeof custom.root !== 'string' || !custom.root.trim())
      throw new Error(`Named scope "${name}" requires a non-empty workspace folder name in root.`);
    const matches = roots.filter((root) => root.name === custom.root);
    if (!matches.length)
      throw new Error(`Workspace folder "${custom.root}" for named scope "${name}" was not found. Check the root setting or open that folder.`);
    if (matches.length > 1)
      throw new Error(`Workspace folder name "${custom.root}" for named scope "${name}" is ambiguous. Use unique workspace folder names.`);
    const root = matches[0];
    return {
      scope: { ...scope, kind: 'folder', rootPath: root.uri.fsPath },
      binding: { scopeName: name, rootName: custom.root, uri: root.uri.toString() }
    };
  }
  assertNamedScopeBinding(session) {
    const previous = session.namedScopeBinding;
    if (session.scope.kind !== 'custom') {
      if (previous) throw new Error('The named scope changed. Rerun Search before replacing.');
      return;
    }
    const custom = this.configuration().get('scopes', [])
      .find((item) => item.name === session.scope.name);
    if (!previous && (!custom || !Object.hasOwn(custom, 'root'))) return;
    let current;
    try {
      current = this.resolveNamedScope(session.scope.name).binding;
    } catch (error) {
      throw new Error(`${error.message} Rerun Search before replacing.`);
    }
    if (!previous || !current || previous.scopeName !== current.scopeName ||
        previous.rootName !== current.rootName || previous.uri !== current.uri)
      throw new Error('The named scope workspace folder changed. Rerun Search before replacing.');
  }
  async request(session, { signal, timeoutMs = this.documentOpenTimeout() } = {}) {
    const v = this.v,
      roots = [...(v.workspace.workspaceFolders || [])],
      query = session.query,
      options = { ...session.options },
      selectedScope = { ...session.scope };
    if (roots.some((root) => root.uri.scheme !== 'file'))
      throw new Error(
        'This version supports local desktop workspaces. Remote workspaces are not supported yet.'
      );
    if (selectedScope.kind !== 'openEditors' && !roots.length)
      throw new Error('Open a project folder, or choose Open Editors.');
    const config = this.configuration();
    const deadline = Date.now() + timeoutMs;
    let scope = selectedScope, namedScopeBinding;
    if (scope.kind === 'custom') {
      const resolved = this.resolveNamedScope(scope.name, roots);
      scope = resolved.scope;
      namedScopeBinding = resolved.binding;
    }
    const policy = {
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
      })
    };
    const editorPolicy = { options, effectiveScope: scope, searchRoots: policy.roots };
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
        if (!this.editorMayBeIncluded(editorPolicy, parsed)) continue;
        const document = await this.openDocument(parsed, { signal, timeoutMs: deadline - Date.now() });
        if (signal?.aborted || document.isClosed) throw new Error('Search preparation was cancelled or the document was closed.');
        documents.set(uri, document);
      }
    else
      for (const document of v.workspace.textDocuments)
        if (!document.isClosed && ['file', 'untitled'].includes(document.uri.scheme))
          documents.set(document.uri.toString(), document);
    return {
      query,
      sourcePolicy: 'disk-clean-buffers-dirty',
      ...options,
      masksEnabled: options.maskEnabled,
      fileMask: options.mask,
      scope,
      namedScopeBinding,
      ...policy,
      documents: [...documents.values()].map(document => {
        const descriptor = {
          uri: document.uri.toString(),
          fsPath: document.uri.scheme === 'file' ? document.uri.fsPath : undefined,
          version: document.version, isDirty: document.isDirty,
          encoding: document.encoding, eol: document.eol,
          displayName: path.basename(document.fileName || document.uri.fsPath || 'Untitled'),
          languageId: document.languageId
        };
        // Clean filesystem buffers are not disk authority, including a stale
        // clean editor with zero matches. Never read/send its text for search.
        if (document.uri.scheme !== 'file' || document.isDirty !== false) {
          try { Object.assign(descriptor, readDocumentSnapshot(document, snapshotByteLimit(policy.maxFileSizeMiB * 1024 * 1024)));
            bindDocumentAuthority(session, document); }
          catch (error) { descriptor.snapshotUnavailable = error.message; }
        }
        return descriptor;
      })
    };
  }
  async search(session) {
    if (session.reviewOnly || this.disposed || this.sessions.get(session.id) !== session) return;
    const generation = session.generation;
    if (!session.query) {
      session.searching = false;
      this.notify(session);
      return;
    }
    const abort = new AbortController();
    session.abort = abort;
    const live = () => this.sessions.get(session.id) === session && generation === session.generation && !abort.signal.aborted && !this.disposed;
    try {
      // Remember the initial membership while request() awaits document opens;
      // a close event may arrive after the tab has already disappeared.
      if (session.scope.kind === 'openEditors') {
        session.openEditorUris = this.currentOpenEditorUris();
        session.observedOpenEditorUris = new Set(session.openEditorUris.map(uri => uri.toString()));
      }
      const request = await this.request(session, { signal: abort.signal });
      if (!live()) return;
      const fingerprint = requestFingerprint(request);
      session.namedScopeBinding = request.namedScopeBinding;
      session.effectiveScope = request.scope && { ...request.scope };
      session.searchRoots = request.roots?.map(root => ({ ...root }));
      session.openEditorUris = request.scope?.kind === 'openEditors'
        ? (request.documents || []).map(document => this.v.Uri.parse(document.uri)) : undefined;
      session.observedOpenEditorUris ||= session.openEditorUris &&
        new Set(session.openEditorUris.map(uri => uri.toString()));
      const output = await this.engine.search(request, {
        signal: abort.signal,
        onBatch: (matches) => {
          if (!live()) return;
          session.results.push(...this.invalidateInitialResults(session, matches));
          if (!session.selectedId && session.results.length) {
            session.selectedId = session.results[0].id;
            session.autoSelected = true;
            void this.selectAutomatic(session);
          }
          this.notify(session);
        }
      });
      if (!live()) return;
      const results = this.invalidateInitialResults(session, output.results);
      session.results = session.layout === 'findWindow' ? sortResults(results) : results;
      if (session.layout === 'findWindow' && (session.autoSelected || !session.selectedId))
        session.selectedId = session.results[0]?.id || null;
      session.searchRequestFingerprint = fingerprint;
      session.searching = false;
      session.partial = incompleteSearch(output) || Boolean(session.searchScopeChanged || output.stats?.cancelled);
      if (session.searchScopeChanged) session.needsRerun = true;
      session.error = '';
      session.diagnostics = skipDiagnostics(output.stats);
      session.notice =
        output.reason === 'limit'
          ? 'Result limit reached. Narrow the search before Replace All.'
          : output.stats.timedOut
            ? 'Search timed out. Results are incomplete.'
            : '';
      if (output.stats.errors.length) session.notice += ' Some files could not be read.';
      session.notice = session.notice || session.feedback || '';
      if (session.searchScopeChanged && !session.notice)
        session.notice = 'Files changed during the search. Rerun Search before replacing all.';
      session.feedback = '';
      this.notify(session);
      if (session.selectedId) void this.selectAutomatic(session);
    } catch (error) {
      if (live()) {
        session.searching = false;
        if (['GATE_TIMEOUT', 'GATE_FULL'].includes(error.code)) {
          session.needsRerun = true;
          session.partial = true;
        }
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
  async select(session, id, { preserveFocus = true, preserveScroll = false } = {}) {
    const result = session.results.find((match) => match.id === id);
    if (!result) return;
    session.selectedId = id;
    session.previewAbort?.abort();
    const abort = session.previewAbort = new AbortController();
    const revision = ++session.previewRevision,
      generation = session.generation,
      resultRevision = result.resultRevision || 0,
      previewRequestId = session.previewRequestId || null;
    let previewDocument, documentVersion;
    const live = () => !this.disposed && !abort.signal.aborted &&
      this.sessions.get(session.id) === session && revision === session.previewRevision &&
      generation === session.generation && session.selectedId === id &&
      (!previewDocument || (!previewDocument.isClosed && previewDocument.version === documentVersion)) &&
      session.results.some(match => match.id === id && (match.resultRevision || 0) === resultRevision);
    this.notify(session);
    if (session.reviewOnly) return;
    try {
      if (session.layout === 'findWindow') {
        if (!this.sessions.has(session.id)) return;
        this.previewSessionId = session.id;
        if (!this.findPreview) {
          this.findPreview = new FindPreview(this.v, { openDocument: (uri, options) => this.openDocument(uri, options) });
          this.context.subscriptions.push(this.findPreview);
        }
        const editor = await this.findPreview.show(result, session.results, { preserveFocus, signal: abort.signal, current: live });
        if (editor?.document && live() && !session.searching && result.source === 'disk' &&
            result.documentVersion === undefined && !result.pending && !result.invalid &&
            !result.identityUnknown && !result.unavailable && !session.validations?.has(result.uri))
          this.queueValidation(session, result.uri, 0);
        return;
      }
      const document = await this.openDocument(this.v.Uri.parse(result.uri), { signal: abort.signal });
      if (!live() || document.isClosed) return;
      if (!session.searching && result.source === 'disk' && result.documentVersion === undefined &&
          !result.pending && !result.invalid && !result.identityUnknown && !result.unavailable &&
          !session.validations?.has(result.uri)) {
        this.queueValidation(session, result.uri, 0);
        return;
      }
      previewDocument = document;
      documentVersion = document.version;
      const preview = await this.preview.render(
        document,
        result,
        session.results.filter((match) => match.uri === result.uri),
        { maxBytes: this.snapshotLimit() }
      );
      if (!live()) return;
      for (const panel of session.panels)
        void panel.webview.postMessage({ type: 'preview', preview: {
          ...preview, id: result.id, generation, resultRevision, preserveScroll,
          previewRevision: revision, previewRequestId
        } });
    } catch (error) {
      if (live()) {
        session.notice = `Preview unavailable: ${error.message}`;
        this.notify(session);
      }
    }
  }
  async message(session, message) {
    if (!message || typeof message.type !== 'string' || this.disposed || this.sessions.get(session.id) !== session) return;
    if (session.replacing && ['pickFolder', 'pickDirectory', 'openTab', 'newTab', 'editSearch'].includes(message.type))
      return;
    if (session.reviewOnly && !['ready', 'select', 'replace', 'replaceAll'].includes(message.type))
      return;
    if (session.reviewOnly && ['replace', 'replaceAll'].includes(message.type)) {
      const source = this.sessions.get(session.reviewSourceId);
      if (!source || message.type !== (session.reviewAll ? 'replaceAll' : 'replace') ||
          (message.type === 'replace' && message.id !== session.reviewMatchId))
        throw new Error('The reviewed search is no longer available. Close this review and open the search again.');
      if (assertApproval(source, message.actionBinding) !== session.reviewApproval)
        throw new Error('The reviewed replacement snapshot changed. Close this review and review the search again.');
      session.reviewDispatching = session.replacing = true;
      this.notify(session);
      try {
        await this.replace(source, session.reviewAll, {
          ...message, generation: session.reviewApproval.binding.generation
        });
      } finally {
        session.reviewDispatching = session.replacing = false;
        if (this.sessions.has(session.id)) this.notify(session);
      }
      for (const panel of [...session.panels]) panel.dispose();
      return;
    }
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
        this.cancelTransfer(session);
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
      case 'select': {
        if (session.layout === 'findWindow') {
          const result = session.results.find(row => row.id === message.id);
          if (!result || message.generation !== session.generation ||
              (message.resultRevision ?? 0) !== (result.resultRevision ?? 0)) return;
        } else {
          const result = session.results.find(match => match.id === message.id);
          if (!result || message.generation !== session.generation ||
              message.resultRevision !== (result.resultRevision || 0) ||
              typeof message.previewRequestId !== 'string' ||
              !message.previewRequestId || message.previewRequestId.length > 240) {
            this.notify(session);
            return;
          }
          session.previewRequestId = message.previewRequestId;
        }
        this.currentId = session.id;
        session.autoSelected = false;
        await this.select(session, message.id);
        break;
      }
      case 'openResult': {
        const result = session.results.find((match) => match.id === message.id);
        if (!result || (message.generation !== undefined && message.generation !== session.generation) ||
            (message.resultRevision !== undefined && message.resultRevision !== (result.resultRevision || 0))) return;
        if (session.layout === 'findWindow') {
          this.currentId = session.id;
          session.autoSelected = false;
          await this.select(session, result.id, { preserveFocus: false });
          return;
        }
        if (session.replacing || session.openingResult ||
            (message.generation !== undefined && message.generation !== session.generation)) return;
        const generation = session.generation, resultRevision = result.resultRevision || 0;
        const abort = session.openResultAbort = new AbortController();
        const current = () => !this.disposed && this.sessions.get(session.id) === session && !abort.signal.aborted && generation === session.generation &&
          session.results.some((match) => match.id === result.id && (match.resultRevision || 0) === resultRevision);
        session.openingResult = true;
        try {
          const document = await this.openDocument(this.v.Uri.parse(result.uri), { signal: abort.signal });
          if (!current()) return;
          const matchesDocument = () => {
            if (document.isClosed) return false;
            const { text } = readDocumentSnapshot(document, this.snapshotLimit());
            return text.slice(result.offset, result.offset + result.length) === result.matchText &&
              (!result.contentHash || hash(text) === result.contentHash);
          };
          const invalidateChangedDocument = () => {
            const uri = this.v.Uri.parse(result.uri);
            this.recordScopeEvent(session, uri, 'change');
            this.cancelValidations(session, result.uri);
            session.results = this.markIdentityUnknown(session.results, uri, 'change').map(match =>
              match.uri === result.uri ? { ...match, pending: false } : match);
            session.previewRevision++;
            this.notify(session);
          };
          if (!matchesDocument()) {
            invalidateChangedDocument();
            throw new Error('This result changed. Rerun Search to update the results.');
          }
          const range = new this.v.Range(
            result.range.start.line,
            result.range.start.character,
            result.range.end.line,
            result.range.end.character
          );
          // Opening while the custom editor still owns focus routes the source
          // into/behind the modal group. Await the workbench's modal tab close
          // before selecting its restored central editor group.
          session.openingResultOwnsClose = true;
          await this.closeModalEditors(session);
          for (const panel of [...session.panels]) panel.dispose();
          if (!current()) return;
          if (!matchesDocument()) {
            invalidateChangedDocument();
            void this.v.window.showErrorMessage('JB Search: This result changed while closing the dialog. Open Find and rerun the search.');
            return;
          }
          const viewColumn = this.v.window.tabGroups.activeTabGroup?.viewColumn || this.v.ViewColumn.Active;
          try {
            await this.v.window.showTextDocument(document, {
              selection: range, viewColumn, preview: false, preserveFocus: false
            });
          } catch (error) {
            // The modal is already closed, so its webview cannot display the error.
            void this.v.window.showErrorMessage(`JB Search: Could not open the search result: ${error.message}`);
            throw error;
          }
        } finally {
          session.openingResult = false;
          session.openingResultOwnsClose = false;
          session.openResultAbort = undefined;
        }
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
        if (!session.searching && !session.replacing &&
            (message.generation === undefined || message.generation === session.generation)) this.schedule(session, 0);
        else if (typeof message.requestId === 'string' && message.requestId.length <= 240)
          for (const panel of session.panels) void panel.webview.postMessage({
            type: 'refreshRejected', requestId: message.requestId, generation: message.generation
          });
        break;
      case 'focusPreview': {
        await this.message(session, { ...message, type: 'openResult', id: message.id || session.selectedId });
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
    finally { if (source.transferring === transfer) source.transferring = undefined; }
  }
  cancelTransfer(session, { closed = false } = {}) {
    const transfer = session.transferOperation;
    if (!transfer) return;
    transfer.cancelled = true;
    if (closed) transfer.closed.add(session);
  }
  async closeModalEditors(session, { current = () => true } = {}) {
    if (!current()) return;
    const tabs = this.v.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => {
      const uri = tab.input?.uri;
      return uri?.scheme === 'jbsearch' &&
        (uri.path === `/${session.id}.jbsearch` || uri.path.startsWith(`/${session.id}~`));
    });
    // Unlike WebviewPanel.dispose(), closing tabs acknowledges the workbench's
    // focus restoration before we focus the results view.
    if (tabs.length && !await this.v.window.tabGroups.close(tabs, true))
      throw new Error('Could not close the search dialog. Try again.');
  }
  async transferFindWindow(source, newTab) {
    if (this.disposed || this.sessions.get(source.id) !== source || source.reviewOnly) return;
    const sourceTickets = this.validationTickets(source);
    const previousCurrentId = this.currentId;
    const previousFindId = this.findTree.activeId;
    const target = !newTab && this.sessions.get(source.targetWindowId);
    if (target?.replacing || target?.transferOperation)
      throw new Error('Wait for the saved search operation before opening Find Panel.');
    const window = target || (newTab ? this.create(source.mode, source) : source);
    const previous = Object.fromEntries([
      'mode', 'query', 'replacement', 'options', 'scope', 'results', 'selectedId',
      'layout', 'uri', 'searching', 'partial', 'error', 'notice', 'diagnostics', 'namedScopeBinding',
      'searchRequestFingerprint', 'needsRerun', 'scopeStale', 'initialScopeChanged',
      'resultRevision', 'scopeEventRevision', 'effectiveScope', 'searchRoots',
      'openEditorUris', 'observedOpenEditorUris', 'scopePolicyChanged', 'searchScopeChanged',
      'searchInvalidations', 'searchInvalidationOverflow', 'searchScopeInvalidated'
    ].map(key => [key, window[key]]));
    const previousTickets = this.validationTickets(window);
    const maxBytes = this.snapshotLimit();
    const previousAuthority = captureDocumentAuthority(window, { maxBytes });
    const wasSearching = source.searching;
    const parameters = session => JSON.stringify([session.mode, session.query, session.replacement,
      session.options, session.scope]);
    const transfer = { source, window, cancelled: false, closed: new Set(), closingSource: false,
      sourceGeneration: source.generation, sourceLifetime: source.lifetimeRevision,
      sourceParameters: parameters(source), eventEpoch: this.sourceEventEpoch || 0 };
    source.transferOperation = window.transferOperation = transfer;
    const sourceAlive = () => !this.disposed && this.sessions.get(source.id) === source &&
      source.lifetimeRevision === transfer.sourceLifetime && !transfer.closed.has(source);
    const destinationAlive = () => !this.disposed && this.sessions.get(window.id) === window &&
      window.lifetimeRevision === transfer.windowLifetime && !transfer.closed.has(window);
    const current = () => sourceAlive() && destinationAlive() && !transfer.cancelled &&
      source.transferOperation === transfer && window.transferOperation === transfer &&
      source.generation === transfer.sourceGeneration && window.generation === transfer.windowGeneration &&
      parameters(source) === transfer.sourceParameters && parameters(window) === transfer.windowParameters;
    const check = () => {
      if (!current()) throw Object.assign(new Error(
        'The search changed or was closed while opening Find Panel. Its current state was preserved.'),
      { code: 'TRANSFER_CANCELLED' });
    };
    const detach = () => {
      for (const session of new Set([source, window]))
        if (session.transferOperation === transfer) delete session.transferOperation;
    };
    const admit = (session, authority) => {
      for (const uri of admitDocumentAuthority(session, authority, { maxBytes })) {
        this.cancelValidations(session, uri);
        discardDocumentBaseline(session, uri);
        session.results = markDocumentIdentityUnknown(session.results, uri,
          'Document authority could not be renewed for this owner. Rerun Search.');
        session.needsRerun = true;
        session.notice = 'Document authority could not be renewed for this owner. Rerun Search.';
      }
    };
    if (window !== source) {
      this.cancelValidations(window);
      clearTimeout(window.timer);
      window.abort?.abort();
      window.previewAbort?.abort();
      window.openResultAbort?.abort();
      window.previewRevision++;
      discardDocumentBaseline(window);
      window.generation++;
      Object.assign(window, {
        mode: source.mode, query: source.query, replacement: source.replacement,
        options: { ...source.options }, scope: { ...source.scope },
        namedScopeBinding: source.namedScopeBinding && { ...source.namedScopeBinding },
        searchRequestFingerprint: source.searchRequestFingerprint,
        needsRerun: source.needsRerun, scopeStale: source.scopeStale,
        scopeEventRevision: Math.max(window.scopeEventRevision || 0, source.scopeEventRevision || 0) + 1,
        effectiveScope: source.effectiveScope && { ...source.effectiveScope },
        searchRoots: source.searchRoots?.map(root => ({ ...root })),
        openEditorUris: source.openEditorUris?.slice(),
        observedOpenEditorUris: source.observedOpenEditorUris && new Set(source.observedOpenEditorUris),
        scopePolicyChanged: source.scopePolicyChanged, searchScopeChanged: source.searchScopeChanged,
        searchInvalidations: source.searchInvalidations && new Map(source.searchInvalidations),
        searchInvalidationOverflow: source.searchInvalidationOverflow,
        searchScopeInvalidated: source.searchScopeInvalidated,
        results: source.results.map(result => ({ ...result })), selectedId: source.selectedId,
        searching: false, partial: source.partial, error: source.error, notice: source.notice,
        diagnostics: source.diagnostics
      });
      // Completed document, eligible Save and accepted raw-observation proofs
      // are re-admitted, not copied as source-owner symbols or action tokens.
      admit(window, captureDocumentAuthority(source, { maxBytes }));
    }
    window.replaceApproval = undefined;
    window.layout = 'findWindow';
    window.results = sortResults(window.results.map(result => {
      const copy = { ...result };
      delete copy.initialOrder;
      return copy;
    }));
    if (!window.results.some(result => result.id === window.selectedId))
      window.selectedId = window.results[0]?.id || null;
    transfer.windowGeneration = window.generation;
    transfer.windowLifetime = window.lifetimeRevision;
    transfer.windowParameters = parameters(window);
    const installedEpoch = window.scopeEventRevision || 0;
    if (window !== source) this.handoffValidations(window, sourceTickets);
    try {
      check();
      this.findTree.update(this.snapshot(window), { activate: true });
      await this.findTree.show(window.id, { current });
      check();
      transfer.closingSource = true;
      // An admitted close is temporary until ownership commit OR rollback's
      // actual provider reopen. Keep this owner's normal event/validation chain
      // live through both waits; no event replay, new journal or copied proof.
      this.transferEventSources ||= new WeakMap();
      this.transferEventSources.set(source, sourceAlive);
      source.replaceApproval = undefined;
      await this.closeModalEditors(source, { current });
      check();
      for (const panel of [...source.panels]) panel.dispose();
      check();
      // Host focus/show/close calls already dispatched cannot be recalled.
      // Every continuation still rechecks exact owners before doing more work.
      await this.v.commands.executeCommand('jbsearch.results.focus');
      check();
      // Both owners retain independent event chains until commit. Verify the
      // destination's own authority, never copy the source's private records.
      if (window !== source) admit(window, captureDocumentAuthority(window, { maxBytes }));
      check();
    } catch (error) {
      const restoreDestination = destinationAlive() && window.generation === transfer.windowGeneration &&
        parameters(window) === transfer.windowParameters && window.transferOperation === transfer;
      const eventsChanged = (this.sourceEventEpoch || 0) !== transfer.eventEpoch ||
        (window.scopeEventRevision || 0) !== installedEpoch;
      if (restoreDestination) {
        const epoch = Math.max(window.scopeEventRevision || 0, previous.scopeEventRevision || 0);
        const resultRevision = Math.max(window.resultRevision || 0, previous.resultRevision || 0);
        if (window !== source) this.cancelValidations(window);
        if (window === source) {
          // This owner never changed. Its actual tracked rows/checks may have
          // progressed while revealing; only presentation needs rolling back.
          Object.assign(window, { layout: previous.layout, uri: previous.uri, replaceApproval: undefined });
        } else Object.assign(window, previous, { scopeEventRevision: epoch, resultRevision, replaceApproval: undefined });
        if (eventsChanged && window !== source) {
          this.cancelValidations(window);
          discardDocumentBaseline(window);
          for (const uri of new Set(window.results.map(row => row.uri)))
            window.results = markDocumentIdentityUnknown(window.results, uri,
              'Sources changed while Find Panel was opening. Rerun Search.');
          window.scopeEventRevision = epoch + 1;
          window.scopeStale = window.needsRerun = true;
          window.searching = false;
          window.partial ||= Boolean(previous.searching);
          window.searchScopeChanged ||= Boolean(previous.searching);
          window.searchScopeInvalidated = true;
          window.searchInvalidationOverflow = true;
          window.notice = 'Sources changed while Find Panel was opening. The previous rows are unverified; Rerun Search.';
        } else if (window !== source) admit(window, previousAuthority);
        if (target) this.findTree.update(this.snapshot(window));
        else this.findTree.remove(window.id);
        if (window !== source && !target) this.sessions.delete(window.id);
      } else if (window === source) {
        // Preserve an acknowledged new generation/parameters, but undo only
        // this transaction's provisional presentation, never its current model.
        this.findTree.remove(window.id);
        if (this.sessions.get(source.id) === source) source.layout = previous.layout;
      }
      detach();
      if (!this.disposed) {
        if (restoreDestination && target && this.sessions.get(target.id) === target && !eventsChanged) {
          if (previous.searching) this.schedule(target, 0);
          else this.handoffValidations(target, previousTickets);
        }
        if ([source.id, window.id, previousCurrentId].includes(this.currentId) || !this.sessions.has(this.currentId))
          this.currentId = sourceAlive() && source.panels.size ? source.id :
            (this.sessions.has(previousFindId) ? previousFindId : this.findTree.activeId || null);
        const previousFind = this.sessions.get(previousFindId);
        if (previousFind?.layout === 'findWindow' && this.findTree.sessions.has(previousFindId))
          await this.findTree.selectSession(previousFindId, { notify: false });
        // Only this transaction's acknowledged native close may be reopened.
        // A last-panel/user/session lifetime break never resurrects an owner.
        if (sourceAlive() && transfer.closingSource && !source.panels.size) {
          this.currentId = source.id;
          await this.show(source.mode, undefined, { search: false, restoreCurrent: sourceAlive });
          if (sourceAlive() && !source.panels.size) {
            // Failed/declined reopening is not a live presentation. Retire its
            // callbacks and authority before releasing temporary event coverage.
            source.lifetimeRevision = (source.lifetimeRevision || 0) + 1;
            clearTimeout(source.timer);
            source.abort?.abort();
            source.searching = false;
            this.cancelValidations(source);
            discardDocumentBaseline(source);
            for (const uri of new Set(source.results.map(row => row.uri)))
              source.results = markDocumentIdentityUnknown(source.results, uri,
                'The search dialog could not be reopened. Rerun Search.');
            source.replaceApproval = undefined;
            source.needsRerun = true;
            source.notice = 'The search dialog could not be reopened. Rerun Search.';
          }
          if (!sourceAlive() && this.currentId === source.id)
            this.currentId = this.findTree.activeId || null;
          if (sourceAlive() && source.panels.size && wasSearching && !eventsChanged &&
              (this.sourceEventEpoch || 0) === transfer.eventEpoch && source.generation === transfer.sourceGeneration)
            this.schedule(source, 0);
        }
      }
      if (transfer.cancelled && error.code !== 'TRANSFER_CANCELLED')
        throw Object.assign(new Error('The search changed or was closed while opening Find Panel. Its current state was preserved.',
          { cause: error }), { code: 'TRANSFER_CANCELLED' });
      throw error;
    } finally {
      detach();
      if (this.transferEventSources?.get(source) === sourceAlive) this.transferEventSources.delete(source);
    }
    // No awaits remain: ownership commit cannot race an accepted edit or close.
    this.currentId = window.id;
    if (window !== source) {
      clearTimeout(source.timer);
      source.abort?.abort();
      source.searching = false;
      this.cancelValidations(source);
      source.previewAbort?.abort();
      source.openResultAbort?.abort();
      source.previewRevision++;
      source.replaceApproval = undefined;
      this.closeReplacementReview(source);
      if (source.targetWindowId) {
        const owner = this.sessions.get(source.targetWindowId);
        if (owner?.draftId === source.id) delete owner.draftId;
        this.sessions.delete(source.id);
        discardDocumentBaseline(source);
      }
    }
    delete window.targetWindowId;
    this.notify(window);
    if (wasSearching) this.schedule(window, 0);
    return window;
  }
  closeFindSearch(session) {
    if (session.layout !== 'findWindow' || !this.sessions.has(session.id)) return;
    if (session.replacing) throw new Error('Wait for the replacement before closing this search.');
    session.lifetimeRevision = (session.lifetimeRevision || 0) + 1;
    this.cancelTransfer(session, { closed: true });
    clearTimeout(session.timer);
    session.abort?.abort();
    session.previewAbort?.abort();
    session.openResultAbort?.abort();
    this.cancelValidations(session);
    this.closeReplacementReview(session);
    for (const panel of [...session.panels]) panel.dispose();
    const draft = this.sessions.get(session.draftId);
    if (draft) {
      for (const panel of [...draft.panels]) panel.dispose();
      this.sessions.delete(draft.id);
    }
    this.sessions.delete(session.id);
    discardDocumentBaseline(session);
    session.replaceApproval = undefined;
    this.findTree.remove(session.id);
    if (this.previewSessionId === session.id) {
      this.findPreview?.clear();
      this.previewSessionId = undefined;
    }
    if (this.currentId === session.id || this.currentId === draft?.id)
      this.currentId = this.findTree.activeId || null;
  }
  closeReplacementReview(source, reviewId = source.reviewId) {
    const review = this.sessions?.get(reviewId);
    if (!review) return;
    for (const panel of [...review.panels]) panel.dispose();
    this.sessions.delete(review.id);
    if (source.reviewId === reviewId) delete source.reviewId;
  }
  async reviewReplacement(source, all, id) {
    if (source.reviewOpening) throw new Error('Wait for the frozen replacement review to open.');
    const approval = approvalFor(source);
    if (!approval) throw new Error('Wait for the current search before reviewing replacement.');
    this.closeReplacementReview(source);
    const review = this.create(source.mode, source);
    Object.assign(review, {
      ...copy(approval.model), id: review.id, layout: 'modal',
      reviewOnly: true, reviewSourceId: source.id, reviewAll: all,
      reviewMatchId: id, reviewApproval: approval,
      results: approval.model.results,
      selectedId: all ? approval.model.results[0]?.id : id,
      notice: 'Frozen replacement review. Search and replacement parameters cannot change here. Preview is unavailable; the source may have changed. Use the explicit replacement action only for this snapshot.'
    });
    review.uri = review.uri.with({ query: 'review=1' });
    source.reviewId = review.id;
    source.reviewOpening = true;
    try {
      // Do not call show(): Edit Search creates a searching draft and cannot
      // serve as approval of a previously frozen occurrence model.
      if (!await openModal(this.v, review.uri, VIEW_TYPE)) {
        this.sessions.delete(review.id);
        delete source.reviewId;
        this.currentId = this.sessions.has(source.id) ? source.id : this.findTree.activeId || null;
        return;
      }
      if (this.sessions.get(source.id) !== source || this.sessions.get(review.id) !== review ||
          source.reviewId !== review.id) {
        this.closeReplacementReview(source, review.id);
        return;
      }
      this.notify(review);
    } catch (error) {
      this.closeReplacementReview(source, review.id);
      this.currentId = this.sessions.has(source.id) ? source.id : this.findTree.activeId || null;
      throw error;
    } finally { source.reviewOpening = false; }
  }
  async replace(session, all, message) {
    if (session.transferOperation)
      throw new Error('Wait for Find Panel to finish opening before replacing.');
    if (
      session.mode !== 'replace' ||
      session.replacing ||
      session.searching ||
      message.generation !== session.generation
    )
      throw new Error('Wait for the current search before replacing.');
    if (session.error) throw new Error('Resolve the search error before replacing.');
    if (all && session.partial)
      throw new Error(
        'Replace All requires complete results. Narrow the search or increase its limits.'
      );
    const candidates = all ? session.results : session.results.filter(match => match.id === message.id);
    if (!sameOccurrences(candidates, candidates, uri => this.v.Uri.parse(uri).toString()))
      throw new Error('The search results have ambiguous identities. Rerun Search before replacing.');
    if (!all && message.resultRevision !== undefined &&
        candidates.some(row => (row.resultRevision || 0) !== message.resultRevision))
      throw new Error('The displayed result changed. Rerun Search or review the current occurrence.');
    if (candidates.some(match => match.invalid || match.pending || match.unavailable || match.identityUnknown))
      throw new Error('These results are INVALID or still being checked. Rerun Search before replacing.');
    if (message.actionBinding == null) {
      if (!candidates.length) return;
      return this.reviewReplacement(session, all, message.id);
    }
    const approval = assertApproval(session, message.actionBinding);
    const matches = all ? approval.model.results
      : approval.model.results.filter(match => match.id === message.id);
    if (!matches.length) return;
    if (matches.some(match => match.invalid || match.pending || match.unavailable || match.identityUnknown))
      throw new Error('These results are INVALID or still being checked. Rerun Search before replacing.');
    this.assertNamedScopeBinding(session);
    if (all && !session.searchRequestFingerprint) {
      session.needsRerun = true;
      this.notify(session);
      throw new Error('The original search scope cannot be verified. Rerun Search before replacing.');
    }
    const configuredTimeout = this.configuration().get('replace.prepareTimeoutMs', 60000);
    const timeout = Math.min(300000, Math.max(100, Number(configuredTimeout) || 60000));
    const generation = session.generation;
    const replacementOperation = session.replacementOperation = {};
    const lifetime = session.lifetimeRevision;
    const ownsOperation = () => session.replacementOperation === replacementOperation;
    const statusCurrent = () => !this.disposed && this.sessions.get(session.id) === session &&
      session.generation === generation && session.lifetimeRevision === lifetime && ownsOperation();
    session.replacing = true;
    session.error = '';
    if (all) session.notice = 'Checking the current search scope before Replace All…';
    this.notify(session);
    const originalResults = session.results;
    const originalCount = originalResults.length;
    const operation = JSON.stringify({ query: session.query, scope: session.scope,
      options: session.options, replacement: session.replacement, mode: session.mode });
    const eventRevision = session.replacementRevision || 0;
    const scopeEventRevision = session.scopeEventRevision || 0;
    const canonicalUri = uri => this.v.Uri.parse(uri).toString();
    const abort = new AbortController();
    session.replacementAbort = abort;
    const deadline = new PreparationDeadline(abort, timeout);
    // The immutable manifest is checked fully at admission and again before
    // dispatch. Intermediate guards use its exact descriptor plus backend
    // invalidation epochs/references; this avoids N-results work on every
    // per-file await without trusting those revisions as prior user approval.
    const current = (checkModel = false) => {
      deadline.check();
      if (abort.signal.aborted) throw abort.signal.reason;
      if (this.sessions && this.sessions.get(session.id) !== session)
        throw new Error('The search was closed before replacement.');
      if (assertApproval(session, message.actionBinding, { checkModel }) !== approval)
        throw new Error('The approved replacement snapshot changed. Rerun Search.');
      if (this.disposed || session.generation !== generation || session.results !== originalResults ||
          session.lifetimeRevision !== lifetime || !ownsOperation() ||
          session.searchRequestFingerprint !== approval.binding.requestFingerprint ||
          session.resultRevision !== approval.binding.resultRevision ||
          session.results.length !== originalCount ||
          (session.replacementRevision || 0) !== eventRevision ||
          (session.scopeEventRevision || 0) !== scopeEventRevision ||
          JSON.stringify({ query: session.query, scope: session.scope, options: session.options,
            replacement: session.replacement, mode: session.mode }) !== operation)
        throw new Error('The search or its scope changed. Rerun Search before replacing.');
      deadline.check();
      if (abort.signal.aborted) throw abort.signal.reason;
    };
    let success = false, dispatched = false;
    try {
      let request, freshResults;
      if (all) {
        request = await abortable(this.request(session, { signal: abort.signal, timeoutMs: deadline.millisecondsLeft() }), abort.signal);
        current();
        if (requestFingerprint(request) !== session.searchRequestFingerprint)
          throw new Error('The search scope or filters changed. Rerun Search before replacing.');
        let output;
        deadline.pause();
        current();
        const searchTimeout = Math.min(300000, Math.max(100, Number(request.timeoutMs) || 10000));
        const searchStarted = performance.now();
        const searchTimeoutError = () => new Error('The current scope search timed out. No edit was submitted. Increase jbsearch.search.timeoutMs or narrow the scope, then Rerun Search.');
        const searchDeadline = setTimeout(() => abort.abort(searchTimeoutError()), searchTimeout);
        try {
          output = await abortable(this.engine.search(request, { signal: abort.signal }), abort.signal);
          if (performance.now() - searchStarted >= searchTimeout && !abort.signal.aborted)
            abort.abort(searchTimeoutError());
        } catch (error) {
          if (abort.signal.aborted) throw abort.signal.reason;
          throw new Error(`Could not check the complete search scope: ${error.message}. Rerun Search.`);
        } finally {
          clearTimeout(searchDeadline);
          deadline.resume();
        }
        current();
        if (output?.stats?.timedOut === true || output?.reason === 'timeout') throw searchTimeoutError();
        if (!completePreflight(output))
          throw new Error('The current scope check is incomplete. Rerun Search before replacing.');
        if (!sameOccurrences(matches, output.results, canonicalUri))
          throw new Error('The search results changed. Rerun Search before replacing.');
        if (!samePlans(approval.model.replacementMeaning, replacementMeaning(output.results, {
          replacement: approval.model.replacement, regex: approval.model.options.regex,
          preserveCase: approval.model.options.preserveCase
        }))) throw new Error('The replacement meaning changed. Rerun Search before replacing.');
        const originalUris = new Map();
        for (const match of matches) {
          const key = canonicalUri(match.uri), previous = originalUris.get(key);
          if (previous && previous !== match.uri)
            throw new Error('The search contains ambiguous file identities. Rerun Search before replacing.');
          originalUris.set(key, match.uri);
        }
        freshResults = output.results.map(match => ({ ...match, uri: originalUris.get(canonicalUri(match.uri)) }));
      }
      const documents = new Map(), opened = new Map(), baselines = new Map();
      const maxBytes = this.snapshotLimit();
      const oldByUri = new Map();
      for (const match of matches) {
        if (!oldByUri.has(match.uri)) oldByUri.set(match.uri, []);
        oldByUri.get(match.uri).push(match);
      }
      const freshByUri = new Map();
      for (const match of freshResults || []) {
        if (!freshByUri.has(match.uri)) freshByUri.set(match.uri, []);
        freshByUri.get(match.uri).push(match);
      }
      for (const uri of new Set(matches.map((match) => match.uri))) {
        let document;
        try {
          document = await this.openDocument(this.v.Uri.parse(uri), { signal: abort.signal,
            timeoutMs: deadline.millisecondsLeft() });
        } catch (error) {
          if (abort.signal.aborted) throw abort.signal.reason;
          throw new Error(`A search file could not be opened: ${error.message}. Rerun Search.`);
        }
        current();
        if (!document?.uri || canonicalUri(document.uri.toString()) !== canonicalUri(uri) ||
            !Number.isSafeInteger(document.version) || document.version < 0 ||
            typeof document.isDirty !== 'boolean')
          throw new Error('A search document could not be identified reliably. Rerun Search before replacing.');
        const snapshot = readDocumentSnapshot(document, maxBytes);
        const { version, text } = snapshot, dirty = document.isDirty;
        if (document.isClosed || document.version !== version)
          throw new Error('A file changed before replacement. Rerun Search.');
        const samples = [...(oldByUri.get(uri) || []), ...(freshByUri.get(uri) || [])];
        if (samples.some(sample => !knownProvenance(sample)))
          throw new Error('A file\'s search provenance is incomplete. Rerun Search; if this persists, check the file and report the issue.');
        const textHash = hash(text);
        for (const sample of samples) {
          assertReplaceableMatch(sample, document, text);
          if (textHash !== sample.contentHash)
            throw new Error('A file changed since the search. Refresh the results before replacing.');
        }
        const baseline = await this.prepareReplacementSource(session, document,
          oldByUri.get(uri) || [], freshByUri.get(uri), {
            signal: abort.signal, check: current, maxBytes,
            remaining: () => deadline.millisecondsLeft()
          });
        current();
        baselines.set(uri, baseline);
        documents.set(uri, {
          text,
          version,
          dirty,
          encoding: document.encoding,
          eol: document.eol === this.v.EndOfLine.CRLF ? '\r\n' : '\n'
        });
        opened.set(uri, document);
      }
      const replacementOptions = {
        replacement: approval.model.replacement,
        regex: approval.model.options.regex,
        preserveCase: approval.model.options.preserveCase
      };
      const plans = planReplacements(matches, documents, replacementOptions);
      if (all && !samePlans(plans, planReplacements(freshResults, documents, replacementOptions)))
        throw new Error('The replacement meaning changed. Rerun Search before replacing.');
      if (all) {
        const latest = await abortable(this.request(session, { signal: abort.signal, timeoutMs: deadline.millisecondsLeft() }), abort.signal);
        current();
        if (requestFingerprint(latest) !== session.searchRequestFingerprint ||
            documentFingerprint(latest) !== documentFingerprint(request))
          throw new Error('The search scope or open documents changed. Rerun Search before replacing.');
      }
      for (const [uri, baseline] of baselines) {
        if (!baseline) continue; // Untitled (or an explicitly synthetic test adapter).
        await this.runDiskCheck(() => { current(); return assertDiskBaseline(opened.get(uri).uri, baseline,
          { signal: abort.signal }); }, { signal: abort.signal, timeoutMs: deadline.millisecondsLeft() });
        current();
      }
      const edit = new this.v.WorkspaceEdit();
      for (const plan of plans) {
        const r = plan.range;
        edit.replace(
          this.v.Uri.parse(plan.uri),
          new this.v.Range(r.start.line, r.start.character, r.end.line, r.end.character),
          plan.replacement
        );
      }
      current();
      for (const [uri, document] of opened) {
        const expected = documents.get(uri), version = document.version;
        if (document.isClosed || version !== expected.version || document.isDirty !== expected.dirty ||
            document.encoding !== expected.encoding ||
            (document.eol === this.v.EndOfLine.CRLF ? '\r\n' : '\n') !== expected.eol ||
            readDocumentSnapshot(document, maxBytes).contentHash !== hash(expected.text) || document.version !== version)
          throw new Error('A file changed before replacement. Refresh first.');
      }
      const currentMatches = all ? session.results : session.results.filter(match => match.id === message.id);
      if (!sameOccurrences(matches, currentMatches, canonicalUri) ||
          currentMatches.some(match => match.invalid || match.pending || match.unavailable || match.identityUnknown))
        throw new Error('The search results changed. Rerun Search before replacing.');
      this.assertNamedScopeBinding(session);
      current(true);
      for (const [uri, baseline] of baselines)
        commitDiskObservation(session, opened.get(uri), baseline);
      current();
      // Once dispatched, VS Code owns the edit. A preparation timeout cannot
      // revoke it, so retain the replacement lock until its outcome is known.
      deadline.stop();
      dispatched = true;
      if (!(await this.v.workspace.applyEdit(edit)))
        throw new Error('VS Code could not apply the replacement. No success was assumed.');
      success = true;
    } catch (error) {
      if (dispatched && !statusCurrent()) {
        const obsolete = new Error(error?.message || String(error), { cause: error });
        obsolete.obsoleteDispatchedReplacement = true;
        throw obsolete;
      }
      if (!dispatched && error.code === 'GATE_TIMEOUT' && deadline.millisecondsLeft() <= 5)
        deadline.expire();
      if (!dispatched && abort.signal.aborted) throw abort.signal.reason;
      throw error;
    } finally {
      deadline.stop();
      if (session.replacementAbort === abort) session.replacementAbort = undefined;
      if (ownsOperation()) session.replacing = false;
      if (statusCurrent() && !success && all) {
        session.needsRerun = true;
        if (session.notice === 'Checking the current search scope before Replace All…') session.notice = '';
      }
      if (!this.disposed && this.sessions.get(session.id) === session && ownsOperation()) this.notify(session);
    }
    if (success && statusCurrent()) {
      // A dispatched edit is not revocable. Its eventual reply still must not
      // schedule old-query validation or overwrite a newer generation's status.
      for (const uri of new Set(matches.map(match => match.uri))) this.queueValidation(session, uri, 0);
      session.feedback = `Replaced ${matches.length} matches. Changes are unsaved; use Undo in VS Code to revert.`;
      session.notice = session.feedback;
      this.notify(session);
    }
  }
  dispose() {
    this.disposed = true;
    for (const session of this.sessions.values()) {
      session.lifetimeRevision = (session.lifetimeRevision || 0) + 1;
      this.cancelTransfer(session, { closed: true });
      clearTimeout(session.timer);
      session.abort?.abort();
      session.previewAbort?.abort();
      session.openResultAbort?.abort();
      discardDocumentBaseline(session);
      session.replacementAbort?.abort(new Error('Extension stopped before replacement.'));
      this.cancelValidations(session);
    }
    this.engine.dispose();
    this.documentOpenGate?.dispose();
    this.diskChecks?.dispose();
    this.preview.dispose();
    this.findTree.dispose();
    this.findPreview?.dispose?.();
  }
}
module.exports = { SearchController, VIEW_TYPE };
