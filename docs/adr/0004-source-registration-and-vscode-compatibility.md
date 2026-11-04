# ADR 0004: Source registration and compatibility with VS Code 1.143.1

- Status: Accepted
- Date: 2026-11-03
- Supplements [ADR 0002](0002-floating-search-host.md) regarding the minimum version.

## Context

The user works in stock VS Code over Remote SSH and wants to load the extension
directly from source, as with `bl-language-support`, without rebuilding and
reinstalling a VSIX after each edit. In their profile, VS Code has registered BL as
a resource located at the source folder. The installed JB Search copy was a
separate VSIX; project changes do not update its files. The server runs VS Code
1.143.1, while JB Search previously required at least 1.144.1.

## Decision

For development in an ordinary window, use the native VS Code command
**Developer: Install Extension from Location…**, which registers the source
folder in the appropriate profile and extension host. After source changes, run
**Developer: Reload Window**. Registration is performed once per profile/host;
installing npm dependencies is still required. F5 remains a separate Extension
Development Host, and VSIX remains an independent delivery method.

The minimum was changed to **1.143.1** after a separate check of the official
desktop VS Code of that version on Linux/X11: folder registration, Reload Window
after a source edit, and 17 Find/Replace scenarios. This does not prove support
for earlier versions or other operating systems. Check Installation reports the
loaded path to distinguish the source folder from an installed VSIX.

Under Remote SSH, closing the previous retained webview before opening a new one
created a race: Find closed, but Replace did not appear. A fresh URI with a stable
session id is now created for the new view; the new view opens first, and the old
one closes only after successful opening. Query/options stay in the host session.
If the modal is unavailable, the existing tab is preserved. Concurrent shortcuts
share the pending open operation; the last selected action determines the mode.

## Remote SSH and limitations

In isolated loopback Remote SSH, the extension host and file worker run on the
server, and 5 matches were found in 3 files. On the server, `vscode.extensions.all`
does not contain grammars/themes available only to the client host. In that case,
the preview explicitly reports a fallback and does not provide the user's full
highlighting. Transferring available grammars and themes between hosts remains a
separate open task; unverified proposed APIs and DOM injection are not adopted
silently. This test does not verify WSL/Containers or macOS/Windows.

## Consequences

- No version bump is needed for each reload, and generated VSIX files need not be
  kept in Git.
- Restarting the window/extension host is still necessary for JavaScript and
  manifest changes; hot reload is not claimed. Dependency changes require updating
  `node_modules`.
- Register the source folder separately in another profile/on another host.
- VSIX releases remain snapshots and are updated separately.

## Sources

- [VS Code 1.143.1: Install Extension from Location](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts)
- [Current project checks](../testing/find-replace.md)
