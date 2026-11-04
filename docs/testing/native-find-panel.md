# Native Find Panel validation

Current cross-platform evidence: [platform acceptance](platform-acceptance.md).
The dated Linux/X11 scenarios below are preserved as originally performed.

Date: **November 4, 2026**, extension **0.1.0**, branch `dev`.
Change: [use-native-find-panel](../../openspec/changes/use-native-find-panel/proposal.md),
decision: [ADR 0008](../adr/0008-native-find-panel.md).

Results moved from the central HTML tree into the native bottom Find panel.
The workbench draws file/folder icons, and clicking a match opens the actual
editor in the current central group without splitting. INVALID now has a prefix
before the snippet and an error icon colored by the active theme. This report
supersedes the placement checks in [find-window.md](find-window.md); earlier modal
and client theme bridge checks remain in [find-replace.md](find-replace.md).

## Environment and results

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | **145/145**, no skipped/cancelled tests |
| `npm run spec:check` | All 5 items passed strict validation |
| `npm run package` | Main and nested VSIX verified |
| Sources, VS Code **1.143.1** | **13/13 GUI scenarios** |
| Installed VSIX, VS Code **1.144.1** | **13/13 GUI scenarios** |
| Find icons compared with Explorer | **10/10 comparisons** in each run |

GUI checks were automated with Playwright in stock desktop VS Code on
**Linux x64, X11/Xvfb**. These were actual VS Code windows, not a browser copy
of the UI. The first run used an Extension Development Host with the main
extension loaded from source; the second used a normal window with the main
VSIX and test helper installed through the standard CLI. The main extension's
actual path in the second run was `extensions/idfedorov09.jbsearch-0.1.0`;
controller, provider, and preview matched the sources, and the manifest matched
after excluding installer metadata.

Separate user-data/extensions directories and synthetic workspaces were used in
`/tmp/jbsearch-native-panel-check` and `/tmp/jbsearch-native-panel-installed-check`.
The query `acceptDocz` returns **6 matches in 4 files**: JS, JSON, and BL. Here BL
uses a minimal test grammar and language icon copied from the language extension.
This is not a complete test of the real BL language server or semantic tokens.
The BL extension sources and the user's working profile were not changed.

Machine-readable reports: [sources](native-find-panel-source-results.json),
[installed VSIX](native-find-panel-installed-results.json), and
[package contents](native-find-panel-package-results.json).

## GUI scenarios

Every scenario passed in both distribution modes:

| # | Verified behavior |
| --- | --- |
| 1 | Open in Find Panel closes the modal, shows the bottom Find panel with 6 results, and focuses the tree; the original Alpha.js remains open and there is one editor group |
| 2 | Clicking a BL match opens Dadata.bl in the central group while retaining tree focus; Ctrl+Enter focuses and pins the editor; distinct syntax token colors and match fills are visible |
| 3 | JS, JSON, BL, and two folder icons match Explorer in Seti and a custom probe icon theme; switching the theme changes both areas |
| 4 | Light Modern and switching back to Dark Modern change workbench appearance without changing the search, source, or editor group count |
| 5 | The gear opens a separate draft; editing the query and pressing Esc preserves the original parameters and snapshot |
| 6 | Confirming a draft with Match Case updates the same search |
| 7 | Keep as a new search creates an independent search; native QuickPick switches saved snapshots |
| 8 | Hide Panel preserves sessions; Close Search releases only the selected one |
| 9 | Replace opens through the same modal and, after confirmation, retains the selected search ID and replacement |
| 10 | Editing the source leaves INVALID at the same position with the same ID; the prefix and red error icon are visible |
| 11 | Replace All is blocked with INVALID; Undo restores the same result and removes the prefix and icon |
| 12 | An arrow moves focus, Enter activates a match, and F4 selects the next one; a single replacement changes the selected BL result and Undo restores it |
| 13 | Rerun increments generation and rebuilds results while preserving the open document and one central group; matches remain highlighted |

![Find in the bottom panel with editable source in the center](assets/native-find-panel-dark.png)

![INVALID with a red error icon and prefix](assets/native-find-panel-invalid.png)

Also available: [light theme](assets/native-find-panel-light.png) and
[custom icons compared with Explorer](assets/native-find-panel-icons.png).

In Dark Modern, an unselected row's error icon uses `rgb(248, 81, 73)` from
`errorForeground`. For a selected row, the workbench overrides it for contrast:
the observed value was `rgb(204, 204, 204)`. The icon shape and INVALID prefix
remain. No custom CSS was added to bypass native selection rules.

## Test harness details

The test helper observes controller, editors, and settings through the VS Code
API; clicks, keys, and modal inputs use the actual UI. It is not distributed
with the product. For replacement checks, the harness waits for the separate
click, selection, and editor-opening IPC events to reach the extension host:
a direct helper command must not overtake a workbench click still being handled.

The first installed run stopped at icon theme switching. The cause was test
configuration: with a single `extensionDevelopmentPath` contributing iconThemes,
VS Code activates that extension's theme through a memory override. The global
setting changed, but the development theme overrode it in both Find and Explorer.
The helper was installed as a normal VSIX; the full repeated run passed 13/13.
Neither the product nor VS Code sources were changed to bypass this behavior.
The source run had two development paths, so forced theme selection was not active.

## Unit checks and distribution

Provider tests cover resource URIs, explicit File/Folder icons, UTF-16 label
highlights, deterministic order, INVALID/pending/Undo, actions, and sessions.
Controller tests cover independent drafts, a hidden panel, closure, validation,
replacement guards, and rollback when opening the panel fails. Waiting for modal
closure before focus and releasing a closed search are covered. Native preview
tests check the current group without a split, focus, rapid selection,
decorations, and no document opening during background validation. All are
included in the total of 145/145.

VSIX validation confirms the contributed Panel/view, native provider and preview,
and absence of old `src/ui/find-window.js`, `media/find-window.js`, and
`media/find-window.css`. The main package contains **71 files**, runtime
dependencies, and ripgrep for 12 platforms; executable mode is checked for Unix.
A binary's presence does not prove it runs on that OS. Package size and SHA-256
are recorded in the JSON report. The nested client package has **31 files,
82,935 bytes**; build
`f3ce5f362b4ed3364b9f13a89b949ac196c9180e2e03360b67702bd6d32ed4ab` is unchanged.

For a registered source folder, **Developer: Reload Window** is sufficient.
The version remains **0.1.0**; these server changes do not require reinstalling
the client. An installed VSIX remains a separate file snapshot.

## Manual checklist and validation boundaries

The following items require separate manual acceptance; this list itself does
not mean they have been tested:

- On macOS and Windows, check Cmd/Ctrl+Shift+F/R, modal focus, Esc, transfer to
  Panel, and return to the editor; repeat INVALID, Undo, and replacement checks.
- In physical Remote SSH/WSL/Container, compare the icon theme and language icons
  with client Explorer; change the client color and icon themes.
- With the real BL extension, verify semantic highlighting, completion,
  diagnostics, and saving in the actual central editor.
- With several existing editor groups, confirm that the source opens in the
  active group and user tabs/dirty buffers are not moved.
- Move Find using VS Code controls, hide/show the panel, and check saved sessions;
  test keyboard navigation and context menus with a screen reader.

Full GUI runs here cover Linux/X11 and the stated VS Code versions. They do not
cover macOS, Windows, Wayland, or physical Remote between separate machines.
Earlier modal Remote loopback checks are documented separately and do not prove
Find Panel behavior in Remote. The workbench controls native tree row sizes,
fonts, and selection colors. Sessions live in memory and reset on Reload Window.
New matches are added by explicit Rerun, not background validation.
