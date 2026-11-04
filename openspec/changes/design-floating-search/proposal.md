# Proposal

Status: **Implementation in progress**, authorized by the user on 2026-11-03.
Find/Replace are implemented with the native modal approach; release readiness is
determined by task checks. Platform verification for macOS and Windows remains
open. The client theme/grammar channel was accepted and authorized on 2026-11-04;
its checks are tracked separately from the earlier native preview prototype.

## Why

File search needs a compact match list and preview, like JetBrains, that can be
freely moved and expanded into a VS Code tab. Before this change, the scaffold
only had an installation check.

## What Changes

Confirmed by the user:

- Cmd+Shift+F opens a compact floating dialog over the current editor window, like
  JetBrains Find in Files; it can be moved and resized.
- The UI primarily uses standard VS Code components, inheriting the current theme
  and styling; results and preview are inside the dialog.
- A separate editor window and a separate application are not automatically
  equivalent to this UX. “Open in tab” is an additional action.
- Target platforms from the start: macOS, Windows, and Linux.
- Scopes, file masks, a multiline query, case/word/regex toggles, keyboard controls,
  preview, and opening the same search in a tab are required.
- ADR/OpenSpec must accompany the project.

Accepted for implementation after technical verification:

- A native VS Code modal editor with a webview CustomEditorProvider was chosen.
  An ordinary VSIX was tested on stock VS Code 1.144.1 Linux/X11. Opening uses an
  internal command: the dependency was accepted with compatibility checks; it is
  not a public API.
- Native VS Code frame; semantic HTML controls with `--vscode-*` variables inside.
  They inherit webview styling; internal workbench widgets are not exported by
  the API.
- This approach needs neither a separate desktop application nor a detached editor.
  A small standard UI extension on the client was added for Remote preview; the
  server component continues to run search and build the unified webview.
- A shared search session for the dialog and tab.
- A local ECMAScript matcher in a separate worker, accounting for modified open
  documents; bundled ripgrep enumerates files with ignore handling.
- Native VS Code settings for persistent preferences, with quick filters in the
  window.
- Source folder registration through native Install Extension from Location and
  Reload Window without repeatedly reinstalling a VSIX. Remote SSH search was
  tested separately; the theme and missing grammars arrive from the client through
  VS Code commands.
- The client component reads the active theme, includes, token customizations, and
  grammar resources without receiving queries or found code. It is included in
  the main package and installed automatically through VS Code's native mechanism
  on the first Remote preview. Setup errors appear in the preview; a retry command
  is available.

Also confirmed: the layout should be as close as possible to JetBrains Find/Replace
in Files, with a preview below, syntax highlighting, and match highlighting;
Cmd+Shift+R / Ctrl+Shift+R opens Replace with Replace and Replace All.
Find and Replace shortcuts are enabled by default and can be disabled in Settings.

Outside this change: symbols/semantic search, VCS-only scopes, Marketplace,
automatic publishing, and editor DOM patches. The implementation includes real
search and replacement, not demonstration data.

## Capabilities

### New Capabilities
- `search-window`: floating window, workspace routing, keyboard UX, tab, and preview.
- `text-search`: queries, scopes, masks, ignore, results, and cancellation.
- `text-replace`: individual/bulk replacement, freshness checks, and native Undo.
- `search-preferences`: persistent settings and in-memory session state without on-disk history.

### Modified Capabilities
- `installation-check`: status reports available Find/Replace without starting a search.

## Impact

The change affects src/extension.js, contributes/configuration/keybindings,
the custom editor provider, modal command adapter, search/session/UI modules,
client UI component, nested packaging, checks, and documentation.
Remote uses two extension IDs: `idfedorov09.jbsearch` and
`idfedorov09.jbsearch-client`; the installed main VSIX contains the client VSIX.
Runtime dependencies: @vscode/ripgrep-universal, vscode-textmate,
vscode-oniguruma, and jsonc-parser. A separate desktop host is unnecessary.
Preview remains TextMate, without semantic tokens. The theme need not be installed
on the server. Remote verification between different machines remains open.

The manifest sets a minimum of VS Code 1.143.1. The introduction of modal editors
in 1.110 does not prove compatibility of the specific route across all versions:
1.143.1 and 1.144.1 Linux/X11 have been tested; macOS/Windows and later versions
need checks.

There is no public ViewColumn.Modal. The earlier conclusion that a patch/fork was
necessary was revised after a real test run. With useModal: off, the internal call
opens a tab; the adapter checks the setting before calling, explains the limitation,
and offers Settings without automatically changing the setting.
The user authorized implementation with this dependency. See
[ADR 0002](../../../docs/adr/0002-floating-search-host.md) and the
[experiment report](../../../docs/research/modal-editor-feasibility.md).
The client channel decision and native experiment boundaries are in
[ADR 0006](../../../docs/adr/0006-remote-preview-theme.md).
