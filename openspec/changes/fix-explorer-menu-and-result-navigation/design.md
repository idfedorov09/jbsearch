# Design

## Context

The 0.2.0 menu guard contains `!listMultiSelection`, so the item disappears when
Explorer retains multiple selected resources. The `JB Search` command category is
not automatically added to the context-menu label.

In the modal, `select()` and the host echo call `renderRows()`, which recreates rows.
The first click removes the DOM target before the second click. After fixing the
click, the modal must also be explicitly exited before opening the source;
otherwise, its editor group may be active. Existing contract:
[search-window](../design-floating-search/specs/search-window/spec.md).

## Goals / Non-Goals

Restore navigation and make the context-menu entry available for the folder
selected with the mouse. The dialog remains the same native modal
([ADR 0002](../../../docs/adr/0002-floating-search-host.md)); Find Panel keeps the
existing TextEditor ([ADR 0008](../../../docs/adr/0008-native-find-panel.md)).

## Decisions

- Set the title to **JB Search: Find in Files…**. Keep the built-in item visible:
  the extension's public menu contribution is used only for its own command.
- Remove the `!listMultiSelection` guard; retain folder and filesystem scheme
  checks. Explorer's first argument is the URI of the context-menu row; the
  selection array does not change Directory. This defines a single scope,
  rather than a union of folders.
- Preserve the DOM identity of visible rows by result id within a generation.
  Update selection styling and remove rows that leave the virtual viewport;
  do not delay single clicks with a timer. Test browser double click.
- Pass the generation when activating a result. The controller checks the
  generation and text validity before closing the modal, waits for its tab to
  close, and opens the source in the restored central group with focus and the
  required range. Enter uses the same path. An error must not silently close a
  working search.

Stable API sources:
[contributes.menus](https://code.visualstudio.com/api/references/contribution-points#contributes.menus),
[Explorer context arguments 1.143.1](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/workbench/contrib/files/browser/views/explorerView.ts),
[TabGroups.close and showTextDocument](https://code.visualstudio.com/api/references/vscode-api).

## Risks / Trade-offs

- Host echo between clicks → reuse the existing row and check in a real webview.
- Query changes between the click and handling → use a generation guard, check
  the text, and refresh results instead of navigating to an invalid range.
- Multiple selected resources → document the context target; check mixed
  selections and folder targets in the GUI, without including the second folder in scope.
- Forced copying of remote paths → absent: use the workspace-host URI supplied
  by VS Code, as in 0.2.0.
- macOS/Windows/physical Remote → separate acceptance; Linux GUI does not replace it.

## Migration Plan

Main extension 0.2.1; UI client remains 0.1.0. There are no new settings,
dependencies, or data migrations. Sources update through Reload Window; a VSIX
updates by installing the new package.
