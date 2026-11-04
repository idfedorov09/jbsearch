# Design

## Context

Directory is already supported by the controller and worker. The new entry point
uses the existing modal adapter ([ADR 0002](../../../docs/adr/0002-floating-search-host.md))
and Find snapshot isolation ([ADR 0007](../../../docs/adr/0007-find-window-and-native-editor.md)).
The motivation and agreed scope are in proposal.md.

## Goals / Non-Goals

Pass the exact selected folder path to the existing Directory scope without
losing query flags or changing a saved search. No new renderer, search engine,
or client transport is required.

## Decisions

- A separate `jbsearch.findInDirectory` command accepts a URI from Explorer.
  The menu item is visible only for a single folder with the `file` or
  `vscode-remote` scheme and is hidden from the Command Palette. The existing
  Find shortcut remains unchanged. Using the selected resource instead of the
  active editor works correctly for multi-root workspaces.
- The controller checks the filesystem URI, workspace membership, and Directory
  through `workspace.fs.stat` before changing the session. The path is stored
  in `scope.directory`, rather than a glob mask: spaces and special characters
  do not alter the meaning of the search.
- Remote Explorer uses `vscode-remote`, and the standard URI transformer passes
  a filesystem URI to the workspace host. Remote URIs are not manually converted
  to local paths. This change does not support virtual filesystems.
- Launching from the context menu copies the current search parameters. The
  ordinary modal can be reused; a Find snapshot or its associated draft gets an
  independent session without `targetWindowId`. Changing the scope cancels the
  previous query and clears its results before opening, including repeated
  launches while opening. Search changes are blocked during replacement.

Stable APIs and VS Code 1.143.1 sources:

- [Menu contributions](https://code.visualstudio.com/api/references/contribution-points#contributes.menus)
- [When clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts)
- [Explorer context arguments](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/workbench/contrib/files/browser/views/explorerView.ts)
- [Remote URI transformer](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/base/common/uriTransformer.ts)

## Risks / Trade-offs

- A folder is unavailable or deleted while opening → show a clear error without
  falling back to Project. Search-time errors remain standard worker errors.
- Menu calls while opening → apply the scope before awaiting the shared opening
  operation; search the most recently selected folder.
- A single Directory cannot express multiple folders → hide the action for multiselect.
- Programmatic Remote URI checks do not prove physical Remote support or
  macOS/Windows acceptance; record those boundaries in the GUI report.

## Migration Plan

Bump the main extension to 0.2.0 and keep the UI client at 0.1.0: its code and
protocol do not change. There are no new settings or stored-data migrations.
Source installations update through Reload Window; an installed VSIX requires
reinstalling the new build.
