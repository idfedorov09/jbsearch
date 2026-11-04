'use strict';

// Results live in a native Panel. Open source files in the active editor group
// without splitting the workbench or moving existing tabs.
class FindPreview {
  constructor(vscode) {
    this.v = vscode;
    this.editor = undefined;
    this.revision = 0;
    this.queue = Promise.resolve();
    this.disposed = false;
    const rangeBehavior = vscode.DecorationRangeBehavior.ClosedClosed;
    this.matches = vscode.window.createTextEditorDecorationType({
      // DecorationRenderOptions accepts a CSS color string. These workbench
      // theme variables retain the theme's original alpha and update live;
      // mixing the fill alone leaves token foreground colors fully opaque.
      backgroundColor: 'color-mix(in srgb, var(--vscode-editor-findMatchHighlightBackground, transparent) 70%, transparent)',
      borderColor: 'var(--vscode-editor-findMatchHighlightBorder, transparent)',
      borderStyle: 'solid',
      borderWidth: '1px',
      borderRadius: '2px',
      rangeBehavior
    });
    this.selected = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'color-mix(in srgb, var(--vscode-editor-findMatchBackground, transparent) 70%, transparent)',
      borderColor: 'var(--vscode-editor-findMatchBorder, transparent)',
      borderStyle: 'solid',
      borderWidth: '1px',
      borderRadius: '2px',
      rangeBehavior
    });
  }

  get viewColumn() {
    return this.editor?.viewColumn;
  }

  /**
   * Show an actual source document above the native Find panel. Each result
   * uses the existing search model's { uri, id, range: { start, end } } shape.
   * Call with preserveFocus:false for an explicit action to edit the source.
   */
  show(result, matches = [], { preserveFocus = true } = {}) {
    const revision = ++this.revision;
    const column = this.v.window.tabGroups.activeTabGroup?.viewColumn || this.v.ViewColumn.Active;
    const request = { result, matches, column };
    this.request = request;
    const operation = this.queue.catch(() => {}).then(async () => {
      if (this.disposed || revision !== this.revision || !result) return undefined;
      const uri = typeof result.uri === 'string' ? this.v.Uri.parse(result.uri) : result.uri;
      const document = await this.v.workspace.openTextDocument(uri);
      if (this.disposed || revision !== this.revision) return undefined;
      const range = this.range(document, request.result);
      const caret = new this.v.Range(
        range.start.line, range.start.character, range.start.line, range.start.character
      );
      const editor = await this.v.window.showTextDocument(document, {
        viewColumn: column,
        preview: preserveFocus,
        preserveFocus,
        selection: caret
      });
      if (this.disposed || revision !== this.revision) return undefined;
      if (this.editor && this.editor !== editor) this.clearDecorations(this.editor);
      this.editor = editor;
      this.update(request.result, request.matches);
      editor.revealRange(range, this.v.TextEditorRevealType.InCenterIfOutsideViewport);
      return editor;
    });
    this.queue = operation;
    return operation;
  }

  /** Refresh match styles after an edit, without opening an editor or moving its caret. */
  update(result, matches = []) {
    if (this.disposed || !result) return false;
    if (this.request?.result?.id === result.id &&
        String(this.request.result.uri) === String(result.uri)) {
      this.request.result = result;
      this.request.matches = matches;
    }
    const editor = this.editor;
    if (!editor || !this.v.window.visibleTextEditors.includes(editor) ||
        String(editor.document.uri) !== String(result.uri)) return false;
    const valid = (match) => !match.invalid && !match.pending && match.valid !== false;
    const sameDocument = (match) => String(match.uri) === String(result.uri);
    editor.setDecorations(
      this.matches,
      matches.filter((match) => sameDocument(match) && match.id !== result.id && valid(match))
        .map((match) => this.range(editor.document, match))
    );
    editor.setDecorations(this.selected, valid(result) ? [this.range(editor.document, result)] : []);
    return true;
  }

  range(document, result) {
    const { start, end } = result.range;
    return document.validateRange(new this.v.Range(
      start.line, start.character, end.line, end.character
    ));
  }

  clearDecorations(editor) {
    if (!this.v.window.visibleTextEditors.includes(editor)) return;
    editor.setDecorations(this.matches, []);
    editor.setDecorations(this.selected, []);
  }

  clear() {
    ++this.revision;
    this.request = undefined;
    if (this.editor) this.clearDecorations(this.editor);
    this.editor = undefined;
  }

  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.matches.dispose();
    this.selected.dispose();
    // Leave all source editors open, including dirty or pinned preview tabs.
  }
}

module.exports = { FindPreview };
