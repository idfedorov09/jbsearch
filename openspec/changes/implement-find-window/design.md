# Design

## Context

Before this change, CustomEditorProvider showed one webview for both the modal
and a regular tab, and SearchController automatically reran searches after file
changes. INVALID support requires a separate lifecycle for saved results.
See proposal.md for motivation and scope, and ADR 0007 for the architectural decision.

## Goals / Non-Goals

**Goals:** separate the editable results snapshot from live modal search, retain
the worker/ripgrep engine, and use a real TextEditor without emulating LSP or
themes. Retain standard installation from source.

**Non-Goals:** embedding Monaco in a sidebar, DOM injection, or modifying VS Code;
presenting a regular editor group as the Secondary Side Bar; inferring platform
compatibility from a single Linux run.

## Decisions

1. Separate Find Window resources without the search form or bottom preview.
   The tree is virtualized, sorted by root/path/position, and given stable ids.
   The snapshot includes the original query/options/scope and immutable initialOrder.
   Closing the last Find panel releases the snapshot and validation. The panel
   type is fixed when it is created: the original modal may close before the new
   Find panel resolves, and this transition must not delete the transferred session.
   A new generation synchronizes keyboard focus with the first selected result;
   ordinary file revalidation preserves focus and scroll position.
2. A dedicated right editor group is created through public editor commands and
   showTextDocument. Public TabGroups help locate and reuse the group. An arbitrary
   active user group must not be reused. Preview is a real file with preserveFocus
   when selected in the tree; Enter transfers focus. Decorations use the
   editor.findMatch* CSS variables and color-mix with 70% of the original fill alpha.
   Syntax and border colors are not dimmed; a missing border has an explicit
   transparent fallback. Updating decorations does not move the caret.
3. Saved results track UTF-16 offsets through TextDocumentChangeEvent. A changed
   document is revalidated by the same engine in the worker using the original
   query: an exact current offset:length match updates metadata; a missing range
   becomes invalid. New occurrences are not added. Revision/AbortController rejects
   late responses. Regex must not execute in the extension host; errors/timeouts
   leave an explicit unverified state. While the initial full search is still
   running, editing a participating file restarts snapshot construction. After
   completion, snapshot membership is fixed until Rerun. Undo restores geometry
   from a bounded coordinate history (the last 128 states plus the initial state),
   without retaining document text.
4. The gear button creates a draft modal with targetWindowId without replacing
   snapshot parameters. Confirm copies current parameters/results to the target;
   Cancel transfers nothing. The ordinary shortcut also uses this route for the
   active Find. New Tab creates an independent session. Searching when the gear
   opens does not clear the snapshot.
5. Snapshot search replacements block invalid/pending results and use new versions,
   hashes/ranges after validation. The modal retains its previous live behavior.
   Refresh reruns the full search; after its own replacements, the snapshot is
   also validated so replaced occurrences display as INVALID until refresh.

API evidence: [showTextDocument/TabGroups/decorations](https://code.visualstudio.com/api/references/vscode-api),
[editor groups](https://code.visualstudio.com/docs/getstarted/userinterface#_editor-groups),
[View Container](https://code.visualstudio.com/api/ux-guidelines/views).
Exact versions and probe results are recorded in docs/testing/find-window.md.

## Risks / Trade-offs

- A native editor inside the literal Secondary Side Bar is unavailable → an
  explicitly disclosed right editor group; sidebar placement remains an unmet
  request, without a fictitious API.
- User moves/closes groups → check live TabGroups before each reveal and safely
  recreate only the owned preview group.
- Multiple Find tabs → independent query/snapshot/draft; the shared right native
  preview follows the last active Find, and decorations do not leak into other files.
- Undo/range deletion → retain tombstone geometry and add regression checks.
- Incomplete validation → pending/error state and no stale replacement.

## Migration Plan

New tabs receive a dedicated UI and a resource with query `view=findWindow`.
The renderer is selected through URLSearchParams(uri.query): VS Code URI's
toString() encodes the equals sign in the query and cannot be reparsed through
the standard URL. Reload Window restores the tree, but in-memory query/results
reset; persistent search history is not added. If opening a tab fails, the
original modal session and its URI are restored. The version and Marketplace
remain unchanged. Documents are edited through the ordinary editor/WorkspaceEdit.
