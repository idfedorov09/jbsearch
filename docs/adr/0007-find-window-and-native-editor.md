# ADR 0007: Separate Find Window, result snapshot, and native editor on the right

Status: **Accepted**

Date: 2026-11-04

The tree and editor placement was revised in
[ADR 0008](0008-native-find-panel.md). The history of the earlier decision is
preserved below; the snapshot/INVALID/replacement contracts remain in effect.

## Context

The user authorized a separate results view approximating IntelliJ IDEA's Find:
a stable tree for sequential edits, editable source on the right, a gear button
to return to parameters, and INVALID markers for occurrences that no longer match.
Moving the same modal UI into a tab with a query form, a read-only preview below,
and another Open in Find Window button does not meet this use case.

This decision refines [ADR 0003](0003-search-engine-and-session.md) and
[ADR 0006](0006-remote-preview-theme.md): the compact modal keeps its own TextMate
preview and the client theme/grammar channel, while the results tab gets a
different UI and a native TextEditor. The failed native preview probe inside the
modal in ADR 0006 does not prove that an editor in a normal right editor group is
impossible: it uses a different opening and focus-preservation route.

Requirements and scenarios are in
[OpenSpec change implement-find-window](../../openspec/changes/implement-find-window/proposal.md).
Accepted means an adopted architecture decision and an authorized scope;
integration test results are described separately from that status.

## Decision

### Results view and lifecycle

Find Window is a separate central tab with a concise query summary, an action bar,
and a tree of “root → directories → file → occurrence.” It does not contain another
Open in Find Window button, a live search form, or a read-only preview below.
The UI uses VS Code colors, fonts, and accessibility conventions. Large trees are
virtualized; stable identifiers determine collapsed nodes and the selected
occurrence.

A completed search forms a snapshot: its query/options/scope and set of found
occurrences remain until an explicit rerun or confirmation of new parameters.
The initial sort is deterministic by root, path, and position. `initialOrder`
preserves a row's place after subsequent source changes. New matches are not
inserted automatically, and matches that disappear remain as INVALID.
Rerun Search creates a new snapshot with the current set of occurrences.

Positions are tracked in UTF-16 through TextDocumentChangeEvent. After a known
document is edited, its rows become pending, then the same search worker rechecks
the original condition, including regex context and captures. Matching current
offset:length values updates existing occurrences; a missing match makes the row
INVALID without removing it. Undo can restore the same row's validity. A deleted
file remains as unavailable INVALID; an error, timeout, or incomplete check leaves
an explicit unverified state. Generation, document version, and cancellation
prevent late responses from being applied. Expressions are not executed in the
extension host while tracking edits.

### Native source editor on the right

The user requested a preview in the Secondary Side Bar. In the tested stock
VS Code 1.143.1 and 1.144.1, the public API does not provide a way to place a native
TextEditor in that area: ViewColumn addresses the editor grid, while the Secondary
Side Bar contains view containers. The internal AUX_WINDOW_GROUP denotes a
separate system window, not this bar. An editor group is not presented as a
sidebar, and literal support for an unavailable placement is not promised.

The adopted adaptation is a separate **right editor group** beside the central
Find tab. This is an explicit difference from the literal request; a native editor
in the Secondary Side Bar remains outside this decision and requires a new API
or another separately accepted approach.

The adapter creates a new empty group on the right through
`workbench.action.newGroupRight`, then opens the source document through
`window.showTextDocument`. `ViewColumn.Beside` is not used to create it: it follows
the user's opening direction and may choose an existing group. The owned group
is tracked by TabGroup rather than a hardcoded column number. User tabs are not
moved or closed. If the owned group is closed, the next selection safely creates
a new one. The navigation queue discards stale requests.

Selecting a row preserves tree focus through preserveFocus; an explicit edit
action moves focus to the TextEditor. The source uses ordinary VS Code themes,
language extensions, saving, and Undo. Changes remain unsaved until the user's
normal save action. A modified preview tab is preserved when moving to another
result. Disposing the adapter removes its decorations and leaves source files
and unsaved tabs open.

Matches are native decorations over the real editor. On opening, the caret
collapses to the start of the range; a separate blue text selection does not cover
the highlighting. After edits, only decorations update, without reopening,
scrolling, or moving the caret. INVALID/pending entries are not highlighted as
verified matches. Colors come from the active theme's editor.findMatch*, and the
fill preserves 70% of the original alpha through CSS color-mix. Syntax token
colors and opacity are unchanged. Border CSS variables have an explicit
transparent fallback. The dependency of native decorations on theme CSS variables
is isolated in the adapter and checked when supported VS Code versions change.

### Returning to search parameters

The gear opens a modal draft with the parameters of a specific Find tab and a
reference to it. Editing the draft does not change the original snapshot's
parameters. Confirming without New Tab updates the original tab; Cancel/Esc
preserves its parameters and results. An explicit Open results in new tab creates
an independent session. The search or replace shortcut for an active Find tab
uses the same route, keeping the connection to the original search. File edits
continue to be tracked independently of the draft.

### Replacements

WorkspaceEdit requires current, verified ranges, captures, versions, and content
hashes. INVALID and pending entries do not allow individual replacement;
Replace All is blocked if the set contains such rows or the results are incomplete.
A content or version change between validation and application does not count as
a successful replacement. Search does not save files automatically; edits are
available to ordinary Undo. After its own replacement, the snapshot is rechecked:
rows do not disappear spontaneously and become INVALID if they no longer match,
until Rerun Search.

## Alternatives considered

1. **Reuse the modal UI in a tab.** Preserves the previous architecture but does
   not provide a separate working tree and leaves unnecessary transfer actions.
2. **Native TextEditor in the literal Secondary Side Bar.** The tested stock API
   has no corresponding placement target. DOM injection, a VS Code patch, or
   presenting a WebviewView as a full editor are not accepted.
3. **Embed editable Monaco in a webview/sidebar.** Requires separately coordinating
   the document model, dirty state, Undo, language features, and theme. A native
   editor already provides these properties without emulation.
4. **Rerun the whole search after every edit.** New rows and disappearing old rows
   break the stable order needed for bulk editing and cannot show INVALID in its
   former place.
5. **Edit the original snapshot's parameters directly from the modal.** Cancel
   would not preserve the original parameters; a separate draft with confirmation
   is therefore needed.

## Evidence and verification boundaries

An isolated adapter probe on 2026-11-04 ran in ordinary desktop VS Code
**1.143.1** (`e646868227c3e3a9e3f24277c8c7220be42c0be7`) and **1.144.1**
(`261c84cb1eddf11235f9e2c921425e9663fbe556`), Linux/X11 through Xvfb and Playwright.
It used separate user-data/extensions directories and synthetic sources in
`/tmp/jbsearch-find-preview-check`; the user's working profile and neighboring
BL project were unchanged. Probe processes were stopped after testing.

The checks confirmed a new horizontal right group even with
`openSideBySideDirection: down`, webview focus preservation during navigation,
preservation of existing dirty tabs and modified preview tabs when switching
files, ordinary editing/Undo, a collapsed caret, and decoration updates without
moving it. In both versions, the fill retained the theme alpha with a factor of
0.7: the original `#ff000080` and `#00ff0066` produced computed alpha values of
0.351373 and 0.28. Changing the theme color to `#0000ff40` produced 0.175686;
the syntax token's foreground/opacity did not change. With the border variable
absent, the computed border was `rgba(0, 0, 0, 0)`. The final adapter suite contains
13 unit tests; syntax checks also passed.

This is a separate verification of the adapter and placement contract. The full
product run for the tree, draft, INVALID tracking, and replacement is described in
the [Find Window report](../testing/find-window.md), separately from this probe.
Packaging results and the current matrix are in the same report. Compatibility
with macOS/Windows and Remote SSH between different physical machines is not
inferred from the Linux probe. Temporary original reports from this probe:
`/tmp/jbsearch-find-preview-check/summary.json`, `adapter-results-1.143.1.json`,
`adapter-results-1.144.1.json`, and `native-alpha-update-results*.json`.

## Consequences

Find Window has a separate lifecycle and UI, so the controller must separate the
live modal from saved results. This adds a range model, per-document revalidation,
and a small native preview adapter; no new runtime dependencies are required.
The shared right preview follows the active Find session, while independent tabs
keep their own parameters and snapshots.

The native source editor removes Find Window's need to reproduce themes and
language features in HTML. This does not replace the compact modal's TextMate
contract from ADR 0006. Delivery remains a standard extension for stock VS Code;
server JavaScript changes load after Reload Window with source registration.
Publication, commits, versioning, and external actions are outside this ADR.

## Sources

- [Public VS Code API: showTextDocument, TabGroups, and decorations](https://code.visualstudio.com/api/references/vscode-api).
- [Public API contract, VS Code 1.143.1](https://github.com/microsoft/vscode/blob/e646868227c3e3a9e3f24277c8c7220be42c0be7/src/vscode-dts/vscode.d.ts): ViewColumn addresses the editor grid.
- [Secondary Side Bar, VS Code 1.144.1](https://github.com/microsoft/vscode/blob/261c84cb1eddf11235f9e2c921425e9663fbe556/src/vs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart.ts): pane composites and view containers.
- [Editor opening targets, VS Code 1.144.1](https://github.com/microsoft/vscode/blob/261c84cb1eddf11235f9e2c921425e9663fbe556/src/vs/workbench/services/editor/common/editorService.ts): AUX_WINDOW_GROUP refers to a new window.
- [New Editor Group to the Right command, VS Code 1.144.1](https://github.com/microsoft/vscode/blob/261c84cb1eddf11235f9e2c921425e9663fbe556/src/vs/workbench/browser/parts/editor/editorActions.ts).
- [Native decoration CSS, VS Code 1.144.1](https://github.com/microsoft/vscode/blob/261c84cb1eddf11235f9e2c921425e9663fbe556/src/vs/editor/browser/services/abstractCodeEditorService.ts): DecorationRenderOptions CSS strings and ThemeColor resolution.
- [Official editor group documentation](https://code.visualstudio.com/docs/getstarted/userinterface#_editor-groups).
- [OpenSpec: Find Window requirements](../../openspec/changes/implement-find-window/specs/find-results-window/spec.md).
