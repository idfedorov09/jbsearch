# ADR 0008: Native Find tree in the bottom panel and central editor

Status: **Accepted**

Date: 2026-11-04

## Context

The HTML tree from ADR 0007 displayed custom SVGs for all files and folders.
The user requested native client icons, including under Remote. Native TreeView
lets SearchEngine/sessions/INVALID remain custom while delegating ResourceLabels
to the workbench. The public API places a contributed tree in a View, but not in
a central Editor. The user explicitly chose the bottom panel with results opening
in the center.

## Decision

Use a contributed `panel` container, `jbsearch-find`, with the TreeView
`jbsearch.results`. FindTree receives SearchController snapshots, builds the tree
data, and supplies `TreeItem.resourceUri` and `ThemeIcon.File`/`Folder`. File is
set explicitly on collapsible file nodes; otherwise, child matches would make
them folders by default. The client workbench itself renders icons, theme changes,
rows, highlights, and expansion. Reading or forwarding JSON/fonts/images from
the client icon theme is unnecessary.

One view shows the selected search; independent snapshots are available through
Switch Saved Search (QuickPick). New Search and Keep as a new search keep their
parameters independent. Hide Panel preserves sessions; Close Search cancels that
session's workers/checks and releases the snapshot. The gear opens an isolated
draft of the selected search; Esc leaves the original parameters, and confirmation
updates the same search.

FindPreview opens a file through showTextDocument in the active editor group.
It neither creates groups nor moves existing tabs. A click preserves tree focus;
Open and Focus Editor / Cmd/Ctrl+Enter focuses the source and pins the tab.
The panel itself, background batches, and Rerun do not change the editor document
before explicit selection. The 70% fill of search decorations remains in the
source; the tree uses ordinary TreeItemLabel highlights without custom HTML/CSS.
INVALID is marked by a prefix before the snippet and the native ThemeIcon `error`
with ThemeColor `errorForeground`. The active theme chooses the error color;
file icons and the text of other rows retain their native appearance.

This supersedes the **placement and renderer** of ADR 0007. Its snapshot ordering,
tracking, worker validation, INVALID/Undo, and guarded replacement remain.
The modal and client bridge from ADR 0006 are unchanged. Restored old findWindow
editor URIs redirect to the panel; in-memory history is not restored after Reload.

## Alternatives

- Forward the client file icon theme to a webview: possible, but requires adapting
  the resolver/CSS/resources and maintaining compatibility with workbench logic.
- Native tree in a central editor: no public API; renderer injection/patching would
  violate the chosen ordinary extension installation approach.
- Hidden TreeView with DOM/icon extraction: no public API for extracting the DOM.

## Consequences and checks

The bottom panel replaces separate results editor tabs; sessions are switched
through native QuickPick. The user can still configure the Panel position; the
extension does not move Terminal/Problems or rewrite the layout. There are no new
runtime dependencies, sockets, or proposed APIs. The tree needs no additional
client installation.

Unit checks cover resource URIs/icons, UTF-16 highlights, ordering/INVALID,
sessions/commands, and the central editor without splits. The real GUI report
and platform matrix are recorded separately in
[native-find-panel](../testing/native-find-panel.md). A link to the report does not
mean that unverified platforms have already been tested.

## Sources

- [Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [TreeItem and resourceUri](https://code.visualstudio.com/api/references/vscode-api#TreeItem)
- [showTextDocument](https://code.visualstudio.com/api/references/vscode-api#window.showTextDocument)
- [View registration locations](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/browser/viewsExtensionPoint.ts)
- [OpenSpec change](../../openspec/changes/use-native-find-panel/)
