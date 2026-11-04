# Native editor in the preview: feasibility study

Date: 2026-11-04. **Isolated research prototype; not incorporated into production
JB Search.** The user approved testing the prototype, not changing the shipped
extension's architecture.

## Conclusion

A native `TextEditor` was successfully placed below the search webview inside a
single floating VS Code modal editor. It automatically uses the client theme,
GitHub Dark Default, even though the server extension host cannot see that theme.
BL code is highlighted, and matches use native decorations. This can indeed
bypass the problem of a theme missing on the server.

However, **the discovered preview update scheme is unsuitable for interactive
search**: it temporarily moves focus from the query to the native editor. Ordinary
typing of `return` produced `retrn`, and the missing character entered the test
source. A read-only snapshot protects the source, but a separately confirmed loss
of a query character remains. Moving the modal to the main editor through the
native action also fails to preserve the composite layout: search and preview
become separate tabs.

This is a negative result for a specific adapter that switches focus,
**not proof that all native previews are impossible**. It should not be introduced
into the production extension, intercept global input, or silently change `useModal`.

![Native BL TextEditor with client GitHub Dark Default](assets/native-preview-github-dark.png)

This is the prototype's technical layout, not the proposed final UI.

## Environment

- Official VS Code **1.143.1**, commit
  `e646868227c3e3a9e3f24277c8c7220be42c0be7`, Linux x64, X11/Xvfb.
- Real Remote SSH to an isolated localhost server; an ordinary workspace extension
  registered from its source folder, without a Development Host.
- Separate client user-data/extensions, server-data, and a synthetic workspace.
  The user's working profile was neither reloaded nor changed.
- **GitHub Theme 6.3.5** installed only on the client. The server has the probe and
  the existing BL extension; its sources were used read-only.
- `serverSeesGitHubTheme: false`, `serverSeesBL: true`,
  `workbench.editor.useModal: some`. No proposed APIs were enabled in the probe.
- Playwright/CDP GUI automation was used only in the test instance. The extension
  itself does not access the workbench DOM/inspector.
- macOS, Windows, Wayland, and Remote SSH over a network with substantial latency
  were **not tested**. Local loopback does not verify their behavior.

## Mechanism and API boundary

The search webview opens in the modal, then `vscode.setEditorLayout` creates two
vertically stacked editor groups. The upper group contains query/results, and the
lower group contains a native text editor. Group numbers are determined from tabs,
not fixed as `ViewColumn.One/Two`: in the test environment, the main group is
column 1, search is 2, and preview is 3.

Ordinary `showTextDocument({ viewColumn, preserveFocus: true })` does not open in
the lower modal group: with `useModal: some`, VS Code redirects that group to the
main editor. Explicit internal `MODAL_GROUP = -4` bypasses this guard but chooses
the **active** group of the modal part. The tested adapter therefore uses:

```js
await vscode.commands.executeCommand('workbench.action.focusBelowGroup');
await vscode.commands.executeCommand('_workbench.open', previewUri, [-4, {
  preserveFocus: true,
  pinned: false
}]);
// Find the TextEditor, set decorations, and reveal the selected range.
await vscode.commands.executeCommand('workbench.action.focusAboveGroup');
await searchWebview.postMessage({ type: 'focus' });
```

Here, `preserveFocus` preserves the **already changed** focus. Returning after the
command does not restore keys sent to the native editor between these actions.
Debouncing and request queues cannot guarantee that the user will stop typing
while the preview updates. The tested internal route provides no separate
selector for an inactive modal group; the existence of another suitable route
has not been established. Internal `_workbench.openWith`, `_workbench.open`, and
`-4` do not become stable public APIs because the probe works without proposed APIs.

Two modes were tested: the original URI with a real editable document, and
`TextDocumentContentProvider` with a read-only `jb-native-snapshot:` URI. In the
second mode, the snapshot source is current `TextDocument.getText()`, including
unsaved edits; assigning language `bl` applies native TextMate highlighting.

## Confirmed results

| Check | Result |
| --- | --- |
| Search webview and native BL editor in one modal | Two groups inside one dialog |
| GitHub Dark Default only on the client | Keyword `return` has color `rgb(255, 123, 114)` with `serverSeesGitHubTheme: false` |
| Selected and other matches | Native decorations appear over syntax colors |
| Selecting another result | Native preview switches between two remote BL files |
| GitHub Dark Default → Light Modern → back | Keyword color changes to `rgb(175, 0, 219)` and back without a custom theme bridge |
| Attempt to type in the read-only snapshot | Snapshot length/dirty state and source files are unchanged |
| Unsaved source edit | Snapshot and visible lines update; source dirty, snapshot clean, disk unchanged |
| Ordinary typing of `return`, 140 ms between characters | Produced `retrn`; original preview becomes dirty, and closing triggers save confirmation |
| Character `n` 2 ms after blur in snapshot mode | Expected `return`, received `retur`: read-only does not protect query input |
| Clean move of modal to a tab | Search and snapshot become separate tabs in one selected main group |
| Test environment cleanup | Dirty fixtures discarded without saving; a clean `baseline.js` tab remains |

Ordinary typing report:
[native-preview-results-source.json](native-preview-results-source.json).
It contains 4 passed checks, 1 confirmed limitation, and 7 errors. These errors
**are not seven independent defects**: after the query was corrupted, the results
disappeared, and save confirmation then disrupted later checks. Row selection,
reopen, and dialog-count errors cannot be interpreted independently of that state.

Separate clean snapshot run:
[native-preview-results-snapshot.json](native-preview-results-snapshot.json) —
5 passed checks, 2 confirmed limitations, 0 unexpected errors.
Read-only behavior, unsaved text, colors, input loss, and moving to a tab were
checked separately after state cleanup. The text update test normalized Monaco
DOM non-breaking spaces; document selection is determined by the actual URI.

Additional screenshots:
[save confirmation after a character entered the source](assets/native-preview-input-loss.png),
[moving to a tab from a clean state](assets/native-preview-move-to-tab.png).

## Implications for the architecture choice

The BL grammar and GitHub Dark Default are not the reason colors are missing:
testing the same grammar with the client theme produced real syntax highlighting.
The native editor solves access to client styling, but the discovered placement
method breaks input preservation and the required unified search tab.

A read-only snapshot is also not equivalent to the source document for every
language: a different URI scheme may exclude semantic providers. This test covers
BL/TextMate, not complete semantic highlighting from all language extensions.

Separate options remain for further discussion:

1. Find a way to update an inactive modal group **without changing focus**, then
   recheck input, the tab, and platforms. A suitable route has not yet been found.
2. Keep the existing unified webview and have a small local UI extension pass
   client theme rules to the server component through VS Code commands. This is
   a supported channel between hosts without custom SSH/sockets, but involves
   two technical extension IDs, separate client registration, and a still untested
   installation/update flow. Includes, user token customizations, theme changes,
   and a missing local component must be handled. Theme transfer alone does not
   provide all semantic tokens or client grammars.
3. Wait for the ready-made syntax highlighting API to stabilize. In tested 1.143.1,
   `computeFullSyntaxHighlighting` is still part of proposed
   `documentSyntaxHighlighting`; this is not a solution for an ordinary stable
   release.

This study does not authorize selection of the next option or production
implementation. OpenSpec tasks 4.6 and 5.3 remain open; baseline specs have not
been synchronized.

## Reproduction and artifacts

The isolated probe's source and GUI runners:
`/tmp/jbsearch-native-preview-probe/extension.js`, `verify.cjs`, and
`verify-snapshot.cjs`. They are not shipped with JB Search. The original suite
recorded source input loss; the snapshot runner separately starts with `reset`,
checks read-only behavior, and finishes by discarding changes only to synthetic
fixtures. Results and screenshots were copied to this directory before the test
instance was stopped.

After the research documents were updated, `npm run check`, all 52 current
`npm test` tests, `npm run spec:check`, `git diff --check`, and local Markdown link
checks passed. `node --check` passed for the probe and snapshot runner. This checks
the repository and prototype; it does not confirm a production preview fix.
The VSIX was not rebuilt in this iteration: shipped code and manifest were unchanged.

## Primary sources

- [Group selection, modal redirect, and activeGroup in VS Code 1.143.1](https://github.com/microsoft/vscode/blob/e646868227c3e3a9e3f24277c8c7220be42c0be7/src/vs/workbench/services/editor/common/editorGroupFinder.ts)
- [Native moving and merging of modal groups](https://github.com/microsoft/vscode/blob/e646868227c3e3a9e3f24277c8c7220be42c0be7/src/vs/workbench/browser/parts/editor/modalEditorPart.ts)
- [Read-only virtual documents and content updates](https://code.visualstudio.com/api/extension-guides/virtual-documents)
- [Commands between UI and workspace extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions#communicating-between-extensions-using-commands)
- [Proposed syntax highlighting contract](https://github.com/microsoft/vscode/blob/e646868227c3e3a9e3f24277c8c7220be42c0be7/src/vscode-dts/vscode.proposed.documentSyntaxHighlighting.d.ts)
- [Client GitHub Theme 6.3.5 manifest](https://github.com/primer/github-vscode-theme/blob/v6.3.5/package.json)
