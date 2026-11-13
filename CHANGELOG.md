# Changelog

## 0.4.5 — pre-release preparation

### Changed

- Prepare the Marketplace and Open VSX publication routes to distribute six
  platform-specific VSIX files for Windows, macOS, and Linux on x64 and ARM64,
  with a universal fallback retaining the existing ripgrep binary inventory.
- Verify each target's identity, version, release channel, and SHA-256 after
  publication, and report partial or uncertain publication rather than treating
  a skipped duplicate as proof of success.

This is a distribution change relative to pre-release 0.4.4; search and
replacement behavior, the extension ID, and the bundled client source and
protocol are unchanged. Platform gallery publication and client selection still
require their own checks. See the [pre-release notes](https://github.com/idfedorov09/jbsearch/blob/beta/docs/releases/v0.4.5-beta.md)
for release and platform-testing boundaries.

## 0.4.4 — pre-release preparation

### Changed

- Reduce the universal VSIX download by excluding the repository's demonstration
  screenshots and GIF. The extension icon and runtime resources remain bundled;
  README illustrations are loaded from HTTPS links when available.
- Add a non-publishing build matrix for six platform-specific VSIX files and a
  universal fallback. The existing Marketplace and Open VSX release routes still
  publish only the universal package; platform-targeted gallery distribution
  is not part of this pre-release.

Search and replacement behavior, the extension ID, and the bundled client are
unchanged. See the [pre-release notes](https://github.com/idfedorov09/jbsearch/blob/beta/docs/releases/v0.4.4-beta.md)
and [packaging verification](https://github.com/idfedorov09/jbsearch/blob/beta/docs/testing/platform-packaging.md)
for the Linux test and remaining Windows, macOS, and Remote boundaries.

## 0.4.3 — 2026-11-13

### Added

- Configure replacement preparation with `jbsearch.replace.prepareTimeoutMs`.
- Rerun a stale search from the modal and invoke Replace All from a match's
  context menu.

### Changed

- Keep completed Find Panel results in a deterministic snapshot through
  supported source changes; use **Rerun Search** to discover new matches.
- Track occurrence identity and refuse stale, ambiguous, pending, or unverified
  replacement actions. Replace All checks a fresh full-scope plan against the
  reviewed snapshot before applying it.
- Keep skipped-file warnings compact in the modal and retain bounded details in
  **Open in Find Panel**. Binary detection remains heuristic.
- Coalesce intermediate result updates and reduce replacement-plan processing
  overhead without removing replacement safeguards.

This stable release incorporates the 0.4.0 and 0.4.2 pre-release changes since
0.3.2. The extension ID and bundled client 0.1.0 are unchanged. The issue #3
Windows/WSL scenario and native VS Code acceptance of these changes remain
unverified. See the [release notes](docs/releases/v0.4.3.md).

## 0.4.2 — pre-release preparation

### Changed

- Keep skipped-file warnings compact in the search dialog while retaining the
  bounded details in **Open in Find Panel**.
- Coalesce intermediate search-result updates and avoid building replacement
  approval models for ordinary Find sessions. First results, completion and
  safety-state changes remain prompt.
- Reduce repeated comparison and retained copying work for replacement plans
  without removing full-scope preflight or stale-action checks.

This preparation supersedes the unpublished 0.4.1 draft and includes its modal
diagnostic correction. The extension ID and bundled client 0.1.0 are unchanged.
See the [release notes](https://github.com/idfedorov09/jbsearch/blob/beta/docs/releases/v0.4.2-beta.md)
and [performance verification](https://github.com/idfedorov09/jbsearch/blob/beta/docs/testing/search-performance.md).
Publication and real VS Code/platform acceptance remain separate decisions.

## 0.4.1 — pre-release preparation

This unpublished preparation was superseded by 0.4.2 before release.

### Changed

- Keep binary-exclusion and incomplete-input warnings compact in the search
  dialog, without listing skipped paths, per-file reasons, or omitted paths.
  Use **Open in Find Panel** to review the retained, bounded representative
  paths and reasons before replacing.

This is a presentation correction to published 0.4.0: no files are deleted, and
search eligibility, completeness classification, and replacement safeguards are
unchanged. Binary detection is still heuristic, and the bundled client remains
at 0.1.0. See the [release notes](https://github.com/idfedorov09/jbsearch/blob/beta/docs/releases/v0.4.1-beta.md) and
[pending native test checklist](https://github.com/idfedorov09/jbsearch/blob/beta/docs/testing/modal-diagnostic-summary.md).
Publication had not occurred when this entry was prepared on November 12, 2026;
check the registry and publication record for its later status.

## 0.4.0 — pre-release

### Added

- Configure replacement preparation with `jbsearch.replace.prepareTimeoutMs`.
- Rerun a stale search from the modal and invoke Replace All from a match's
  context menu.

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
acceptance; those checks remain open. See the [pre-release notes](https://github.com/idfedorov09/jbsearch/blob/beta/docs/releases/v0.4.0-beta.md).

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
