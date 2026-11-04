# Design

**Implementation in progress.** Authorized by the user on 2026-11-03. The
feasibility study found an approach for the required dialog: a native modal
editor with a custom webview from an ordinary VSIX. The internal open command was
accepted as an isolated dependency, not a guarantee of a stable API. A client UI
extension component was accepted for Remote preview on 2026-11-04; a separate
desktop application is unnecessary.

## Context

See [proposal.md](proposal.md). The extension implements Find/Replace and keeps
Check Installation; minimum VS Code 1.143.1, JavaScript/CommonJS, no compilation.
`npm ci` prepares the nested client UI VSIX. ADR
[0002](../../../docs/adr/0002-floating-search-host.md) explains the UI/API boundary,
and [0003](../../../docs/adr/0003-search-engine-and-session.md) the search API
boundary. A [real experiment](../../../docs/research/modal-editor-feasibility.md)
tested official VS Code 1.144.1 Linux/X11, including ordinary installation of the
probe VSIX without a Development Host. That experiment tested the container;
real Find/Replace test results are recorded separately in the
[matrix](../../../docs/testing/find-replace.md). Version 1.143.1 was additionally
tested with source registration; Remote SSH was tested separately. Client/server
grammar and theme separation is addressed by the resource channel from
[ADR 0006](../../../docs/adr/0006-remote-preview-theme.md); real test scenarios for
that channel are recorded separately. macOS/Windows are not considered verified
on the basis of Linux/X11 experience.

## Goals / Non-Goals

**Goals:** one main installation VSIX for stock VS Code with a nested client UI
component for Remote; a native container over the workbench; a shared window/tab
session; theme inheritance; search outside the UI thread. Use public APIs while
isolating the accepted modal opening exception in an adapter.

**Non-Goals:** DOM/inspector injection, an editor patch/fork, a separate application,
a custom full code editor, or duplicating the native settings page.

## Decisions

### 1. Native modal editor and support boundary

The chosen provider is a read-only CustomEditorProvider for a virtual session URI.
Its webview contains query/results/preview, while the VS Code modal part provides
the title, drag/resize, Esc, and moving to a tab. This is a container inside the
workbench, without a separate Alt+Tab window. Background modality and shortcut
behavior need UX testing.

Opening in the tested version:

```js
await vscode.commands.executeCommand(
  '_workbench.openWith', sessionUri, viewType,
  [-4, { pinned: true, modal: { size: { width: 820, height: 640 } } }]
);
```

This is the initial size from the modal adapter. `_workbench.openWith`, `-4`,
and modal options are an internal contract. There is no public ViewColumn.Modal;
createWebviewPanel and public vscode.openWith are not treated as equivalent.
The adapter must isolate this code, check the supported version and setting,
and handle errors. The command's existence alone is insufficient to verify
compatibility.

On 1.144.1, the default workbench.editor.useModal is some; ordinary files continue
to open in tabs. Do not enable all. If the user selected off, the internal route
silently opens a tab: before calling it, show the limitation and let the user
change the setting themselves. Do not change it automatically or treat a tab as
satisfying the requirement. Replace the adapter when a public modal API appears.

Internal workbench controls are still not exported. Semantic HTML controls with
VS Code theme variables are used: the container is native, while webview content
reproduces familiar fields/checkboxes/toolbars/lists. The compact layout does not
require an additional component library.

### 2. Architecture within one VS Code instance

```text
VS Code command / keybinding
             |
             v
ModalHostAdapter -> CustomEditorProvider -> webview: query/results/preview
                                                |
                                          webview messages
                                                |
                                                v
Extension host: SessionController -> SearchEngine / PreviewProvider
                                                |
                                                v
                                  files + dirty document snapshots

Remote only: PreviewProvider -> VS Code command -> client UI extension
                     ^                          -> client theme + grammars
                     |______ resource snapshot _______|

Native Move to Editor -> same custom editor + same SearchSession
```

Under Remote, the main workspace extension (`idfedorov09.jbsearch`) stays on the
server. The standard UI extension `idfedorov09.jbsearch-client`, with
`extensionKind: ["ui"]`, runs locally on the client and reads theme/grammar
resources through installation URIs and `workspace.fs`. A resource snapshot is
transferred through `jbsearch.client.previewResources`; changes to the theme,
token customizations, or extension set notify the server that an update is needed
through `jbsearch.previewResourcesChanged`. Queries and file contents are not
sent to the client component. A local workspace does not need this channel.

There is no GUI process launch, local HTTP server, or custom socket IPC.
The extension host validates webview messages, resultId, and allowed URIs;
the renderer has no Node/filesystem access. HTML requires CSP, local resources,
and safe snippet rendering. The UI cannot send arbitrary shell commands for
execution. Each session belongs to its own instance/workspace; multiple windows
must not share a “last active” result. Remote requires separate verification of
the search backend and resource channel, but not launching a graphical application
on the remote host.

### 3. Session

SearchSession: sessionId, workspace identity, query/options, scope, masks,
generation, result metadata, selectedResultId, status, revision. The host is the
source of truth; the UI subscribes to snapshots and batched events. Each new query
cancels the previous one, whose late events are discarded. Preview has its own
revision. Local patches have clientId/revision and host acknowledgements: a late
snapshot does not overwrite newer input. Replacement is unavailable until a patch
is acknowledged; new query/options immediately remove stale results.

On show, the controller opens a new view with a URI containing the stable session
id, and closes the previous view only after successful opening. This fixes both
the layout defect when returning a retained webview from a tab to the modal and
the opening race over Remote SSH. The session remains in the host; with
`useModal: off`, the previous tab is preserved. See ADR 0004 and the integration
test matrix.

“Open in tab” invokes native moveModalEditorToMain for the current custom editor;
the same UI retains the same session. Reopening uses the session URI.
This is not a string export to the native Search Editor. Repeating the action
reveals the existing tab for that session. “New tab” creates a separate session
with a copy of the query/filters, allowing queries to diverge. Repeating the
Find/Replace shortcut opens the current session in the modal.

When the webview reloads, query/filter/selection come from the live host session;
getState/setState preserve only results height. Esc closes the view: the host
keeps the session for the extension host's lifetime. Queries, options, results,
and sources are not written to disk. After a host restart, an empty session is
created, including when VS Code resolves an old CustomDocument URI again.
Preview context size is limited; the full file is not stored in webview state.

### 4. Layout and keyboard

The reference is the supplied Find/Replace in Files screenshots: compact
header/mask, then the query with a toolbar on the right, a second
replacement/preserve-case row in Replace, and scopes below; dense snippet rows
with filename/line on the right; preview below; a footer with Open in Find Window
(moving to an editor tab), Replace All, and Replace. Open Editors replaces the
inapplicable Module. Palette and fonts come from VS Code rather than being fixed
to JetBrains. Cmd+Shift+F is Find, and Cmd+Shift+R is Replace; Windows/Linux use Ctrl.


Top: title, match/file count, mask with a checkbox, advanced filters. Below is the
query textarea with New Line, Match Case, Whole Word, and Regex actions.
Then Workspace / Folder / Directory / Open Editors / Custom Scope.
`Module` is not copied literally: VS Code has no unified Java/Gradle module model.

Center: a flat compact “snippet — file — line” list. Below is a preview with path,
line numbers, and match highlighting; a divider changes its height. In the
preview, the border and background belong to one container for the found range
on each line. Nested TextMate tokens keep their colors and styles but do not draw
separate borders. Line text remains in one inline context so tab stops do not
depend on token or match boundaries. Adjacent ranges are not merged; a multiline
match has a fragment on each line, and zero width has a separate marker.
The match background in results and preview is mixed with transparent: it keeps
70% of the original theme color's opacity, including its alpha channel. This
softens the fill while preserving text colors and a distinct border; a transparent
current match remains transparent. States: empty query, searching, no results,
regex error, partial results, limit, cancellation, unavailable file, connection
loss. While searching, the counter says “Found N”; on completion, it shows the
final count; at a limit, “Showing first N.”

Key map:

| Context | Action |
| --- | --- |
| Tab / Shift+Tab | Move through controls in sequence |
| Space on a checkbox/toggle | Toggle; text provides an accessible name |
| Shift+Enter / New Line button | Insert an actual newline into the query |
| Enter in the query | Move to the first result; do not insert a newline |
| Arrows in the textarea | Ordinary caret movement; ArrowDown in a single-line query moves focus to results |
| Arrows in results | Select a match and update the preview |
| Enter / double-click on a result | Open the file at the exact range in the original VS Code instance |
| Cmd+Enter / Ctrl+Enter | Open the session in a tab |
| Esc | First close advanced filters; then the native VS Code command closes the modal |

Do not intercept Enter during IME composition. Tooltips describe the action,
not replace accessible labels. ARIA states, visible focus, screen-reader live
status, high contrast, and zoom are part of the UI. Preview is read-only: Tab
moves out of it.

Cmd+Shift+F / Ctrl+Shift+F conflicts with native Find in Files. The chosen setting
is `jbsearch.keybindings.overrideFindInFiles`, default true; when true, a declarative
keybinding with `when: config.jbsearch.keybindings.overrideFindInFiles` routes the
shortcut to JB Search. Show this choice during setup; the user can reassign the
command through Keyboard Shortcuts. The setting description contains separate
links to the editor filtered by the Find or Replace command. When a standard
shortcut is edited, VS Code preserves its `when`: the toggle continues to control
the shortcut until the user removes that condition. Do not edit keybindings.json
automatically or register a global OS hotkey.

### 5. Scopes and masks

Workspace means all roots; Folder means one explicitly selected workspace root;
Directory means a directory within a root; Open Editors means open text tabs,
not simply all loaded TextDocuments; Custom Scope means a named set of
include/exclude globs. Open Editors can include open files outside the workspace
and untitled buffers because the user explicitly selected this scope. Other
scopes retain root boundaries. A Remote URI does not become a local fsPath.
Open Editors applies the mask and explicit exclusions to file documents;
gitignore applies to files inside known roots. For untitled documents, the mask
checks the displayed name and file ignore rules do not apply; a mask mismatch
excludes the document.

A mask further intersects the scope; disabling it preserves its input text.
Syntax: patterns separated by `;`, such as `*.js;*.ts`, with OR within the list.
A pattern without `/` applies to basenames in all subdirectories; one with `/`
applies to root-relative paths, using `/` as the separator on every OS. `*`, `?`,
`**`, and brace alternatives such as `**/*.{js,ts}` are supported; negation `!`
is not. Exclusions have a separate field rather than regex. Custom
mask/include/exclude globs are case-sensitive on every OS, independently of the
text query's Match Case setting.

By default, `.gitignore`, `search.exclude`, `files.exclude`, and
search.useIgnoreFiles/useGlobalIgnoreFiles/useParentIgnoreFiles settings are
respected; “Respect exclusions” toggles them and the UI's general Exclude field.
Settings are combined separately for each workspace root, respecting boolean
false and conditional excludes. The current query's include and a named scope's
include intersect; OR applies only within each pattern set. The selected scope,
its include/exclude rules, and the mask remain constraints when ignore/exclusions
are disabled. Symlinks are not traversed. UTF-8 is supported; binary, UTF-16,
invalid-encoding, oversized, and unavailable files are counted as skipped.
Incomplete results are shown explicitly and block Replace All.

### 6. Search service

Bundled @vscode/ripgrep-universal is chosen for file enumeration with ignore
handling. One ECMAScript matcher runs in a disposable Node worker: UTF-16 offsets,
Unicode whole-word, case, multiline, and capture groups are identical for disk
and dirty snapshots. This revises the earlier PCRE2 proposal for consistent
Replace behavior. Leading (?s)/(?m)/(?i) are explicitly supported; other regex uses
JS semantics. Actual newline normalization handles CRLF; literal backslash-n is text.

The worker reads UTF-8, rejects binary/invalid encoding, and limits size, match
count, and time. Abort/timeout terminates the worker and enumeration process.
Regex does not run in the extension host. Ripgrep packages are not taken from
the VS Code installation or workspace PATH. Queries, snippets, and sources are
not written to logs.

Preview highlighting: vscode-textmate + vscode-oniguruma with published
grammar/theme contributions from installed extensions. Locally, resources come
from the current host. Under Remote, a snapshot of the client theme and grammars
comes from the UI component; the theme need not be installed on the server.
Server grammars keep priority for the same language/scope; client grammars supply
missing ones, including built-in grammars. The theme is resolved from the active
workbench.colorTheme with includes, JSONC/tmTheme, localized names, and
tokenColorCustomizations; frame colors come from --vscode-*.
Client content strings are parsed on the server without reading client paths
through server `fs`. The theme/registry cache is reset on resource-change
notifications; late previews do not replace the selected result. This is TextMate
syntax highlighting, without third-party extensions' LSP semantic tokens.
A language without a grammar is shown as plain text with an accessible fallback
message. Found ranges are drawn over syntax tokens, preserving text colors;
the selected line and match have different decorations. Preview is read-only,
with scrolling, line numbers, and a lower splitter. HTML is built safely without
interpreting file text as markup.

The 2026-11-04 study tested an alternative: a native `TextEditor` in the lower
group of the same modal. Client GitHub Dark Default and BL highlighting work
without the theme on the server, including a read-only snapshot of current
unsaved text. However, the tested route temporarily moves focus into the preview
and loses query characters; the original URI also allows accidental code edits.
A snapshot protects code but not input. The native move action makes search and
preview separate tabs. This adapter is not incorporated into production.
Another native route without focus changes is not implemented; a stable virtual
URI updated through a content provider remains a research idea without product
implementation or verification. The impossibility of all native previews has not
been established. See the [results](../../../docs/research/native-preview-feasibility.md)
and [Accepted ADR 0006](../../../docs/adr/0006-remote-preview-theme.md).
The chosen client resource channel uses two extension IDs, preserving the earlier
unified window/tab layout without focus transfers to a separate TextEditor.
Remote preview readiness is determined by checks in tasks.md, not acceptance of
an ADR alone.

`npm ci`/`npm run prepare:client` builds the client VSIX from `client/` and two pinned
runtime dependencies already installed in the root `node_modules`. The main VSIX
includes that package. On the first Remote preview, the server invokes native
`workbench.extensions.installExtension` with the nested VSIX URI;
`extensionKind: ["ui"]` places the client component locally. Command availability
is checked by executing it, which also activates the installed component.
Automatic installation is limited to one attempt per activation. The
**JB Search: Set Up Client Preview** command provides an explicit retry, while a
build hash mismatch allows updating the package and reporting the need for
Reload Window if old client code is still loaded. Setup errors appear in the
preview while search and match highlighting continue to work. Protocol v1,
resource sizes, and deadlines are described in the
[limits](../../../docs/implementation-limits.md).

Replace uses captured matches without rerunning regex in the extension host.
$1/$<name>/$$/$& and preserve case are supported; ordinary literal replacement
does not expand capture syntax. Document versions/full file snapshots and ranges
are checked before applying. Incomplete results prohibit Replace All; a complete
search is required first. The entire set is applied in one WorkspaceEdit, is not
saved automatically, and can be undone through VS Code. Repeated activation and
stale search generations are rejected.

### 7. Settings and theme

Persistent preferences use `contributes.configuration`, immediately providing a
UI in Settings and Settings JSON. The gear opens Settings with
`@ext:idfedorov09.jbsearch`. The window retains current-search settings, which live
in extension host memory. Queries and their history are not written to disk.
Manifest settings and defaults:

| Setting | Default | Purpose |
| --- | --- | --- |
| `jbsearch.keybindings.overrideFindInFiles` | true | Override the native shortcut at the user's choice |
| `jbsearch.search.debounceMs` | 150 | Delay after input |
| `jbsearch.search.maxResults` | 5000 | Match limit |
| `jbsearch.search.maxFileSizeMiB` | 2 | Read limit |
| `jbsearch.search.timeoutMs` | 10000 | Time for one run |
| `jbsearch.search.respectExcludes` | true | Initial exclusion filter value |
| `jbsearch.scopes` | [] | Named include/exclude sets, resource scope |

Numeric settings have minimum/maximum values. An executable path cannot be
specified through workspace configuration. General preferences have user/window
scope, named scopes have resource scope, and runtime toggles have session scope.
Sessions belong to this window's extension host; queries and results reset after
it restarts.

The modal and tab share one webview that receives `--vscode-*`, editor font
variables, and light/dark/high contrast classes from VS Code. Controls use
semantic HTML with CSS tokens, CSS/inline SVG icons, and text glyphs; neither
VSCode Elements nor Webview UI Toolkit is used. Switching Dark Modern → Light
Modern in the experiment updated the UI without a reload; custom themes and
HC/zoom need separate checks. The TextMate renderer loads token colors separately,
as described in section 6; no Monaco is embedded in the preview.

## Risks / Trade-offs

- [Internal modal API] → one adapter, tests of selected stable versions, an explicit
  unsupported state. Do not hide a tab fallback or guarantee future compatibility.
  The user approved this bounded exception.
- [Three operating systems] → Linux/X11 is proven; separately test Windows/macOS,
  Wayland, fullscreen, multiple windows, zoom, IME, and accessibility. The native
  frame reduces custom code but does not replace platform verification.
- [Webview controls] → test semantic HTML controls across themes, high contrast,
  and zoom; do not present them as exported internal workbench widgets.
- [Remote workspace] → the SSH extension host sees server file URIs and searches
  on the server. The client theme and missing grammars arrive through commands;
  a disabled UI component, installation failure, or unavailable resource produces
  an explicit explanation. Channel portability between different machines is
  verified separately from Linux Remote SSH loopback. WSL/Containers are not
  considered tested.
- [Regex and large repositories] → worker isolation, cancellation, limits, and
  partial status.
- [Lifecycle] → host session, revision checks, Esc/reopen/move/reload tests;
  do not rely solely on DOM preservation.

## Migration Plan

Find/Replace, scopes, preview, and moving to a tab are implemented; Check
Installation reports search and replace commands. Delivery is the main VSIX with
runtime dependencies and a nested UI VSIX for Remote. Packaging is checked
separately from execution. To update a locally installed extension, rebuild and
reinstall its VSIX. For development without reinstallation, VS Code can register
the source folder through Install Extension from Location; changes then require
Reload Window. See ADR 0004. Server-only code changes do not require rebuilding
the client package. After `client/` changes, `prepare:client` and preview setup
must run again; to develop the UI component itself, the `client/` folder can be
registered separately from source on the client's local host after installing
its dependencies.

Remaining checks are listed in tasks.md; results and limitations are in the
[matrix](../../../docs/testing/find-replace.md). With useModal: off, the adapter
explains the limitation and offers Settings. An unsupported version or opening
error is shown to the user; the modal is not automatically replaced by a tab.
Commits, releases, and publication are not performed at this stage.

## Implementation scope and remaining verification

The user approved the internal modal adapter and Find/Replace implementation.
Minimum VS Code 1.143.1 was tested with source registration on Linux/X11.
The target desktop platforms are macOS/Windows/Linux, and the bundled backend
contains their binaries; manual Windows/macOS testing remains a separate item
and is not considered complete because binaries exist or Linux runs succeed.
Over Remote SSH, search runs on the server's file host, while client grammar/theme
resources are delivered by the standard UI component through VS Code commands.
Testing between different machines remains open; Linux loopback does not replace
it. Semantic tokens are not implemented. The browser host is unsupported with
Node worker/ripgrep. The change cannot be archived before platform verification;
the implementation can be delivered with an honest test matrix.
