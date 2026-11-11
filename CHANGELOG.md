# Changelog

## 0.3.3 — pre-release

### Changed

- Keep completed Find Panel results as a stable snapshot through source events;
  new matches appear after an explicit Rerun Search.
- Track match identity across supported edits and fail closed on stale, ambiguous,
  pending, or unverified actions rather than silently adopting a different match.
- Bind replacement actions to the reviewed result snapshot. Replace All performs
  a fresh full-scope preflight and refuses when the approved plan differs.
- Preserve result presentation where supported and retain explicit limits on
  native TreeView handle delivery, selection, and scroll behavior.

The extension ID is unchanged and the bundled client remains at 0.1.0. Automated
Linux checks are not Windows, WSL, macOS, physical Remote, or native-editor
acceptance; those checks remain open. See the [pre-release notes](https://github.com/idfedorov09/jbsearch/blob/beta/docs/releases/v0.3.3-beta.md).

## 0.3.2 — 2026-11-09

### Fixed

- Exclude identified binary files, including ZIP/DOCX containers, from text
  search without disabling Replace All solely because they are present.
- Show bounded path-and-reason diagnostics for binary exclusions and for inputs
  that leave results incomplete. Unsupported encodings, read errors, unknown
  oversized inputs, and existing validity checks continue to block replacement.

Binary detection is heuristic: some binary data can look like text, and text can
be mistaken for binary. Review exclusions before bulk replacement. The bundled
client remains at 0.1.0.

## 0.3.1 — 2026-11-09

### Changed

- Added a manually dispatched GitHub Actions workflow for publishing to Open
  VSX, with a token for the first release and trusted publishing afterward.

The extension's search and replace behavior and bundled client are unchanged.

## 0.3.0 — 2026-11-08

### Added

- Named scopes can target a workspace folder using an optional `root`: its exact,
  case-sensitive name or workspace alias. Include/exclude patterns are relative
  to that folder; scopes without `root` still search all folders.
- Invalid or ambiguous roots stop the search. If a root changes after a search,
  rerun it before replacing results.

Older versions ignore `root` and may search all folders. Remove rooted scopes or
use **Folder** scope before downgrading.

## 0.2.3 — 2026-11-04

### Changed

- Expanded Marketplace keywords with JetBrains, IntelliJ, GoLand, Find/Replace,
  regex, code search, floating search, and live preview phrases.
- Shortened the Marketplace description while keeping the existing display name.

The extension ID, search/replace functionality, and bundled client 0.1.0 are unchanged.

## 0.2.2 — 2026-11-04

### Changed

- Renamed the Marketplace display name to **JB Search — JetBrains-style Find
  & Replace**, preserving the extension ID and existing installations.
- Removed the Marketplace Preview label for the stable release.
- Made Marketplace installation and a short Usage section the README defaults;
  moved source and VSIX development instructions to CONTRIBUTING.
- Removed the duplicated README icon and preview copy; the public CI badge now
  tracks `master` and the version badge tracks the published stable GitHub release.
- Recorded user-confirmed macOS/Linux use separately from automated Linux GUI
  coverage. Windows execution and physical Remote acceptance remain unverified.

The search/replace runtime and bundled client 0.1.0 are unchanged.

## 0.2.1 — 2026-11-04 (GitHub preview)

### Fixed

- Explorer context search stays available when several resources are selected:
  Directory uses the folder where the context menu was opened.
- The menu item is explicitly named **JB Search: Find in Files…** to distinguish
  it from the built-in Find in Folder.
- Double-clicking a modal result or pressing Enter in the results list opens
  the source at the matching range in the central editor; the dialog closes
  after the result's validity has been checked.

## 0.2.0 — Development milestone

### Added

- **Find in Files…** in the context menu of a single Explorer folder: opens Find
  with Directory selected and the exact folder path, including subfolders and
  roots of a multi-root workspace. Query, masks, and flags are preserved.
- Context search is independent of saved Find Panel searches and their drafts.
  An invalid or unavailable folder does not widen the search to the entire project.

The client UI component remains at 0.1.0: its code and protocol are unchanged.
Checks and platform boundaries: [Explorer Find in Files](docs/testing/explorer-find-in-files.md).

## 0.1.0 — Development milestone

The first functional JB Search development milestone. The first GitHub preview
release is 0.2.1.

### Added

- Extension icon from the supplied SVG; a 256×256 PNG is included in the VSIX.
- Compact, movable, resizable JetBrains-style floating Find/Replace dialog
  using the current VS Code theme.
- Find with Cmd/Ctrl+Shift+F and Replace with Cmd/Ctrl+Shift+R; bindings are
  configurable in the native Keyboard Shortcuts editor.
- Project, Folder, Directory, Open Editors, and named scopes; file masks,
  include/exclude, multiline queries, Match Case, Whole Words, and regex.
- Syntax and match highlighting in the dialog preview; client themes and
  TextMate grammars are available in Remote through the bundled client component.
- Bottom Find panel with a native tree and client theme file icons;
  navigating to a result opens the actual editable source in the center.
- Independent saved searches, history switcher, Rerun, and a gear action
  for editing a particular search's parameters.
- Stable result order, position tracking after edits, prominent INVALID status
  with an error icon, and match recovery after Undo.
- Replace/Replace All through WorkspaceEdit, with validity checks that block
  replacement of invalid, unchecked, or incomplete results.
- Installation from a source folder, refreshed through Developer: Reload Window.

### Candidate limitations

- Requires desktop VS Code **1.143.1+** and a filesystem workspace; VS Code for
  the Web and virtual workspaces are unsupported.
- The floating dialog uses an internal VS Code command and TextMate preview
  without semantic tokens. The central editor retains normal language features.
- Search history lives in memory and resets after Reload Window.
- Full GUI checks ran on Linux/X11. Acceptance on macOS, Windows, and physical
  Remote between separate machines remains open; earlier Remote loopback checks
  cover the client preview and do not replace that acceptance.

Details: [README](README.md), [implementation limits](docs/implementation-limits.md),
and [release readiness](docs/release-readiness.md).
