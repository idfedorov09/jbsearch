<div align="center">

<img src="media/icon.png" width="112" height="112" alt="JB Search icon">

# JB Search

**JetBrains-style Find & Replace**<br>
for Visual Studio Code.

[![CI](https://github.com/idfedorov09/jbsearch/actions/workflows/test.yml/badge.svg?branch=dev)](https://github.com/idfedorov09/jbsearch/actions/workflows/test.yml?query=branch%3Adev)
[![VS Code 1.143.1+](https://img.shields.io/badge/VS_Code-1.143.1%2B-007ACC?style=flat-square)](#requirements--limitations)
[![License: MIT](https://img.shields.io/badge/license-MIT-2EA043?style=flat-square)](LICENSE)
[![Preview version](https://img.shields.io/github/package-json/v/idfedorov09/jbsearch/dev?style=flat-square&label=preview&color=F2C14E)](CHANGELOG.md)

[![Install](https://img.shields.io/badge/Install-007ACC?style=for-the-badge)](#installation)
[![GitHub](https://img.shields.io/badge/GitHub-24292F?style=for-the-badge&logo=github&logoColor=white)](https://github.com/idfedorov09/jbsearch)
[![Report a bug](https://img.shields.io/badge/Report_a_bug-6E40C9?style=for-the-badge)](https://github.com/idfedorov09/jbsearch/issues/new)
[![Donate via Tribute](https://img.shields.io/badge/Donate_via_Tribute-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/tribute/app?startapp=dTvL)

**Preview build** — follow development in `dev`.<br>
[Changelog](CHANGELOG.md) · [Release checklist](docs/release-readiness.md)

</div>

<!-- TODO: Add the hero GIF here. -->

## Why JB Search?

If you are used to JetBrains IDEs, searching across a project in VS Code can feel
unfamiliar. JB Search brings the floating Find/Replace workflow to VS Code:
refine a query, inspect matching code, and navigate results without losing your
place. The dialog follows your VS Code theme, while the results panel opens files
in the regular editor for editing, language support, and Undo.

## Demo

**Floating dialog**

<!-- TODO: Add a GIF showing the floating Find/Replace dialog. -->

Search, filter files, and switch scopes in a movable, resizable dialog.

**Preview and navigation**

<!-- TODO: Add a GIF showing code preview and result navigation. -->

Inspect highlighted matches, then open the native Find panel to work through results.

**Replace workflow**

<!-- TODO: Add a GIF showing Replace, INVALID results, and Undo. -->

Preview a replacement, apply it, and use the editor's Undo to restore your changes.

## Features

- **Floating Find/Replace dialog** — a compact, movable and resizable dialog with
  colors and fonts from your active VS Code theme.
- **Live search preview** — matching snippets and a read-only code preview with
  TextMate syntax highlighting and highlighted occurrences.
- **Native VS Code results panel** — a folder/file/result tree with your client's
  file icons. Selecting a result opens the source in the active central editor group.
- **Regex and multiline search** — Match Case, Whole Words, regular expressions,
  multiline queries, file masks, and include/exclude filters.
- **Named search scopes** — Project, Folder, Directory, Open Editors, and custom
  scopes. Open Editors includes unsaved and untitled text buffers.
- **Find from Explorer** — right-click a workspace folder and choose
  **JB Search: Find in Files…** to open the dialog with that directory selected.
- **Safe Replace & Undo** — replacements use VS Code edits and stay unsaved until
  you save them. Stale, unchecked, or incomplete results block unsafe replacements.
- **Remote SSH support** — searches run on the workspace host; a bundled client
  component supplies local theme rules and TextMate grammars for the dialog preview.

Double-click a result, or press `Enter` while the results list has focus, to open
the source at the matching range and close the dialog.

Use **Open in Find Panel** to keep a search. Results have a stable order and form
a snapshot: edits trigger revalidation, and occurrences that no longer match are
marked **INVALID**. Undo can restore them. **Rerun Search** rebuilds the snapshot
and discovers new matches. The **Edit Search** gear reopens that search's parameters;
**Keep as a new search** creates an independent session.

Configure limits and scopes in **Settings → JB Search**. For example:

```json
{
  "jbsearch.scopes": [
    {
      "name": "Sources",
      "include": ["src/**"],
      "exclude": ["**/generated/**"]
    }
  ],
  "jbsearch.search.maxResults": 5000
}
```

File masks accept patterns such as `*.js;*.ts`, `src/**`, and `**/*.{js,ts}`.

To search inside a specific folder, right-click it in **Explorer** and choose
**JB Search: Find in Files…**. The dialog selects **Directory** and shows the
folder path. The search includes its subfolders and keeps your query, file masks,
and options. This also works on a workspace root or a folder in another workspace
root. Saved searches in the Find panel remain independent. The menu action is
available on folders even when several resources are selected; it searches the
folder where you opened the context menu.

## Keyboard shortcuts

| Action | macOS | Windows / Linux | Context |
| --- | --- | --- | --- |
| Find in Files | `Cmd+Shift+F` | `Ctrl+Shift+F` | VS Code window |
| Replace in Files | `Cmd+Shift+R` | `Ctrl+Shift+R` | VS Code window |
| Open in Find Panel | `Cmd+Enter` | `Ctrl+Enter` | Search dialog |
| Insert a newline | `Shift+Enter` | `Shift+Enter` | Query or replacement field |
| Close the dialog | `Esc` | `Esc` | Search dialog |
| Open and focus the editor | `Cmd+Enter` | `Ctrl+Enter` | Find panel |
| Next / previous occurrence | `F4` / `Shift+F4` | `F4` / `Shift+F4` | Find panel |

The Command Palette also provides **JB Search: Find in Files** and
**JB Search: Replace in Files**. Use `Tab` / `Shift+Tab` to move between dialog
controls and `Space` to toggle an option.

Find/Replace shortcuts are enabled by default. Set
`jbsearch.keybindings.overrideFindInFiles` to `false` to disable both defaults,
or customize them in **Keyboard Shortcuts**. The JB Search setting includes
links to each command. A remapped default keeps its `when` condition unless you
remove it, so the setting continues to control that binding.

## Installation

Install a locally built VSIX or register the source folder. Marketplace
installation instructions will be added after publication.

### Install from VSIX

Building the package requires **Node.js 22.12+** and npm:

```sh
git clone --branch dev https://github.com/idfedorov09/jbsearch.git
cd jbsearch
npm ci
npm run package
```

In VS Code, open **Extensions → … → Install from VSIX…** and select the generated
`jbsearch-0.2.1.vsix` from the repository root. Run **Developer: Reload Window**,
then **JB Search: Find in Files**.

For Remote SSH, install JB Search in the remote window. The main package includes
**JB Search — Client Support** (`idfedorov09.jbsearch-client`), which is installed
locally when remote preview first needs it. No separate desktop application or
server-side installation of your client theme is required. If setup fails, run
**JB Search: Set Up Client Preview** and follow its message.

### Run from source

After cloning the repository and running `npm ci`:

1. Run **Developer: Install Extension from Location…** in the target VS Code window.
2. Select the repository root. In Remote SSH, select the folder on the remote host.
3. Run **Developer: Reload Window**.

Register the folder once per profile and host. After source changes, save your
files and reload the window; rebuilding or reinstalling a VSIX is unnecessary.
**JB Search: Check Installation** shows the loaded version and its actual location.
A separately installed VSIX is a copy and must be rebuilt and reinstalled to update.

For an isolated development window, open the repository and press `F5`.
See [Contributing](CONTRIBUTING.md) for client-component development and validation.

## Requirements & limitations

- **Desktop VS Code 1.143.1+** and a filesystem workspace are required. VS Code for
  the Web and virtual workspaces are unsupported.
- The floating dialog uses an internal VS Code command. Future compatibility is
  not guaranteed. `workbench.editor.useModal` must not be `off`; `some` is sufficient.
- The dialog's code preview is read-only and uses TextMate grammars. It does not
  embed semantic tokens or full editor features. Files opened from the Find panel
  use the regular editable VS Code editor and its language extensions.
- Regex uses **ECMAScript** semantics. Expressions written for Java or PCRE2
  may need changes. Regex replacement supports capture groups, named groups, and newline/tab escapes;
  with Regex disabled, replacement text is literal.
- File search supports **UTF-8**. Binary, UTF-16, oversized, and inaccessible files
  are reported as skipped; symlinks are not followed. Replace All requires a complete
  result set. Narrow the scope or adjust limits when a search is incomplete.
- Saved searches live in memory and are cleared when the extension host restarts.
  Changes to closed files outside the editor may require **Rerun Search** to rebuild
  result positions.
- GUI validation has been performed on **Linux/X11**. macOS, Windows, and Remote SSH
  between separate physical machines still need acceptance testing. Linux Remote
  loopback checks do not replace that testing. WSL and Dev Containers are unverified.

See the [implementation limits](docs/implementation-limits.md),
[Find/Replace test matrix](docs/testing/find-replace.md), and
[native Find panel validation](docs/testing/native-find-panel.md) for details.

## Privacy

JB Search runs searches in the workspace extension host. With Remote SSH, that
host is your remote server. It does not send search queries or file contents to
external search services and includes no extension telemetry or analytics.

The Remote client component exchanges theme rules and TextMate grammar resources
through VS Code commands. It does not receive your search queries or source files.
Search history is kept in memory rather than written to disk. The search executable
is bundled with the extension and is not downloaded when you run a search.

## Roadmap

Current priorities:

- Complete acceptance testing on macOS and Windows.
- Validate Remote SSH between separate physical machines, including client setup,
  theme changes, Replace, and Undo.
- Add demo recordings and complete Marketplace release preparation.

Progress and outstanding checks are tracked in the
[release checklist](docs/release-readiness.md) and [OpenSpec changes](openspec/changes/).

## Contributing

Bug reports, reproducible examples, platform testing, and pull requests are welcome.
Start with [CONTRIBUTING.md](CONTRIBUTING.md). Development happens in `dev`;
`master` is the stable branch.

Keep the root **README.md in English**, including future sections and examples.
Architecture decisions live in [ADR](docs/adr/README.md), while requirements and
changes are tracked with [OpenSpec](openspec/README.md). Internal development and
validation documents are currently in Russian.

Extension artwork: [PNG icon](media/icon.png) and [SVG source](docs/artwork/icon.svg).

## Support development

If JB Search makes your daily work easier, you can support its development
with a donation via Tribute.

[![Donate via Tribute](https://img.shields.io/badge/Donate_via_Tribute-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/tribute/app?startapp=dTvL)

You can also star the repository, share JB Search with other developers, report
reproducible bugs, or help test it on your platform. Feedback about the search and
replacement workflow is especially useful while the first release is being prepared.

## License

[MIT](LICENSE) © 2026 idfedorov09.
